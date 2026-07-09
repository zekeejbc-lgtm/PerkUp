import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, getDoc } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Gift, ArrowLeft, Camera, CameraOff, Minus, Plus, MapPin, CheckCircle2, AlertTriangle, User, UserCircle, Trash2, Search, Cake, Sparkles, Trophy } from "lucide-react";
import { isSecureCustomerQr, normalizeCustomerUsername, redeemCustomerScan } from "@/src/lib/secureQr";
import { getBirthdayStatus } from "@/src/lib/birthday";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { supabase } from "@/src/lib/supabase";

type OfflineScan = {
  id: string;
  points: number;
  timestamp: number;
  storeId: string;
  promotionId: string;
};

type RedemptionInput = {
  scanToken?: string;
  manualUsername?: string;
};

type ScannerLocation = {
  lat: number;
  lng: number;
  accuracy?: number;
};

const LEGACY_OFFLINE_QUEUE_KEY = "offlineScanQueue";
const OFFLINE_QUEUE_PREFIX = "perkup:offlineScanQueue";
const OFFLINE_QUEUE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_OFFLINE_QUEUE_ITEMS = 100;
const MAX_POINTS_PER_SCAN = 100;
const DUPLICATE_SCAN_COOLDOWN_MS = 20000;
const DUPLICATE_SCAN_ALERT_COOLDOWN_MS = 1500;

const getOfflineQueueKey = (storeId: string, promotionId: string) =>
  `${OFFLINE_QUEUE_PREFIX}:${storeId}:${promotionId}`;

const isValidCustomerQr = (scanToken: string) => isSecureCustomerQr(scanToken);

const normalizePoints = (points: number) =>
  Math.min(Math.max(Math.trunc(Number(points) || 1), 1), MAX_POINTS_PER_SCAN);

