import { useEffect, useRef, useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { collection, getDocs, query, where } from "@/src/lib/dataCompat";
import { db } from "@/src/lib/backend";
import {
  AlertTriangle,
  Activity,
  Camera,
  CameraOff,
  CheckCircle2,
  Gift,
  Loader2,
  MapPin,
  Navigation,
  Minus,
  Plus,
  QrCode,
  Search,
  Star,
  Trash2,
  RotateCcw,
  UserCircle,
  X,
} from "lucide-react";
import { CustomerScanCard, normalizeCustomerUsername, parseCustomerQr, redeemCustomerScan } from "@/src/lib/secureQr";
import { readCustomerScanCache, writeCustomerScanCache } from "@/src/lib/customerScanCache";
import { getDisplayImageUrl } from "@/src/lib/imageStorage";
import { CustomDropdown } from "@/src/components/CustomDropdown";
import { normalizeStampStyle, StoreStamp } from "@/src/components/StoreStamp";
import { getPhilippineDateTimeMillis } from "@/src/lib/dateTime";
import { formatCustomerCode } from "@/src/lib/customerId";
import { PROMOTION_REDEEM_QR_PREFIX, redeemPromotionClaim } from "@/src/lib/promotionClaims";
import { useAuth } from "@/src/contexts/AuthContext";
import { configureQrScannerRuntime } from "@/src/lib/qrScannerRuntime";
import { useToast } from "@/src/components/ToastProvider";

configureQrScannerRuntime();

type ScannerLocation = {
  lat: number;
  lng: number;
  accuracy?: number;
};

type RedemptionInput = {
  scanToken?: string;
  manualUsername?: string;
};

type Promotion = {
  id: string;
  title?: string;
  description?: string;
  active?: boolean;
  startDate?: string;
  endDate?: string;
  maxRedemptions?: number | null;
  geofenceEnabled?: boolean;
  geofenceLat?: number | string | null;
  geofenceLng?: number | string | null;
  geofenceRadiusMeters?: number | string | null;
};

type ScannedCustomer = {
  id: string;
  publicId?: string | null;
  username: string;
  maskedName: string;
  profilePic: string | null;
  existingStars: number;
  cards: CustomerScanCard[];
  redemptionInput: RedemptionInput;
  cachedAt?: number;
  isCachedPreview?: boolean;
};

type BatchItem = {
  id: string;
  redemptionInput: RedemptionInput;
  points: number;
};

const MAX_POINTS_PER_SCAN = 100;
const DUPLICATE_SCAN_COOLDOWN_MS = 20000;
const DUPLICATE_SCAN_ALERT_COOLDOWN_MS = 1500;

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

const getScannerGeofence = (promotion: Promotion | null) => {
  const promoLat = Number(promotion?.geofenceLat);
  const promoLng = Number(promotion?.geofenceLng);
  if (promotion?.geofenceEnabled && Number.isFinite(promoLat) && Number.isFinite(promoLng)) {
    return {
      lat: promoLat,
      lng: promoLng,
      radiusMeters: Math.max(Number(promotion.geofenceRadiusMeters || 500), 25),
      label: "promotion",
    };
  }

  return null;
};

const formatJoinedAt = (value: unknown) => {
  if (!value) return "Recently";
  if (typeof value === "string") return new Date(value).toLocaleDateString();
  if (typeof value === "object") {
    const timestamp = value as { seconds?: number };
    if (Number.isFinite(timestamp.seconds)) {
      return new Date(Number(timestamp.seconds) * 1000).toLocaleDateString();
    }
  }
  return "Recently";
};

const isPromotionCurrentlyVisible = (promotion: Promotion) => {
  if (promotion.active === false) return false;
  if (promotion.startDate && getPhilippineDateTimeMillis(promotion.startDate) > Date.now()) return false;
  if (promotion.endDate && getPhilippineDateTimeMillis(promotion.endDate) <= Date.now()) return false;
  return true;
};

export default function StaffScanner({ store }: { store: any }) {
  const { user } = useAuth();
  const toast = useToast();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [selectedPromotionId, setSelectedPromotionId] = useState("");
  const [scannerLocation, setScannerLocation] = useState<ScannerLocation | null>(null);
  const [isWithinGeofence, setIsWithinGeofence] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationUpdatedAt, setLocationUpdatedAt] = useState<Date | null>(null);
  const [locationPing, setLocationPing] = useState(0);
  const [isScannerActive, setIsScannerActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pointsToAdd, setPointsToAdd] = useState(1);
  const [scannedCustomer, setScannedCustomer] = useState<ScannedCustomer | null>(null);
  const [selectedCardId, setSelectedCardId] = useState("");
  const [manualUsername, setManualUsername] = useState("");
  const [manualError, setManualError] = useState("");
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchQueue, setBatchQueue] = useState<BatchItem[]>([]);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showScanSuccess, setShowScanSuccess] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const duplicateScanRef = useRef<{ token: string; scannedAt: number; alertedAt: number } | null>(null);

  const selectedPromotion = promotions.find((promotion) => promotion.id === selectedPromotionId) || null;
  const customerCacheScope = { staffId: user?.id || "", storeId: String(store?.id || "") };
  const activeGeofence = getScannerGeofence(selectedPromotion);
  const distanceFromGeofence = scannerLocation && activeGeofence
    ? distanceInMeters(scannerLocation, activeGeofence)
    : null;

  useEffect(() => {
    if (!store?.id) return;

    async function loadPromotions() {
      try {
        const promotionsQuery = query(collection(db, "promotions"), where("storeId", "==", store.id));
        const snapshot = await getDocs(promotionsQuery);
        const nextPromotions = snapshot.docs
          .map((doc) => ({ id: doc.id, ...(doc.data() as any) }))
          .filter(isPromotionCurrentlyVisible);
        setPromotions(nextPromotions);
      } catch (error) {
        console.error("Failed to load staff scanner promotions", error);
      }
    }

    loadPromotions();
  }, [store?.id]);

  useEffect(() => {
    if (!scannedCustomer) {
      setSelectedCardId("");
      return;
    }

    setSelectedCardId(scannedCustomer.cards[0]?.id || "");
  }, [scannedCustomer?.id]);

  useEffect(() => {
    setScannedCustomer(null);
    setSelectedCardId("");
    setBatchQueue([]);
    setShowBatchModal(false);
    setMessage(null);
  }, [selectedPromotionId]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setScannerLocation(null);
      setIsWithinGeofence(false);
      setLocationError("Geolocation is not supported by this browser.");
      return;
    }

    const geofence = getScannerGeofence(selectedPromotion);
    const updateLocation = (position: GeolocationPosition) => {
      const location = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };
      setScannerLocation(location);
      setLocationUpdatedAt(new Date(position.timestamp));
      if (!geofence) {
        setIsWithinGeofence(true);
        setLocationError(null);
        return;
      }
      const distance = distanceInMeters(location, geofence);
      if (distance <= geofence.radiusMeters) {
        setIsWithinGeofence(true);
        setLocationError(null);
      } else {
        setIsWithinGeofence(false);
        setLocationError(`You are too far from the ${geofence.label} geofence. Distance: ${Math.round(distance)}m (Max: ${geofence.radiusMeters}m).`);
      }
    };
    const handleLocationError = (error: GeolocationPositionError) => {
      setIsWithinGeofence(!geofence);
      setLocationError(
        error.code === error.PERMISSION_DENIED
          ? "Location permission is blocked. Allow location access in the browser, then press Reset."
          : "Unable to retrieve your live location. Press Ping to try again.",
      );
    };
    const options: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000,
    };
    const watchId = navigator.geolocation.watchPosition(updateLocation, handleLocationError, options);
    navigator.geolocation.getCurrentPosition(
      updateLocation,
      handleLocationError,
      options,
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [selectedPromotionId, locationPing]);

  const resetLocation = () => {
    setScannerLocation(null);
    setLocationUpdatedAt(null);
    setLocationError(null);
    setIsWithinGeofence(true);
    setLocationPing((value) => value + 1);
  };

  const handleScannerError = (error: unknown) => {
    console.error("QR scanner failed", error);
    const detail = error instanceof Error ? error.message : "The camera or QR decoder could not start.";
    setMessage({
      type: "error",
      text: `Scanner unavailable: ${detail} Check camera permission, then stop and restart the scanner.`,
    });
    setIsScannerActive(false);
  };

  const previewCustomer = async (redemptionInput: RedemptionInput) => {
    const cachedScan = await readCustomerScanCache(customerCacheScope, redemptionInput);
    if (cachedScan) {
      setScannedCustomer({
        ...cachedScan.customer,
        redemptionInput,
        cachedAt: cachedScan.cachedAt,
        isCachedPreview: true,
      });
    }

    const result = await redeemCustomerScan({
      ...redemptionInput,
      storeId: store.id,
      promotionId: selectedPromotionId || undefined,
      points: pointsToAdd,
      scannerLocation,
      previewOnly: true,
    });

    await writeCustomerScanCache(customerCacheScope, redemptionInput, result);
    setScannedCustomer({
      id: result.customer.id,
      publicId: result.customer.publicId,
      username: result.customer.username,
      maskedName: result.customer.maskedName,
      profilePic: result.customer.profilePic,
      existingStars: result.customer.existingStars,
      cards: result.customer.cards || [],
      redemptionInput,
      isCachedPreview: false,
    });
  };

  const handleScan = async (rawValue: string) => {
    const scanValue = String(rawValue || "").trim();
    if (!scanValue || isProcessing || scannedCustomer || !isWithinGeofence) return;

    if (scanValue.startsWith(PROMOTION_REDEEM_QR_PREFIX)) {
      if (isBatchMode) {
        setMessage({ type: "error", text: "Reward claims must be redeemed in Single Scan mode." });
        return;
      }
      if (!navigator.onLine) {
        setMessage({ type: "error", text: "Reward redemption requires an internet connection." });
        return;
      }
      setIsProcessing(true);
      setIsScannerActive(false);
      setMessage(null);
      const progressToastId = toast.progress("Redeeming the scanned reward…", { title: "Reward redemption" });
      try {
        const claim = await redeemPromotionClaim({ storeId: store.id, lookup: scanValue, method: "qr" });
        setShowScanSuccess(true);
        setTimeout(() => setShowScanSuccess(false), 1000);
        setMessage({ type: "success", text: `Reward ${claim.redeemCode} redeemed successfully and marked as used.` });
        toast.update(progressToastId, `Reward ${claim.redeemCode} redeemed and marked as used.`, "success", { title: "Reward redeemed" });
      } catch (error) {
        const text = error instanceof Error ? error.message : "Could not redeem this reward QR.";
        setMessage({ type: "error", text });
        if (/already|expired|invalid|not found/i.test(text)) toast.update(progressToastId, text, "info", { title: "Reward not redeemable" });
        else toast.update(progressToastId, text, "error", { error, title: "Redemption failed" });
      } finally {
        setIsProcessing(false);
        setIsScannerActive(true);
      }
      return;
    }

    const parsedQr = parseCustomerQr(scanValue);
    if (!parsedQr) {
      setMessage({ type: "error", text: "Invalid Perk QR code. Ask the customer to open their Identity QR." });
      return;
    }
    const redemptionInput: RedemptionInput = parsedQr.kind === "secure"
      ? { scanToken: parsedQr.scanToken }
      : { manualUsername: parsedQr.manualUsername };
    const scanKey = parsedQr.kind === "secure" ? parsedQr.scanToken : `@${parsedQr.manualUsername}`;

    const now = Date.now();
    const lastScan = duplicateScanRef.current;
    if (lastScan?.token === scanKey && now - lastScan.scannedAt < DUPLICATE_SCAN_COOLDOWN_MS) {
      if (now - lastScan.alertedAt > DUPLICATE_SCAN_ALERT_COOLDOWN_MS) {
        setMessage({ type: "error", text: "This QR code was already scanned. Please wait a few seconds before scanning it again." });
        duplicateScanRef.current = { ...lastScan, alertedAt: now };
      }
      return;
    }

    if (isBatchMode && batchQueue.some((item) => item.id === scanKey)) {
      setMessage({ type: "error", text: "This QR code is already in the current batch." });
      duplicateScanRef.current = { token: scanKey, scannedAt: now, alertedAt: now };
      return;
    }

    duplicateScanRef.current = { token: scanKey, scannedAt: now, alertedAt: 0 };
    setShowScanSuccess(true);
    setTimeout(() => setShowScanSuccess(false), 1000);

    if (isBatchMode) {
      setBatchQueue((queue) => [...queue, { id: scanKey, redemptionInput, points: pointsToAdd }]);
      return;
    }

    setIsProcessing(true);
    setIsScannerActive(false);
    setMessage(null);

    try {
      if (!navigator.onLine) {
        const cachedScan = await readCustomerScanCache(customerCacheScope, redemptionInput);
        if (!cachedScan) {
          setMessage({ type: "error", text: "No saved customer info on this device. Connect to the internet once to verify this customer." });
          setIsScannerActive(true);
          return;
        }
        setScannedCustomer({
          ...cachedScan.customer,
          redemptionInput,
          cachedAt: cachedScan.cachedAt,
          isCachedPreview: true,
        });
        setMessage({ type: "success", text: "Loaded saved customer info. Connect to the internet before crediting the card." });
      } else {
        await previewCustomer(redemptionInput);
      }
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to verify customer QR." });
      setIsScannerActive(true);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualLookup = async () => {
    const username = normalizeCustomerUsername(manualUsername);
    if (!username || !store?.id || !isWithinGeofence || isProcessing || isBatchMode) return;

    setIsProcessing(true);
    setManualError("");
    setMessage(null);
    setIsScannerActive(false);

    try {
      if (!navigator.onLine) {
        const cachedScan = await readCustomerScanCache(customerCacheScope, { manualUsername: username });
        if (!cachedScan) {
          setManualError("No saved customer info on this device. Connect to verify this username.");
          return;
        }
        setScannedCustomer({
          ...cachedScan.customer,
          redemptionInput: { manualUsername: username },
          cachedAt: cachedScan.cachedAt,
          isCachedPreview: true,
        });
        setMessage({ type: "success", text: "Loaded saved customer info. Connect to the internet before crediting the card." });
      } else {
        await previewCustomer({ manualUsername: username });
      }
    } catch (error) {
      console.error(error);
      setManualError(error instanceof Error ? error.message : "Customer username could not be verified.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCredit = async () => {
    if (!scannedCustomer || !store?.id || isProcessing) return;
    if (!navigator.onLine) {
      setMessage({ type: "error", text: "Customer info can be viewed from cache offline, but crediting a card requires internet confirmation." });
      return;
    }
    if (scannedCustomer.cards.length > 0 && !selectedCardId) {
      setMessage({ type: "error", text: "Choose an active card before adding credit." });
      return;
    }

    setIsProcessing(true);
    setMessage(null);
    const progressToastId = toast.progress("Crediting the selected card…", { title: "Issuing points" });

    try {
      const result = await redeemCustomerScan({
        ...scannedCustomer.redemptionInput,
        storeId: store.id,
        promotionId: selectedPromotionId || undefined,
        selectedCardId: selectedCardId || undefined,
        points: pointsToAdd,
        scannerLocation,
      });

      const updatedCards = scannedCustomer.cards.map((card) => {
        if (card.id !== selectedCardId) return card;
        if (!selectedPromotionId) return { ...card, stars: result.customer.newStars };
        return {
          ...card,
          promoProgress: {
            ...(card.promoProgress || {}),
            [selectedPromotionId]: result.customer.newStars,
          },
        };
      });
      setScannedCustomer({
        ...scannedCustomer,
        existingStars: result.customer.newStars,
        cards: updatedCards.length > 0 ? updatedCards : result.customer.cards || [],
        isCachedPreview: false,
      });
      await writeCustomerScanCache(customerCacheScope, scannedCustomer.redemptionInput, result);
      setManualUsername("");
      toast.success(`Ticket ${result.ticket?.ticketNumber || "issued"} — credited ${pointsToAdd} point${pointsToAdd === 1 ? "" : "s"} to @${scannedCustomer.username}.`, { title: "Points credited" });
      toast.dismissToast(progressToastId);
      setScannedCustomer(null);
      setSelectedCardId("");
      setPointsToAdd(1);
      setIsScannerActive(true);
    } catch (error) {
      console.error(error);
      const text = error instanceof Error ? error.message : "Failed to credit card.";
      setMessage({ type: "error", text });
      toast.update(progressToastId, text, "error", { error, title: "Credit failed" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmBatch = async () => {
    if (!store?.id || batchQueue.length === 0 || isProcessing) return;
    if (!navigator.onLine) {
      setMessage({ type: "error", text: "Secure QR scans require an internet connection." });
      return;
    }

    setIsProcessing(true);
    setMessage(null);
    const progressToastId = toast.progress(`Issuing ${batchQueue.length} tickets…`, { title: "Processing batch" });
    try {
      const ticketNumbers: string[] = [];
      for (const item of batchQueue) {
        const result = await redeemCustomerScan({
          ...item.redemptionInput,
          storeId: store.id,
          promotionId: selectedPromotionId || undefined,
          points: item.points,
          scannerLocation,
        });
        if (result.ticket?.ticketNumber) ticketNumbers.push(result.ticket.ticketNumber);
      }

      setMessage({
        type: "success",
        text: `Successfully issued ${batchQueue.length} tickets${ticketNumbers.length ? `: ${ticketNumbers.join(", ")}` : "."}`,
      });
      toast.update(progressToastId, `Successfully issued ${batchQueue.length} tickets${ticketNumbers.length ? `: ${ticketNumbers.join(", ")}` : "."}`, "success", { title: "Batch complete" });
      setBatchQueue([]);
      setShowBatchModal(false);
    } catch (error) {
      console.error(error);
      const text = error instanceof Error ? error.message : "Failed to process some batch scans.";
      setMessage({ type: "error", text });
      toast.update(progressToastId, text, "error", { error, title: "Batch incomplete" });
    } finally {
      setIsProcessing(false);
    }
  };

  const updateBatchItemPoints = (index: number, change: number) => {
    setBatchQueue((queue) => {
      const nextQueue = [...queue];
      nextQueue[index].points = normalizePoints(nextQueue[index].points + change);
      return nextQueue;
    });
  };

  const removeBatchItem = (index: number) => {
    setBatchQueue((queue) => queue.filter((_, itemIndex) => itemIndex !== index));
  };

  const resetScan = () => {
    setScannedCustomer(null);
    setMessage(null);
    setPointsToAdd(1);
    setIsScannerActive(true);
  };

  const selectedCard = scannedCustomer?.cards.find((card) => card.id === selectedCardId);
  const currentStars = selectedPromotionId
    ? Number(selectedCard?.promoProgress?.[selectedPromotionId] ?? scannedCustomer?.existingStars ?? 0)
    : selectedCard?.stars ?? scannedCustomer?.existingStars ?? 0;
  const scannerDisabled = isProcessing || Boolean(scannedCustomer) || !isWithinGeofence;

  return (
    <div className="w-full max-w-5xl space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">QR Scanner</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Scan secure customer QR codes, apply promotion rules, and choose the card to credit.</p>
        </div>
        <div className="rounded-2xl border border-gray-300 bg-gray-100 px-4 py-3 text-sm dark:border-white/15 dark:bg-white/10">
          <p className="text-xs font-bold uppercase tracking-widest text-[#1b1b1b] dark:text-white">Assigned Store</p>
          <p className="font-bold text-gray-900 dark:text-white">{store?.name || "Store"}</p>
        </div>
      </div>

      {locationError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800 flex items-start gap-3 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
          <MapPin className="h-5 w-5 shrink-0" />
          {locationError}
        </div>
      )}

      {message && (
        <div className={`rounded-2xl border p-4 text-sm font-medium flex items-start gap-3 ${
          message.type === "success"
            ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900/50 dark:bg-green-900/20 dark:text-green-300"
            : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300"
        }`}>
          {message.type === "success" ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertTriangle className="h-5 w-5 shrink-0" />}
          {message.text}
        </div>
      )}

      <div className="grid w-full min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="min-w-0 rounded-[2rem] border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
                <Camera className="h-5 w-5 text-[#1b1b1b] dark:text-white" />
                Scanner
              </h3>
              <button
                type="button"
                onClick={() => setIsScannerActive((value) => !value)}
                disabled={scannerDisabled}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors disabled:opacity-50 ${
                  isScannerActive
                    ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300"
                    : "bg-[#1b1b1b] text-white hover:bg-black"
                }`}
              >
                {isScannerActive ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                {isScannerActive ? "Stop" : "Start"}
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Promotion Rules</label>
              <CustomDropdown
                value={selectedPromotionId}
                onChange={setSelectedPromotionId}
                disabled={isProcessing}
                options={[
                  { label: "Store visit credit", value: "" },
                  ...promotions.map((promotion) => ({
                    label: promotion.title || "Untitled Promotion",
                    value: promotion.id,
                  })),
                ]}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {selectedPromotion
                  ? "Selected promotion dates, redemption limits, and geofence are enforced by the scan function."
                  : "No geofence is enforced for a regular store visit."}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-xs dark:border-gray-700 dark:bg-gray-800/60">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
                  <Activity className="h-4 w-4" />
                  Live location diagnostics
                </p>
                <span className={`rounded-full px-2 py-1 font-bold ${scannerLocation ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300"}`}>
                  {scannerLocation ? "Tracking" : "Waiting"}
                </span>
              </div>
              {scannerLocation ? (
                <div className="space-y-1 font-mono text-gray-600 dark:text-gray-300">
                  <p>Lat: {scannerLocation.lat.toFixed(6)}</p>
                  <p>Lng: {scannerLocation.lng.toFixed(6)}</p>
                  <p>Accuracy: ±{Math.round(scannerLocation.accuracy || 0)}m</p>
                  {distanceFromGeofence !== null && <p>Fence distance: {Math.round(distanceFromGeofence)}m / {activeGeofence?.radiusMeters}m</p>}
                  <p>Updated: {locationUpdatedAt?.toLocaleTimeString() || "—"}</p>
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">Waiting for a GPS reading. Location tracking requires browser permission and HTTPS.</p>
              )}
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setLocationPing((value) => value + 1)} className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-2 font-bold text-white dark:bg-white dark:text-gray-900">
                  <Navigation className="h-3.5 w-3.5" /> Ping
                </button>
                <button type="button" onClick={resetLocation} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 font-bold text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200">
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </button>
              </div>
            </div>

            <div className="flex gap-2 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
              <button
                type="button"
                onClick={() => setIsBatchMode(false)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-bold transition-all ${!isBatchMode ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}
              >
                Single
              </button>
              <button
                type="button"
                onClick={() => {
                  setScannedCustomer(null);
                  setIsBatchMode(true);
                }}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-bold transition-all ${isBatchMode ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}
              >
                Batch
              </button>
            </div>
          </div>

          <div className="relative mx-auto mb-6 flex aspect-square w-full max-w-sm items-center justify-center overflow-hidden rounded-[2rem] border border-gray-200 bg-gray-50 shadow-inner dark:border-gray-800 dark:bg-black">
            {isBatchMode && batchQueue.length > 0 && (
              <div className="absolute right-4 top-4 z-20 rounded-full bg-[#1b1b1b] px-3 py-1 text-sm font-bold text-white shadow-lg">
                {batchQueue.length} queued
              </div>
            )}
            {showScanSuccess && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-green-500/20 backdrop-blur-sm">
                <div className="rounded-full bg-white p-6 shadow-2xl dark:bg-gray-900">
                  <CheckCircle2 className="h-16 w-16 text-green-500" />
                </div>
              </div>
            )}
            {isProcessing ? (
              <div className="flex flex-col items-center gap-3 text-gray-500">
                <Loader2 className="h-10 w-10 animate-spin text-[#1b1b1b] dark:text-white" />
                <p className="text-sm font-semibold">Processing scan</p>
              </div>
            ) : !isWithinGeofence ? (
              <div className="p-6 text-center text-gray-400">
                <MapPin className="mx-auto mb-4 h-12 w-12" />
                <p className="text-sm font-semibold">Scanner disabled by geofence</p>
              </div>
            ) : isScannerActive ? (
              <Scanner
                formats={["qr_code"]}
                onScan={(result) => {
                  const rawValue = result[0]?.rawValue;
                  if (rawValue) handleScan(rawValue);
                }}
                onError={handleScannerError}
              />
            ) : (
              <div className="p-6 text-center text-gray-400">
                <QrCode className="mx-auto mb-4 h-12 w-12" />
                <p className="text-sm font-semibold">{scannedCustomer ? "Customer scanned" : "Scanner is paused"}</p>
                <p className="mt-2 text-xs">{scannedCustomer ? "Choose a card on the right." : "Start the scanner to read a customer QR."}</p>
              </div>
            )}
          </div>

          <div className="mx-auto max-w-sm space-y-5">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/60">
              <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Manual Username</label>
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
                  disabled={!isWithinGeofence || isProcessing || isBatchMode}
                  className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={handleManualLookup}
                  disabled={!manualUsername.trim() || !isWithinGeofence || isProcessing || isBatchMode}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white transition-colors hover:bg-black disabled:opacity-50 dark:bg-white dark:text-gray-900"
                  title="Verify username"
                >
                  <Search className="h-4 w-4" />
                </button>
              </div>
              {manualError && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{manualError}</p>}
            </div>

            <div>
              <label className="mb-3 block text-center text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Credit to Add</label>
              <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800">
                <button
                  type="button"
                  onClick={() => setPointsToAdd((value) => normalizePoints(value - 1))}
                  className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-100 bg-white text-gray-600 shadow-sm hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                >
                  <Minus className="h-5 w-5" />
                </button>
                <span className="px-4 text-2xl font-bold text-gray-900 dark:text-white">{pointsToAdd}</span>
                <button
                  type="button"
                  onClick={() => setPointsToAdd((value) => normalizePoints(value + 1))}
                  className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-100 bg-white text-gray-600 shadow-sm hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </div>

            {isBatchMode && (
              <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/60">
                <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-3 py-3 dark:border-gray-700">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-gray-900 dark:text-white">Batch Queue</p>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{batchQueue.length} pending scan{batchQueue.length === 1 ? "" : "s"}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleConfirmBatch}
                    disabled={isProcessing || batchQueue.length === 0}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#1b1b1b] px-3 py-2 text-xs font-bold text-white transition hover:bg-black disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Confirm
                  </button>
                </div>

                {batchQueue.length === 0 ? (
                  <div className="p-4 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
                    Scanned customers will appear here.
                  </div>
                ) : (
                  <div className="max-h-64 space-y-2 overflow-y-auto p-3">
                    {batchQueue.map((item, index) => (
                      <div key={`${item.id}-${index}`} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-gray-900 dark:text-white">Customer Scan</p>
                          <p className="truncate font-mono text-[11px] text-gray-500">{item.id.slice(0, 18)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800">
                            <button type="button" onClick={() => updateBatchItemPoints(index, -1)} className="flex h-7 w-7 items-center justify-center rounded-md text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700">
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-6 text-center text-sm font-bold text-gray-900 dark:text-white">{item.points}</span>
                            <button type="button" onClick={() => updateBatchItemPoints(index, 1)} className="flex h-7 w-7 items-center justify-center rounded-md text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700">
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <button type="button" onClick={() => removeBatchItem(index)} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section
          className={
            scannedCustomer
              ? "fixed inset-0 z-50 flex items-center justify-center bg-gray-900/45 p-3 backdrop-blur-sm dark:bg-black/65 sm:p-6"
              : "rounded-[2rem] border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900"
          }
        >
          {!scannedCustomer ? (
            <div className="flex min-h-[28rem] flex-col items-center justify-center text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800">
                {selectedPromotion ? <Gift className="h-9 w-9 text-[#1b1b1b] dark:text-white" /> : <UserCircle className="h-9 w-9 text-gray-300 dark:text-gray-600" />}
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">No customer selected</h3>
              <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
                After scanning, the customer's profile summary and active cards for this shop will appear here.
              </p>
              {activeGeofence && (
                <p className="mt-4 rounded-2xl bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  Geofence: {activeGeofence.radiusMeters}m from {activeGeofence.label}
                </p>
              )}
            </div>
          ) : (
            <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-[1.5rem] border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900 sm:max-h-[min(760px,calc(100dvh-3rem))]">
              <div className="flex items-start gap-4 border-b border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/5 sm:p-5">
                <div className="min-w-0 flex flex-1 items-start gap-3">
                  {scannedCustomer.profilePic ? (
                    <img
                      src={getDisplayImageUrl(scannedCustomer.profilePic)}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-full border-4 border-white object-cover shadow-sm dark:border-gray-900"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 border-white bg-gray-100 shadow-sm dark:border-gray-900 dark:bg-white/10">
                      <UserCircle className="h-8 w-8 text-[#1b1b1b] dark:text-white" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Customer</p>
                      {scannedCustomer.isCachedPreview && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                          Cached
                        </span>
                      )}
                    </div>
                    <h3 className="truncate text-lg font-bold text-gray-900 dark:text-white">{scannedCustomer.maskedName}</h3>
                    <p className="mt-0.5 truncate font-mono text-sm text-[#1b1b1b] dark:text-white">@{scannedCustomer.username}</p>
                    <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400" title={scannedCustomer.id}>
                      Customer ID: {formatCustomerCode(scannedCustomer.id, scannedCustomer.publicId)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetScan}
                  disabled={isProcessing}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-gray-500 shadow-sm ring-1 ring-gray-200 transition hover:text-gray-900 disabled:opacity-50 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700 dark:hover:text-white"
                  title="Close customer panel"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
                {scannedCustomer.isCachedPreview && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    Showing saved customer info. Card crediting will refresh and verify the customer online before issuing a ticket.
                  </div>
                )}

                <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Active Cards</h3>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {scannedCustomer.cards.length}
                  </span>
                </div>

                {scannedCustomer.cards.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-gray-300 p-6 text-center dark:border-gray-700">
                    <Star className="mx-auto mb-3 h-9 w-9 text-gray-300 dark:text-gray-600" />
                    <p className="font-bold text-gray-900 dark:text-white">No active card for this shop</p>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Crediting this scan will start a new active card for the customer.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {scannedCustomer.cards.map((card) => {
                      const selected = selectedCardId === card.id;
                      return (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => setSelectedCardId(card.id)}
                          className={`w-full rounded-3xl border p-4 text-left transition-all ${
                            selected
                              ? "border-[#1b1b1b] bg-gray-100 shadow-sm dark:bg-white/10"
                              : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-white/20"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="truncate font-bold text-gray-900 dark:text-white">{card.label}</p>
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Joined {formatJoinedAt(card.joinedAt)}</p>
                              <p className="mt-1 truncate font-mono text-[11px] text-gray-400">{card.id}</p>
                            </div>
                            <div className="shrink-0 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 text-center dark:border-gray-700 dark:bg-gray-800">
                              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">{normalizeStampStyle(card).stampLabel}</p>
                              <p className="flex items-center justify-center gap-1 text-xl font-black text-gray-900 dark:text-white">
                                {selectedPromotionId ? Number(card.promoProgress?.[selectedPromotionId] || 0) : card.stars}
                                <StoreStamp style={card} size="sm" />
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

                <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/50">
                <div className="grid grid-cols-3 items-center text-center">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Current</p>
                    <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{currentStars}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#1b1b1b] dark:text-white">Add</p>
                    <p className="mt-1 text-xl font-bold text-[#1b1b1b] dark:text-white">+{pointsToAdd}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-500">New</p>
                    <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{currentStars + pointsToAdd}</p>
                  </div>
                </div>
              </div>
              </div>

              <div className="flex shrink-0 flex-col gap-3 border-t border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:p-5">
                <button
                  type="button"
                  onClick={resetScan}
                  disabled={isProcessing}
                  className="flex-1 rounded-xl bg-gray-100 px-4 py-3 font-bold text-gray-700 transition hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Scan Another
                </button>
                <button
                  type="button"
                  onClick={handleCredit}
                  disabled={isProcessing}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1b1b1b] px-4 py-3 font-bold text-white shadow-lg shadow-black/20 transition hover:bg-black disabled:opacity-50"
                >
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Credit Selected Card
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm dark:bg-black/60">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-100 p-6 dark:border-gray-800 dark:bg-white/5">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Review Batch</h3>
              <span className="rounded-xl bg-gray-200 px-3 py-1 text-sm font-bold text-[#1b1b1b] dark:bg-white/15 dark:text-white">{batchQueue.length} pending</span>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {batchQueue.map((item, index) => (
                <div key={`${item.id}-${index}`} className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">Customer Scan</p>
                    <p className="truncate font-mono text-xs text-gray-500">{item.id.slice(0, 18)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-1.5 dark:border-gray-700 dark:bg-gray-900">
                      <button type="button" onClick={() => updateBatchItemPoints(index, -1)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300">
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-5 text-center text-sm font-bold text-gray-900 dark:text-white">{item.points}</span>
                      <button type="button" onClick={() => updateBatchItemPoints(index, 1)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300">
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <button type="button" onClick={() => removeBatchItem(index)} className="p-2 text-gray-400 transition-colors hover:text-red-500">
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 border-t border-gray-100 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
              <button type="button" onClick={() => setShowBatchModal(false)} className="flex-1 rounded-xl bg-gray-100 px-4 py-3 font-bold text-gray-700 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300">
                Close
              </button>
              <button
                type="button"
                onClick={handleConfirmBatch}
                disabled={isProcessing || batchQueue.length === 0}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1b1b1b] px-4 py-3 font-bold text-white transition hover:bg-black disabled:opacity-50"
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirm All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