const distanceInMeters = (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => {
  const earthRadiusMeters = 6371e3;
  const lat1 = from.lat * Math.PI / 180;
  const lat2 = to.lat * Math.PI / 180;
  const dLat = (to.lat - from.lat) * Math.PI / 180;
  const dLon = (to.lng - from.lng) * Math.PI / 180;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
};

const getPromotionGeofence = (promo: any, store: any) => {
  const promoLat = Number(promo?.geofenceLat);
  const promoLng = Number(promo?.geofenceLng);
  if (promo?.geofenceEnabled && Number.isFinite(promoLat) && Number.isFinite(promoLng)) {
    return {
      lat: promoLat,
      lng: promoLng,
      radiusMeters: Number(promo.geofenceRadiusMeters || 500),
      label: "promotion",
    };
  }

  const storeLat = Number(store?.lat);
  const storeLng = Number(store?.lng);
  if (Number.isFinite(storeLat) && Number.isFinite(storeLng)) {
    return {
      lat: storeLat,
      lng: storeLng,
      radiusMeters: 500,
      label: "store",
    };
  }

  return null;
};

const getCardProgress = (card: any, promo: any) => {
  const required = Math.max(Number(promo?.requiredStamps || 10), 1);
  const stars = Math.max(Number(card?.stars || 0), 0);
  return {
    required,
    stars,
    percent: Math.min((stars / required) * 100, 100),
    remaining: Math.max(required - stars, 0),
    complete: stars >= required,
  };
};

const getCustomerLabel = (card: any) => {
  const username = String(card?.customerUsername || card?.username || "").trim();
  if (username) return `@${username}`;
  const customerId = String(card?.customerId || card?.id || "").trim();
  return customerId ? `${customerId.slice(0, 8)}...` : "Customer";
};

const normalizeCardRows = (rows: { id: string; data: Record<string, unknown> | null }[]) =>
  rows.map((row) => ({ id: row.id, ...(row.data || {}) }));

const normalizeOfflineQueue = (
  value: unknown,
  storeId: string,
  promotionId: string,
): OfflineScan[] => {
  if (!Array.isArray(value)) return [];

  const cutoff = Date.now() - OFFLINE_QUEUE_TTL_MS;

  return value
    .map((item): OfflineScan | null => {
      if (!item || typeof item !== "object") return null;
      const scan = item as Partial<OfflineScan>;
      const customerId = String(scan.id || "").trim();
      const timestamp = Number(scan.timestamp || 0);

      if (!isValidCustomerQr(customerId)) return null;
      if (!Number.isFinite(timestamp) || timestamp < cutoff) return null;
      if (scan.storeId && scan.storeId !== storeId) return null;
      if (scan.promotionId && scan.promotionId !== promotionId) return null;

      return {
        id: customerId,
        points: normalizePoints(Number(scan.points || 1)),
        timestamp,
        storeId,
        promotionId,
      };
    })
    .filter((item): item is OfflineScan => Boolean(item))
    .slice(-MAX_OFFLINE_QUEUE_ITEMS);
};

const readOfflineQueue = (key: string, storeId: string, promotionId: string): OfflineScan[] => {
  try {
    return normalizeOfflineQueue(JSON.parse(localStorage.getItem(key) || "[]"), storeId, promotionId);
  } catch (_error) {
    localStorage.removeItem(key);
    return [];
  }
};

const writeOfflineQueue = (key: string, queue: OfflineScan[]) => {
  try {
    if (queue.length === 0) {
      localStorage.removeItem(key);
      return;
    }

    localStorage.setItem(key, JSON.stringify(queue));
  } catch (error) {
    console.warn("Failed to persist offline scan queue.", error);
  }
};

export default function StaffPromotionScan({ store }: { store: any }) {
  const { id } = useParams();
  const [promo, setPromo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Geofencing state
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isWithinGeofence, setIsWithinGeofence] = useState<boolean>(true); // Default true if no store coordinates
  const [scannerLocation, setScannerLocation] = useState<ScannerLocation | null>(null);

  // Scanner state
  const [isScannerActive, setIsScannerActive] = useState(false);
  const [pointsToAdd, setPointsToAdd] = useState(1);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [scannedCustomer, setScannedCustomer] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [manualUsername, setManualUsername] = useState("");
  const [manualError, setManualError] = useState("");

  // Batch & Feedback state
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchQueue, setBatchQueue] = useState<{ id: string, points: number }[]>([]);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showScanSuccess, setShowScanSuccess] = useState(false);
  const duplicateScanRef = useRef<{ id: string; scannedAt: number; alertedAt: number } | null>(null);

  // Offline Sync Queue
  const [offlineQueueKey, setOfflineQueueKey] = useState("");
  const [offlineQueue, setOfflineQueue] = useState<OfflineScan[]>([]);

  // Promotion Customers state
  const [promoCustomers, setPromoCustomers] = useState<any[]>([]);

  const loadPromoCustomers = useCallback(async () => {
    if (!store?.id) return;

    const { data, error } = await supabase
      .from("cards")
      .select("id,data")
      .eq("data->>storeId", store.id);

    if (error) throw error;
    setPromoCustomers(normalizeCardRows((data || []) as { id: string; data: Record<string, unknown> | null }[]));
  }, [store?.id]);

  useEffect(() => {
    if (!store?.id || !id) {
      setOfflineQueueKey("");
      setOfflineQueue([]);
      return;
    }

    const key = getOfflineQueueKey(store.id, id);
    setOfflineQueue(readOfflineQueue(key, store.id, id));
    setOfflineQueueKey(key);
    localStorage.removeItem(LEGACY_OFFLINE_QUEUE_KEY);
  }, [store?.id, id]);

  useEffect(() => {
    if (!offlineQueueKey) return;
    writeOfflineQueue(offlineQueueKey, offlineQueue);
  }, [offlineQueue, offlineQueueKey]);

  useEffect(() => {
    async function init() {
      if (!id || !store) return;
      try {
        const promoRef = doc(db, "promotions", id);
        const promoSnap = await getDoc(promoRef);
        if (promoSnap.exists()) {
          setPromo({ id: promoSnap.id, ...promoSnap.data() });
        }

        await loadPromoCustomers();
      } catch (err) {
        console.error("Failed to load promotion data", err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [id, store, loadPromoCustomers]);

  useEffect(() => {
    if (!store?.id) return;

    const channel = supabase
      .channel(`staff-promotion-cards:${store.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cards" },
        (payload) => {
          const newRow = payload.new as { id?: string; data?: Record<string, unknown> } | null;
          const oldRow = payload.old as { id?: string; data?: Record<string, unknown> } | null;
          const rowData = newRow?.data || oldRow?.data || {};

          if (String(rowData.storeId || "") !== store.id) return;

          if (payload.eventType === "DELETE") {
            setPromoCustomers((current) => current.filter((card) => card.id !== oldRow?.id));
            return;
          }

          if (!newRow?.id) return;
          const nextCard = { id: newRow.id, ...(newRow.data || {}) };
          setPromoCustomers((current) => {
            const existingIndex = current.findIndex((card) => card.id === nextCard.id);
            if (existingIndex === -1) return [nextCard, ...current];
            const next = [...current];
            next[existingIndex] = nextCard;
            return next;
          });
        },
      )
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          void loadPromoCustomers();
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Customer progress realtime subscription failed", error);
          void loadPromoCustomers();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [store?.id, loadPromoCustomers]);

  useEffect(() => {
    const handleOnline = async () => {
      if (offlineQueue.length > 0) {
        const queueCopy = [...offlineQueue];
        setOfflineQueue([]); // Clear early to prevent duplicates
        let failed = [];

        for (const item of queueCopy) {
          try {
            await processPointsForCustomer(item.id, item.points);
          } catch (e) {
            console.error("Offline sync failed for", item.id, e);
            failed.push(item);
          }
        }
        
        if (failed.length > 0 && store?.id && id) {
            setOfflineQueue(prev => normalizeOfflineQueue([...prev, ...failed], store.id, id));
        }
        
        await loadPromoCustomers();
      }
    };
    
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [offlineQueue, store?.id, id, loadPromoCustomers]);

  useEffect(() => {
    const checkLocation = () => {
      const geofence = getPromotionGeofence(promo, store);
      if (!geofence) {
        setIsWithinGeofence(true);
        setScannerLocation(null);
        return;
      }

      if (!navigator.geolocation) {
        setLocationError("Geolocation is not supported by your browser.");
        setIsWithinGeofence(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const currentLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };
          const distance = distanceInMeters(currentLocation, geofence);

          setScannerLocation(currentLocation);
          if (distance <= geofence.radiusMeters) {
            setIsWithinGeofence(true);
            setLocationError(null);
          } else {
            setIsWithinGeofence(false);
            setLocationError(`You are too far from the ${geofence.label} geofence. Distance: ${Math.round(distance)}m (Max: ${geofence.radiusMeters}m).`);
          }
        },
        () => {
          setScannerLocation(null);
          setIsWithinGeofence(false);
          setLocationError("Unable to retrieve your location for security check.");
        }
      );
    };

    checkLocation();
  }, [store, promo]);

  const handleScan = async (rawScannedId: string) => {
    const scannedId = String(rawScannedId || "").trim();

    if (!scannedId || isProcessing || !isWithinGeofence) return;

    if (!isValidCustomerQr(scannedId)) {
      alert("Invalid PerkUp QR code. Ask the customer to open or download their QR from the PerkUp app.");
      return;
    }

    const now = Date.now();
    const lastDuplicateScan = duplicateScanRef.current;
    
    if (
      lastDuplicateScan?.id === scannedId &&
      now - lastDuplicateScan.scannedAt < DUPLICATE_SCAN_COOLDOWN_MS
    ) {
      if (now - lastDuplicateScan.alertedAt > DUPLICATE_SCAN_ALERT_COOLDOWN_MS) {
        alert("This QR code has already been scanned. Please wait a few seconds before scanning it again.");
        duplicateScanRef.current = { ...lastDuplicateScan, alertedAt: now };
      }
      return;
    }

    if (isBatchMode && batchQueue.some(item => item.id === scannedId)) {
      alert("This QR code has already been scanned in the current batch.");
      duplicateScanRef.current = { id: scannedId, scannedAt: now, alertedAt: now };
      return;
    }
    
    duplicateScanRef.current = { id: scannedId, scannedAt: now, alertedAt: 0 };

    // Trigger visual feedback
    setShowScanSuccess(true);
    setTimeout(() => setShowScanSuccess(false), 1000);

    if (isBatchMode) {
      setBatchQueue(prev => [...prev, { id: scannedId, points: pointsToAdd }]);
      return;
    }

    if (!navigator.onLine) {
        alert("Secure QR scans require an internet connection so PerkUp can authenticate the staff account and QR ticket.");
        return;
    }

    setIsProcessing(true);
    setIsScannerActive(false);

    try {
      const result = await redeemCustomerScan({
        scanToken: scannedId,
        storeId: store.id,
        promotionId: id,
        points: pointsToAdd,
        scannerLocation,
        previewOnly: true,
      });

      setScannedCustomer({
        id: result.customer.id,
        redemptionInput: { scanToken: scannedId },
        username: result.customer.username,
        maskedName: result.customer.maskedName,
        birthday: result.customer.birthday,
        profilePic: result.customer.profilePic,
        existingStars: result.customer.existingStars,
      });

      setShowConfirmModal(true);

    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to process scanned QR code.");
      setIsScannerActive(true);
    } finally {
      setIsProcessing(false);
    }
  };

  const processPointsForCustomerInput = async (redemptionInput: RedemptionInput, points: number) => {
    if (!store) throw new Error("Store context is missing.");
    if (redemptionInput.scanToken && !isValidCustomerQr(redemptionInput.scanToken)) {
      throw new Error("Invalid PerkUp QR code.");
    }
    if (!redemptionInput.scanToken && !redemptionInput.manualUsername) {
      throw new Error("Customer scan or username is required.");
    }

    const safePoints = normalizePoints(points);
    return redeemCustomerScan({
      ...redemptionInput,
      storeId: store.id,
      promotionId: id,
      points: safePoints,
      scannerLocation,
    });
  };

  const processPointsForCustomer = async (scannedId: string, points: number) => {
    return processPointsForCustomerInput({ scanToken: scannedId }, points);
  };

  const handleManualLookup = async () => {
    const username = normalizeCustomerUsername(manualUsername);
    if (!username || !store?.id || !isWithinGeofence || isProcessing) return;
    if (!navigator.onLine) {
      setManualError("Manual username verification requires an internet connection.");
      return;
    }

    setIsProcessing(true);
    setManualError("");
    setIsScannerActive(false);

    try {
      const result = await redeemCustomerScan({
        manualUsername: username,
        storeId: store.id,
        promotionId: id,
        points: pointsToAdd,
        scannerLocation,
        previewOnly: true,
      });

      setScannedCustomer({
        id: result.customer.id,
        redemptionInput: { manualUsername: username },
        username: result.customer.username,
        maskedName: result.customer.maskedName,
        birthday: result.customer.birthday,
        profilePic: result.customer.profilePic,
        existingStars: result.customer.existingStars,
      });
      setShowConfirmModal(true);
    } catch (error) {
      console.error(error);
      setManualError(error instanceof Error ? error.message : "Customer username could not be verified.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmPoints = async () => {
    if (!scannedCustomer || !store) return;

    if (!navigator.onLine) {
        alert("Secure QR scans require an internet connection.");
        return;
    }

    setIsProcessing(true);

    try {
      const result = await processPointsForCustomerInput(scannedCustomer.redemptionInput, pointsToAdd);

      alert(`Scan successful. Ticket ${result.ticket?.ticketNumber || "issued"} — credited ${pointsToAdd} points to @${scannedCustomer.username}.`);
      
      setShowConfirmModal(false);
      setScannedCustomer(null);
      setManualUsername("");
      setPointsToAdd(1);
      
      await loadPromoCustomers();
      setIsScannerActive(true);
      
    } catch (err) {
      console.error(err);
      alert("Failed to credit points.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmBatch = async () => {
    if (!store?.id || !id) return;

    if (!navigator.onLine) {
        alert("Secure QR scans require an internet connection.");
        return;
    }

    setIsProcessing(true);
    try {
        const ticketNumbers: string[] = [];
        for (const item of batchQueue) {
            const result = await processPointsForCustomer(item.id, item.points);
            if (result.ticket?.ticketNumber) ticketNumbers.push(result.ticket.ticketNumber);
        }
        
        alert(`Successfully issued ${batchQueue.length} tickets${ticketNumbers.length ? `: ${ticketNumbers.join(", ")}` : "."}`);
        setBatchQueue([]);
        setShowBatchModal(false);
        
        await loadPromoCustomers();
        
    } catch(e) {
        console.error(e);
        alert("Failed to process some batch items.");
    } finally {
        setIsProcessing(false);
    }
  };

  const updateBatchItemPoints = (index: number, change: number) => {
      setBatchQueue(prev => {
          const newQ = [...prev];
          newQ[index].points = normalizePoints(newQ[index].points + change);
          return newQ;
      });
  };
  
  const removeBatchItem = (index: number) => {
      setBatchQueue(prev => prev.filter((_, i) => i !== index));
  };

  const handleCancelPoints = () => {
    setShowConfirmModal(false);
    setScannedCustomer(null);
    setPointsToAdd(1);
    setIsScannerActive(true); // resume scanner
  };

  if (loading) return <PageSkeleton variant="scanner" />;

  if (!promo) {
    return (
      <div className="text-center p-8 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl mt-4">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Promotion Not Found</h3>
        <Link to="/staff/promotions" className="text-[#1b1b1b] hover:underline">Return to Promotions</Link>
      </div>
    );
  }

  const customerProgress = [...promoCustomers]
    .map((card) => ({ card, progress: getCardProgress(card, promo) }))
    .sort((a, b) => {
      if (a.progress.complete !== b.progress.complete) return a.progress.complete ? -1 : 1;
      return b.progress.stars - a.progress.stars;
    });
  const completedCustomers = customerProgress.filter((item) => item.progress.complete).length;
  const closeCustomers = customerProgress.filter((item) => !item.progress.complete && item.progress.remaining <= 2).length;
  const topProgress = customerProgress[0]?.progress.percent || 0;

  return (
    <div className="max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link to="/staff/promotions" className="p-2 -ml-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{promo.title}</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Promotion Scanner & Mechanics</p>
        </div>
      </div>

      {!isWithinGeofence && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-2xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-red-900 dark:text-red-200 block">Security Geofence Alert</h4>
            <p className="text-sm text-red-700 dark:text-red-300/80 mt-1">{locationError}</p>
          </div>
        </div>
      )}

      {offlineQueue.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 rounded-2xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-yellow-900 dark:text-yellow-200 block">Offline Mode Active</h4>
            <p className="text-sm text-yellow-700 dark:text-yellow-300/80 mt-1">
              {offlineQueue.length} scan(s) queued for synchronization when connection is restored.
            </p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Scanner Panel */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[2rem] p-6 sm:p-8 flex flex-col items-center">
          <div className="w-full flex flex-col gap-4 mb-8">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Camera className="w-5 h-5 text-[#1b1b1b]" /> Scanner Control
              </h3>
              <button
                 onClick={() => setIsScannerActive(!isScannerActive)}
                 disabled={!isWithinGeofence}
                 className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors ${
                   !isWithinGeofence ? 'bg-gray-100 text-gray-400 cursor-not-allowed' :
                   isScannerActive 
                    ? 'bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400' 
                    : 'bg-[#1b1b1b] hover:bg-black text-white'
                 }`}
              >
                {isScannerActive ? <><CameraOff className="w-4 h-4"/> Stop</> : <><Camera className="w-4 h-4"/> Start</>}
              </button>
            </div>
            
            <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
                <button 
                  onClick={() => setIsBatchMode(false)}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-sm font-bold transition-all ${!isBatchMode ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
                >
                  Single Scan
                </button>
                <button 
                  onClick={() => setIsBatchMode(true)}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-sm font-bold transition-all ${isBatchMode ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
                >
                  Batch Mode
                </button>
            </div>
          </div>

          <div className="w-full max-w-sm aspect-square bg-gray-50 dark:bg-black rounded-[2rem] border border-gray-200 dark:border-gray-800 overflow-hidden relative shadow-inner flex items-center justify-center mb-6 relative">
            {isBatchMode && batchQueue.length > 0 && (
                <div className="absolute top-4 right-4 z-20">
                    <span className="bg-[#1b1b1b] text-white font-bold px-3 py-1 rounded-full shadow-lg border-2 border-gray-100 dark:border-gray-900 animate-bounce block">
                        {batchQueue.length} queued
                    </span>
                </div>
            )}

            {showScanSuccess && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-green-500/20 backdrop-blur-sm animate-in fade-in zoom-in duration-300">
                    <div className="bg-white dark:bg-gray-900 rounded-full p-6 shadow-2xl animate-in zoom-in spin-in-1">
                        <CheckCircle2 className="w-16 h-16 text-green-500" />
                    </div>
                </div>
            )}

            {!isWithinGeofence ? (
               <div className="text-center p-6 text-gray-400">
                  <MapPin className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-sm font-medium">Scanner disabled due to location restrictions.</p>
               </div>
            ) : isScannerActive ? (
               <Scanner onScan={(result) => handleScan(result[0].rawValue)} />
            ) : (
               <div className="text-center p-6 text-gray-400">
                  <CameraOff className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-sm font-medium">Scanner is paused.</p>
                  <p className="text-xs mt-2">Click "Start" above.</p>
               </div>
            )}
          </div>

          <div className="w-full max-w-sm">
            <div className="mb-5 rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/60">
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2 block">
                Manual Username
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualUsername}
                  onChange={(event) => {
                    setManualUsername(event.target.value.trim().toLowerCase());
                    setManualError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleManualLookup();
                  }}
                  placeholder="customer_username"
                  disabled={!isWithinGeofence || isProcessing}
                  className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={handleManualLookup}
                  disabled={!manualUsername.trim() || !isWithinGeofence || isProcessing}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white transition-colors hover:bg-black disabled:opacity-50 dark:bg-white dark:text-gray-900"
                  title="Verify username"
                >
                  <Search className="w-4 h-4" />
                </button>
              </div>
              {manualError && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{manualError}</p>}
            </div>

            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3 block text-center">Points (Default)</label>
            <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-2 rounded-2xl border border-gray-200 dark:border-gray-700">
               <button 
                 onClick={() => setPointsToAdd(normalizePoints(pointsToAdd - 1))}
                 className="w-12 h-12 bg-white dark:bg-gray-900 rounded-xl flex items-center justify-center text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white shadow-sm border border-gray-100 dark:border-gray-700"
               >
                 <Minus className="w-5 h-5" />
               </button>
               <span className="text-2xl font-bold text-gray-900 dark:text-white px-4">{pointsToAdd}</span>
               <button 
                 onClick={() => setPointsToAdd(normalizePoints(pointsToAdd + 1))}
                 className="w-12 h-12 bg-white dark:bg-gray-900 rounded-xl flex items-center justify-center text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white shadow-sm border border-gray-100 dark:border-gray-700"
               >
                 <Plus className="w-5 h-5" />
               </button>
            </div>
            
            {isBatchMode && batchQueue.length > 0 && (
                <button 
                  onClick={() => setShowBatchModal(true)}
                  className="w-full mt-4 py-3 bg-gray-100 text-[#1b1b1b] dark:bg-white/10 dark:text-white hover:bg-gray-200 dark:hover:bg-white/15 rounded-xl font-bold transition-colors"
                >
                  Review {batchQueue.length} Scans
                </button>
            )}
            
            {pointsToAdd > 1 && !isBatchMode && (
               <p className="text-xs text-[#1b1b1b] dark:text-white text-center mt-3 font-medium">
                 You are awarding multiple points per scan!
               </p>
            )}
          </div>
        </div>

        {/* Info Panel: Mechanics and Customers */}
        <div className="space-y-6">
          <div className="bg-gray-50 dark:bg-gray-800/50 p-6 sm:p-8 rounded-[2rem] border border-gray-200 dark:border-gray-800">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Mechanics</h3>
             <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed mb-6">
               {promo.description || "No specific mechanics outlined."}
             </p>
             <div className="flex items-center gap-6 border-t border-gray-200 dark:border-gray-700 pt-6">
               <div>
                 <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">Required Points</p>
                 <p className="text-xl font-bold text-gray-900 dark:text-white">{promo.requiredStamps || 0}</p>
               </div>
               <div>
                 <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">Valid Until</p>
                 <p className="text-xl font-bold text-gray-900 dark:text-white">{promo.endDate ? new Date(promo.endDate).toLocaleDateString() : 'Continuous'}</p>
               </div>
               <div>
                 <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">Availability</p>
                 <p className="text-xl font-bold text-gray-900 dark:text-white">{promo.maxRedemptions ? `${promo.maxRedemptions} total` : "Unlimited"}</p>
               </div>
             </div>
             {promo.geofenceEnabled && (
               <div className="mt-5 rounded-2xl border border-gray-300 bg-gray-100 p-4 text-sm text-[#1b1b1b] dark:border-white/15 dark:bg-white/10 dark:text-white">
                 Scanner is limited to {promo.geofenceRadiusMeters || 500}m from this promotion's geofence.
               </div>
             )}
          </div>

          <div className="overflow-hidden bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[2rem]">
            <div className="border-b border-gray-100 bg-gray-50 p-6 dark:border-gray-800 dark:bg-white/5 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-500" /> Customer Progress
                  </h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Live leaderboard for this store.</p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white px-3 py-2 text-right shadow-sm dark:border-gray-700 dark:bg-gray-900">
                  <p className="text-xl font-black text-gray-900 dark:text-white">{completedCustomers}</p>
                  <p className="text-[11px] font-bold uppercase text-gray-500">Claim ready</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
                  <p className="text-lg font-black text-gray-900 dark:text-white">{promoCustomers.length}</p>
                  <p className="text-[11px] font-bold uppercase text-gray-500">Players</p>
                </div>
                <div className="rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
                  <p className="text-lg font-black text-gray-900 dark:text-white">{closeCustomers}</p>
                  <p className="text-[11px] font-bold uppercase text-gray-500">Close</p>
                </div>
                <div className="rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
                  <p className="text-lg font-black text-gray-900 dark:text-white">{Math.round(topProgress)}%</p>
                  <p className="text-[11px] font-bold uppercase text-gray-500">Top</p>
                </div>
              </div>
            </div>
            
            {promoCustomers.length === 0 ? (
               <div className="p-6 sm:p-8">
                 <p className="text-sm text-gray-500">No customers have participated in this store's program yet.</p>
               </div>
            ) : (
               <div className="max-h-[360px] space-y-3 overflow-y-auto p-4 sm:p-5">
                 {customerProgress.slice(0, 50).map(({ card: c, progress }, index) => (
                   <div key={c.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/70">
                     <div className="flex items-center justify-between gap-3">
                       <div className="flex min-w-0 items-center gap-3">
                         <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${progress.complete ? "border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300" : "border-gray-300 bg-white text-gray-700 dark:border-white/15 dark:bg-white/10 dark:text-white"}`}>
                           {progress.complete || index === 0 ? <Trophy className="h-4 w-4" /> : <User className="h-4 w-4" />}
                         </div>
                         <div className="min-w-0">
                           <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{getCustomerLabel(c)}</p>
                           <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                             {progress.complete ? "Reward ready" : `${progress.remaining} point${progress.remaining === 1 ? "" : "s"} to go`}
                           </p>
                         </div>
                       </div>
                       <div className="rounded-xl bg-white px-3 py-1.5 text-sm font-black text-gray-900 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:text-white dark:ring-gray-700">
                         {progress.stars} / {progress.required}
                       </div>
                     </div>
                     <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                       <div
                         className={`h-full rounded-full transition-all duration-500 ${progress.complete ? "bg-amber-500" : "bg-emerald-500"}`}
                         style={{ width: `${progress.percent}%` }}
                       />
                     </div>
                   </div>
                 ))}
                 {promoCustomers.length > 50 && (
                   <p className="text-xs text-center text-gray-500 pt-2">Showing 50 most recent</p>
                 )}
               </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal - Single Mode */}
      {showConfirmModal && scannedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-[2rem] w-full max-w-sm overflow-hidden shadow-2xl border border-gray-100 dark:border-gray-800 animate-in zoom-in-95">
            <div className="p-8 text-center border-b border-gray-100 dark:border-gray-800 bg-gray-100 dark:bg-white/5">
              {scannedCustomer.profilePic ? (
                <img src={scannedCustomer.profilePic} alt="Customer" className="w-20 h-20 rounded-full mx-auto mb-4 border-4 border-white dark:border-gray-800 shadow-sm object-cover" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-white dark:bg-gray-800 border-4 border-gray-200 dark:border-gray-700 mx-auto flex items-center justify-center shadow-sm mb-4">
                  <UserCircle className="w-10 h-10 text-gray-400" />
                </div>
              )}
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">{scannedCustomer.maskedName}</h3>
              <p className="text-sm text-gray-500 mt-1 font-mono tracking-widest">@{scannedCustomer.username}</p>
              {getBirthdayStatus(scannedCustomer.birthday).isToday && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-pink-200 bg-pink-50 px-3 py-1.5 text-sm font-bold text-pink-700 dark:border-pink-900/60 dark:bg-pink-950/30 dark:text-pink-300">
                  <Cake className="h-4 w-4" />
                  Birthday today
                </div>
              )}
            </div>

            <div className="p-6">
              <div className="flex justify-between items-center mb-6 bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                <div className="text-center">
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-1">Current</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{scannedCustomer.existingStars}</p>
                </div>
                <div className="w-8 h-px bg-gray-300 dark:bg-gray-600"></div>
                <div className="text-center">
                  <p className="text-xs text-[#1b1b1b] font-bold uppercase tracking-widest mb-1">Add</p>
                  <p className="text-lg font-bold text-[#1b1b1b] dark:text-white">+{pointsToAdd}</p>
                </div>
                <div className="w-8 h-px bg-gray-300 dark:bg-gray-600"></div>
                <div className="text-center">
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-1">New Total</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{scannedCustomer.existingStars + pointsToAdd}</p>
                </div>
              </div>

              {pointsToAdd > 1 && (
                <div className="mb-6 p-3 bg-gray-100 text-[#1b1b1b] dark:bg-white/10 dark:text-white text-sm font-medium rounded-xl border border-gray-300 dark:border-white/15 flex gap-2 items-start">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <p>Are you sure you want to award {pointsToAdd} points at once?</p>
                </div>
              )}

              <div className="flex gap-3">
                <button 
                  onClick={handleCancelPoints}
                  disabled={isProcessing}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 transition"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleConfirmPoints}
                  disabled={isProcessing}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-[#1b1b1b] hover:bg-black transition disabled:opacity-70 disabled:animate-pulse flex items-center justify-center gap-2 shadow-lg shadow-black/20"
                >
                  {isProcessing ? "Processing..." : <>Confirm <CheckCircle2 className="w-4 h-4" /></>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Box Confirm Modal - Batch Mode */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-[2rem] w-full max-w-lg overflow-hidden shadow-2xl border border-gray-100 dark:border-gray-800 flex flex-col max-h-[85vh] animate-in zoom-in-95">
              <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-gray-100 dark:bg-white/5 flex justify-between items-center shrink-0">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">Review Batch</h3>
                  <span className="bg-gray-200 text-[#1b1b1b] dark:bg-white/15 dark:text-white px-3 py-1 rounded-xl font-bold text-sm shadow-sm">{batchQueue.length} pending</span>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {batchQueue.map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700">
                          <div className="flex items-center gap-3 overflow-hidden">
                             <div className="w-10 h-10 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 flex items-center justify-center shrink-0 shadow-sm">
                                 <UserCircle className="w-5 h-5 text-gray-400" />
                             </div>
                             <div className="min-w-0">
                               <p className="text-sm font-bold text-gray-900 dark:text-white truncate">Customer Scan</p>
                               <p className="text-xs text-gray-500 font-mono tracking-widest truncate">{item.id.slice(0, 10)}</p>
                             </div>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                              <div className="flex items-center gap-3 bg-white dark:bg-gray-900 p-1.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                                  <button onClick={() => updateBatchItemPoints(index, -1)} className="w-7 h-7 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="font-bold w-4 text-center text-sm dark:text-white">{item.points}</span>
                                  <button onClick={() => updateBatchItemPoints(index, 1)} className="w-7 h-7 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
                                    <Plus className="w-3 h-3" />
                                  </button>
                              </div>
                              <button onClick={() => removeBatchItem(index)} className="text-gray-400 hover:text-red-500 transition-colors p-2 -mr-2">
                                  <Trash2 className="w-5 h-5" />
                              </button>
                          </div>
                      </div>
                  ))}
                  
                  {batchQueue.length === 0 && (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400 flex flex-col items-center">
                          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                            <CheckCircle2 className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                          </div>
                          <p className="font-medium text-gray-900 dark:text-white">Batch is empty.</p>
                          <p className="text-sm mt-1">Scan QR codes to add them to the queue.</p>
                      </div>
                  )}
              </div>
              
              <div className="p-6 border-t border-gray-100 dark:border-gray-800 flex gap-3 bg-white dark:bg-gray-900 shrink-0">
                  <button onClick={() => setShowBatchModal(false)} className="flex-1 py-3 px-4 rounded-xl font-bold text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 transition">
                      Close
                  </button>
                  <button 
                    onClick={handleConfirmBatch} 
                    disabled={isProcessing || batchQueue.length === 0} 
                    className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-[#1b1b1b] hover:bg-black transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-black/20"
                  >
                      {isProcessing ? "Processing..." : <>Confirm All <CheckCircle2 className="w-4 h-4" /></>}
                  </button>
              </div>
          </div>
        </div>
      )}
    </div>
  );
}
