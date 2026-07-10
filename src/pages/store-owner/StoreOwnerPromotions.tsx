import React, { useEffect, useMemo, useState } from "react";
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, deleteDoc, addDoc } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { Gift, Calendar, Plus, Edit2, Trash2, ArrowLeft, MapPin, ImagePlus, Users, Copy, Ticket, Loader2, ShoppingBag } from "lucide-react";
import { Circle, MapContainer, Marker, useMapEvents } from "react-leaflet";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import { deleteImageFromDriveSecure, getDisplayImageUrl, uploadImageFileToDriveSecure } from "../../lib/imageStorage";
import { getStoreReferralCode, getStoreReferralStats } from "../../lib/secureQr";
import { MapBaseLayers } from "../../components/MapBaseLayers";
import { formatPhilippineDateTime } from "../../lib/dateTime";
import { getCompletedPromotionCount, getRemainingPromotionClaimsLabel } from "../../lib/promotionProgress";
import { Pagination } from "../../components/Pagination";

type PromotionFormData = {
  title: string;
  description: string;
  requiredStamps: number;
  startDate: string;
  endDate: string;
  active: boolean;
  bannerImageUrl: string;
  maxRedemptions: number | "";
  claimExpiryDays: number;
  linkedProductId: string;
  linkedProductName: string;
  geofenceEnabled: boolean;
  geofenceLat: number | "";
  geofenceLng: number | "";
  geofenceRadiusMeters: number;
};

const DEFAULT_RADIUS_METERS = 500;
const DEFAULT_CENTER = { lat: 7.4478, lng: 125.8078 };
const PROMOTIONS_PER_PAGE = 6;

const getStoreCenter = (store: any) => ({
  lat: Number(store?.lat) || DEFAULT_CENTER.lat,
  lng: Number(store?.lng) || DEFAULT_CENTER.lng,
});

function GeofenceClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

export default function StoreOwnerPromotions({ store }: { store: any }) {
  const [promotions, setPromotions] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [promotionToDelete, setPromotionToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingPromo, setEditingPromo] = useState<any>(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [pendingBannerFile, setPendingBannerFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [availabilitySavingIds, setAvailabilitySavingIds] = useState<Set<string>>(new Set());
  const [referralCode, setReferralCode] = useState<string>(store?.referralCode || "");
  const [referralCodeExpiresAt, setReferralCodeExpiresAt] = useState<string>("");
  const [referralClock, setReferralClock] = useState(() => Date.now());
  const [referralCount, setReferralCount] = useState<number | null>(null);
  const [loadingReferralCode, setLoadingReferralCode] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const storeCenter = useMemo(() => getStoreCenter(store), [store]);
  const [formData, setFormData] = useState<PromotionFormData>({
    title: "",
    description: "",
    requiredStamps: 10,
    startDate: "",
    endDate: "",
    active: true,
    bannerImageUrl: "",
    maxRedemptions: "",
    claimExpiryDays: 7,
    linkedProductId: "",
    linkedProductName: "",
    geofenceEnabled: false,
    geofenceLat: storeCenter.lat,
    geofenceLng: storeCenter.lng,
    geofenceRadiusMeters: DEFAULT_RADIUS_METERS,
  });

  useEffect(() => {
    if (!store?.id) return;
    const storedExpirySeconds = Number(store?.referralCodeExpiresAt?.seconds || 0);
    const storedCreatedSeconds = Number(store?.referralCodeCreatedAt?.seconds || 0);
    const expiryMillis = storedExpirySeconds
      ? storedExpirySeconds * 1000
      : storedCreatedSeconds
        ? storedCreatedSeconds * 1000 + 30 * 24 * 60 * 60 * 1000
        : 0;
    setReferralCode(store?.referralCode || "");
    setReferralCodeExpiresAt(expiryMillis ? new Date(expiryMillis).toISOString() : "");
    setReferralCount(null);
    getStoreReferralStats(store.id)
      .then((stats) => setReferralCount(stats.referralCount))
      .catch((error) => console.error("Failed to load referral usage", error));
    const fetchPromotions = async () => {
      try {
        const [promotionsSnap, productsSnap, cardsSnap] = await Promise.all([
          getDocs(query(collection(db, "promotions"), where("storeId", "==", store.id))),
          getDocs(query(collection(db, "products"), where("storeId", "==", store.id))),
          getDocs(query(collection(db, "cards"), where("storeId", "==", store.id))),
        ]);
        const storeProducts = productsSnap.docs.map((productDoc) => ({ id: productDoc.id, ...productDoc.data() }));
        const cards = cardsSnap.docs.map((cardDoc) => ({ id: cardDoc.id, ...cardDoc.data() }));
        const promos = promotionsSnap.docs.map((d) => {
          const promo = { id: d.id, ...d.data() };
          return { ...promo, claimedCount: getCompletedPromotionCount(cards, promo) };
        });
        setProducts(storeProducts);
        setPromotions(promos);
      } catch (error) {
        console.error("Failed to fetch promos", error);
      } finally {
        setLoading(false);
      }
    };
    fetchPromotions();
  }, [store]);

  useEffect(() => {
    const timer = window.setInterval(() => setReferralClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const totalPages = Math.max(1, Math.ceil(promotions.length / PROMOTIONS_PER_PAGE));
  const paginatedPromotions = promotions.slice(
    (currentPage - 1) * PROMOTIONS_PER_PAGE,
    currentPage * PROMOTIONS_PER_PAGE,
  );

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const handleGetReferralCode = async () => {
    if (!store?.id || loadingReferralCode) return;
    setLoadingReferralCode(true);
    try {
      const result = await getStoreReferralCode(store.id);
      setReferralCode(result.referralCode);
      setReferralCodeExpiresAt(result.expiresAt);
      setReferralCount(result.referralCount);
    } catch (error) {
      alert((error as Error).message || "Failed to get referral code.");
    } finally {
      setLoadingReferralCode(false);
    }
  };

  const handleCopyReferralCode = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      alert("Referral code copied.");
    } catch {
      alert("Copy failed. Select and copy the code manually.");
    }
  };

  const resetForm = () => {
    setPendingBannerFile(null);
    setFormData({
      title: "",
      description: "",
      requiredStamps: 10,
      startDate: "",
      endDate: "",
      active: true,
      bannerImageUrl: "",
      maxRedemptions: "",
      claimExpiryDays: 7,
      linkedProductId: "",
      linkedProductName: "",
      geofenceEnabled: false,
      geofenceLat: storeCenter.lat,
      geofenceLng: storeCenter.lng,
      geofenceRadiusMeters: DEFAULT_RADIUS_METERS,
    });
  };

  const handleOpenModal = (promo: any = null) => {
    setPendingBannerFile(null);
    if (promo) {
      setEditingPromo(promo);
      setFormData({
        title: promo.title || "",
        description: promo.description || "",
        requiredStamps: Number(promo.requiredStamps || 10),
        startDate: promo.startDate || "",
        endDate: promo.endDate || "",
        active: promo.active ?? true,
        bannerImageUrl: promo.bannerImageUrl || "",
        maxRedemptions: promo.maxRedemptions ? Number(promo.maxRedemptions) : "",
        claimExpiryDays: Math.max(Number(promo.claimExpiryDays || 7), 1),
        linkedProductId: promo.linkedProductId || "",
        linkedProductName: promo.linkedProductName || "",
        geofenceEnabled: Boolean(promo.geofenceEnabled),
        geofenceLat: Number(promo.geofenceLat || storeCenter.lat),
        geofenceLng: Number(promo.geofenceLng || storeCenter.lng),
        geofenceRadiusMeters: Number(promo.geofenceRadiusMeters || DEFAULT_RADIUS_METERS),
      });
    } else {
      setEditingPromo(null);
      resetForm();
    }
    setIsModalOpen(true);
  };

  const handleBannerUpload = (file: File | null) => {
    if (!file) return;
    if (formData.bannerImageUrl.startsWith("blob:")) URL.revokeObjectURL(formData.bannerImageUrl);
    setPendingBannerFile(file);
    setFormData((current) => ({ ...current, bannerImageUrl: URL.createObjectURL(file) }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      setUploadingBanner(Boolean(pendingBannerFile));
      const bannerImageUrl = pendingBannerFile
        ? await uploadImageFileToDriveSecure(pendingBannerFile, {
            owner: store?.id,
            purpose: "promotion-banner",
          })
        : formData.bannerImageUrl;
      const maxRedemptions = Number(formData.maxRedemptions || 0);
      const linkedProduct = products.find((product) => product.id === formData.linkedProductId);
      const data = {
        storeId: store.id,
        ...formData,
        bannerImageUrl,
        maxRedemptions: maxRedemptions > 0 ? maxRedemptions : null,
        linkedProductId: linkedProduct ? linkedProduct.id : null,
        linkedProductName: linkedProduct ? String(linkedProduct.name || "Product") : null,
        geofenceLat: formData.geofenceEnabled ? Number(formData.geofenceLat || storeCenter.lat) : null,
        geofenceLng: formData.geofenceEnabled ? Number(formData.geofenceLng || storeCenter.lng) : null,
        geofenceRadiusMeters: formData.geofenceEnabled ? Math.max(Number(formData.geofenceRadiusMeters || DEFAULT_RADIUS_METERS), 25) : null,
        updatedAt: serverTimestamp(),
      };

      if (editingPromo) {
        await updateDoc(doc(db, "promotions", editingPromo.id), data);
        if (editingPromo.bannerImageUrl && editingPromo.bannerImageUrl !== data.bannerImageUrl) {
          await deleteImageFromDriveSecure(editingPromo.bannerImageUrl).catch(console.error);
        }
        setPromotions(promotions.map((p) => (p.id === editingPromo.id ? { ...p, ...data } : p)));
      } else {
        const newRef = await addDoc(collection(db, "promotions"), { ...data, createdAt: serverTimestamp() });
        setPromotions([...promotions, { id: newRef.id, ...data, claimedCount: 0 }]);
      }
      setIsModalOpen(false);
      setPendingBannerFile(null);
    } catch (error) {
      console.error("Failed to save promotion", error);
      alert("Failed to save promotion");
    } finally {
      setUploadingBanner(false);
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!promotionToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "promotions", promotionToDelete.id));
      if (promotionToDelete.bannerImageUrl) await deleteImageFromDriveSecure(promotionToDelete.bannerImageUrl).catch(console.error);
      setPromotions((current) => current.filter((promotion) => promotion.id !== promotionToDelete.id));
      setPromotionToDelete(null);
    } catch (error) {
      alert("Failed to delete promotion");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAvailabilityToggle = async (promo: any) => {
    const nextActive = !(promo.active ?? true);

    setAvailabilitySavingIds((current) => new Set(current).add(promo.id));
    setPromotions((current) =>
      current.map((item) => item.id === promo.id ? { ...item, active: nextActive } : item)
    );

    try {
      await updateDoc(doc(db, "promotions", promo.id), {
        active: nextActive,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Failed to update promotion availability", error);
      setPromotions((current) =>
        current.map((item) => item.id === promo.id ? { ...item, active: !nextActive } : item)
      );
      alert("Failed to update promotion availability. Please try again.");
    } finally {
      setAvailabilitySavingIds((current) => {
        const next = new Set(current);
        next.delete(promo.id);
        return next;
      });
    }
  };

  if (loading) return <PageSkeleton variant="promotions" />;

  const referralCodeIsActive = Boolean(
    referralCode
    && referralCodeExpiresAt
    && new Date(referralCodeExpiresAt).getTime() > referralClock
  );

  const geofenceCenter = {
    lat: Number(formData.geofenceLat || storeCenter.lat),
    lng: Number(formData.geofenceLng || storeCenter.lng),
  };

  if (isModalOpen) {
    return (
      <div className="min-h-[calc(100vh-10rem)] space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
              title="Back to promotions"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{editingPromo ? "Edit Promotion" : "New Promotion"}</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Set the offer details, banner, availability, and scanner geofence.</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
            <section className="space-y-5">
              <div className="grid gap-5 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 sm:p-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Promotion Title</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g. Buy 10 getting 1 Coffee Free!"
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b]"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Description / Terms</label>
                  <textarea
                    rows={4}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Details about the promotion..."
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b] resize-none"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Stamps Required for Reward</label>
                    <input
                      type="number"
                      required
                      min="1"
                      max="100"
                      value={formData.requiredStamps}
                      onChange={(e) => setFormData({ ...formData, requiredStamps: parseInt(e.target.value) || 10 })}
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b]"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Availability Limit</label>
                    <input
                      type="number"
                      min="1"
                      value={formData.maxRedemptions}
                      onChange={(e) => setFormData({ ...formData, maxRedemptions: e.target.value ? parseInt(e.target.value) || "" : "" })}
                      placeholder="Unlimited"
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b]"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">Counts active reservations and redeemed rewards. Expired reservations release their slot.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Claim reservation period</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      required
                      min="1"
                      max="365"
                      value={formData.claimExpiryDays}
                      onChange={(event) => setFormData({ ...formData, claimExpiryDays: Math.min(Math.max(parseInt(event.target.value) || 1, 1), 365) })}
                      className="w-28 px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b]"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-300">days after the customer presses Claim</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">The reward is reserved during this period. If unused, it expires and the slot becomes available again.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-gray-500" /> Product Dependency
                  </label>
                  <select
                    value={formData.linkedProductId}
                    onChange={(event) => {
                      const product = products.find((item) => item.id === event.target.value);
                      setFormData({
                        ...formData,
                        linkedProductId: event.target.value,
                        linkedProductName: product ? String(product.name || "Product") : "",
                      });
                    }}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b]"
                  >
                    <option value="">No specific product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name || "Untitled product"}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Use this for product-specific offers like buy 10 coffees, get 1 coffee free.
                  </p>
                </div>
              </div>

              <div className="grid gap-5 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 sm:p-6">
                <label className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-500" /> Duration (Optional)
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">Start Date & Time</label>
                    <input
                      type="datetime-local"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">End Date & Time</label>
                    <input
                      type="datetime-local"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 sm:p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2">
                      <ImagePlus className="w-4 h-4 text-gray-500" /> Promotion Banner
                    </label>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Recommended: 1600 × 700 px (16:7)
                    </p>
                  </div>
                  <label className="px-3 py-2 rounded-xl bg-gray-900 text-white dark:bg-white dark:text-gray-900 text-xs font-bold cursor-pointer">
                    {uploadingBanner ? "Uploading..." : "Upload"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleBannerUpload(e.target.files?.[0] || null)} disabled={uploadingBanner} />
                  </label>
                </div>
                {formData.bannerImageUrl ? (
                  <img src={getDisplayImageUrl(formData.bannerImageUrl)} alt="" className="w-full aspect-[16/7] object-cover rounded-xl border border-gray-200 dark:border-gray-700" />
                ) : (
                  <div className="aspect-[16/7] min-h-40 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center text-sm text-gray-500">Banner preview</div>
                )}
              </div>
            </section>

            <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
              <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 sm:p-6">
                <div className="flex items-center justify-between gap-4">
                  <label className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-500" /> Scanner Geofence
                  </label>
                  <input type="checkbox" checked={formData.geofenceEnabled} onChange={(e) => setFormData({ ...formData, geofenceEnabled: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-[#1b1b1b] focus:ring-[#1b1b1b]" />
                </div>
                <div className={`space-y-3 ${formData.geofenceEnabled ? "" : "opacity-50 pointer-events-none"}`}>
                  <div className="h-[min(55vh,420px)] min-h-72 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                    <MapContainer key={`${geofenceCenter.lat}-${geofenceCenter.lng}-${isModalOpen}`} center={[geofenceCenter.lat, geofenceCenter.lng]} zoom={16} scrollWheelZoom={false} className="h-full w-full">
                      <MapBaseLayers />
                      <GeofenceClickHandler onPick={(lat, lng) => setFormData({ ...formData, geofenceLat: lat, geofenceLng: lng })} />
                      <Marker position={[geofenceCenter.lat, geofenceCenter.lng]} />
                      <Circle center={[geofenceCenter.lat, geofenceCenter.lng]} radius={Number(formData.geofenceRadiusMeters || DEFAULT_RADIUS_METERS)} pathOptions={{ color: "#1b1b1b", fillColor: "#fb923c", fillOpacity: 0.16 }} />
                    </MapContainer>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-gray-500">Latitude</label>
                      <input type="number" step="any" value={formData.geofenceLat} onChange={(e) => setFormData({ ...formData, geofenceLat: parseFloat(e.target.value) || "" })} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-gray-500">Longitude</label>
                      <input type="number" step="any" value={formData.geofenceLng} onChange={(e) => setFormData({ ...formData, geofenceLng: parseFloat(e.target.value) || "" })} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">Allowed Radius (meters)</label>
                    <input type="number" min="25" max="10000" value={formData.geofenceRadiusMeters} onChange={(e) => setFormData({ ...formData, geofenceRadiusMeters: parseInt(e.target.value) || DEFAULT_RADIUS_METERS })} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none" />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 sm:p-6">
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="active" checked={formData.active} onChange={(e) => setFormData({ ...formData, active: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-[#1b1b1b] focus:ring-[#1b1b1b]" />
                  <label htmlFor="active" className="text-sm font-medium text-gray-700 dark:text-gray-300">Run this promotion immediately</label>
                </div>
              </div>
            </aside>
          </div>

          <div className="sticky bottom-0 z-10 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-4 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 sm:mx-0 sm:rounded-2xl sm:border sm:px-5">
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl font-medium text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving || uploadingBanner} className="flex items-center justify-center gap-2 bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-6 py-2.5 rounded-xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">
                {saving ? "Saving..." : "Save Promotion"}
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Store Promotions</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Create and manage your loyalty and discount programs.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-4 py-2 rounded-xl font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors text-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Promotion
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-white/10 text-[#1b1b1b] dark:text-white flex items-center justify-center shrink-0">
              <Ticket className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">Store Referral Code</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Give this to new customers. If they sign up with it, they get 1 stamp from this store.
              </p>
              <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                {referralCount === null
                  ? "Loading referral usage..."
                  : `${referralCount} ${referralCount === 1 ? "person has" : "people have"} used your referral`}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:items-end gap-2">
            {referralCodeIsActive && promotions.length > 0 ? (
              <div className="flex flex-col sm:items-end gap-1">
                <div className="flex items-center gap-2">
                  <code className="rounded-xl bg-gray-50 dark:bg-gray-800 px-4 py-2 text-sm font-bold tracking-widest text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">
                    {referralCode}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyReferralCode}
                    className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-[#1b1b1b] hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                    title="Copy referral code"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                {referralCodeExpiresAt && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Expires {new Date(referralCodeExpiresAt).toLocaleString()}
                  </p>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={handleGetReferralCode}
                disabled={loadingReferralCode || promotions.length < 1}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              >
                <Ticket className="w-4 h-4" />
                {loadingReferralCode
                  ? "Checking..."
                  : referralCode ? "Get New Referral Code" : "Get Referral Code"}
              </button>
            )}
            {promotions.length < 1 && (
              <p className="text-xs font-medium text-[#1b1b1b] dark:text-white">
                Add at least one promotion before getting a code.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
        {promotions.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-gray-50 dark:bg-[#1b1b1b] rounded-3xl border border-dashed border-gray-200 dark:border-gray-800">
            <Gift className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-700 mb-3" />
            <p className="font-medium text-gray-900 dark:text-white">No promotions yet</p>
            <p className="text-sm text-gray-500 mt-1">Add your first promotional offer to attract customers.</p>
          </div>
        ) : (
          paginatedPromotions.map((promo) => (
            <div key={promo.id} className={`bg-white dark:bg-gray-900 border rounded-2xl overflow-hidden ${(promo.active ?? true) ? "border-gray-300 dark:border-white/15 shadow-sm" : "border-gray-200 dark:border-gray-800 opacity-75"}`}>
              {promo.bannerImageUrl && (
                <img src={getDisplayImageUrl(promo.bannerImageUrl)} alt="" loading="lazy" className="h-36 w-full object-cover" />
              )}
              <div className="p-6">
                <div className="flex justify-between items-start gap-4 mb-4">
                  <div className="flex gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${(promo.active ?? true) ? "bg-gray-100 dark:bg-white/15 text-[#1b1b1b] dark:text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-400"}`}>
                      <Gift className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-white">{promo.title}</h3>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${(promo.active ?? true) ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}>
                          {(promo.active ?? true) ? "Active" : "Inactive"}
                        </span>
                        <span className="text-xs text-gray-500 font-semibold">{promo.requiredStamps} Stamps Required</span>
                        {promo.linkedProductName && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500 font-semibold">
                            <ShoppingBag className="h-3.5 w-3.5" />
                            {promo.linkedProductName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">{promo.description}</p>

                <div className="grid gap-2 mb-4">
                  {(promo.startDate || promo.endDate) && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg">
                      <Calendar className="w-4 h-4 shrink-0" />
                      <span>{promo.startDate ? formatPhilippineDateTime(promo.startDate) : "Anytime"} - {promo.endDate ? formatPhilippineDateTime(promo.endDate) : "No expiry"}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg">
                    <Users className="w-4 h-4 shrink-0" />
                    <span>{getRemainingPromotionClaimsLabel(promo)}</span>
                  </div>
                  {promo.geofenceEnabled && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg">
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span>{promo.geofenceRadiusMeters || DEFAULT_RADIUS_METERS}m scanner geofence</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={promo.active ?? true}
                    aria-label={`Mark ${promo.title} as ${(promo.active ?? true) ? "inactive" : "active"}`}
                    disabled={availabilitySavingIds.has(promo.id)}
                    onClick={() => handleAvailabilityToggle(promo)}
                    className={`group/switch flex min-h-9 items-center gap-2.5 rounded-full border py-1.5 pl-2 pr-3 text-xs font-bold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0 dark:focus-visible:ring-white ${
                      (promo.active ?? true)
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-950/80"
                        : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    }`}
                  >
                    <span className={`relative h-5 w-9 shrink-0 rounded-full shadow-inner transition-colors ${
                      (promo.active ?? true) ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
                    }`}>
                      <span className={`absolute left-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white shadow transition-transform duration-200 ${
                        (promo.active ?? true) ? "translate-x-4" : "translate-x-0"
                      }`}>
                        {availabilitySavingIds.has(promo.id) && (
                          <Loader2 className="h-2.5 w-2.5 animate-spin text-gray-500" />
                        )}
                      </span>
                    </span>
                    <span className="min-w-[4.6rem] text-left">
                      {availabilitySavingIds.has(promo.id)
                        ? "Updating..."
                        : (promo.active ?? true) ? "Active" : "Inactive"}
                    </span>
                    <span className="sr-only">
                      {`Click to mark as ${(promo.active ?? true) ? "inactive" : "active"}`}
                    </span>
                  </button>
                  <div className="flex gap-2">
                  <button type="button" aria-label={`Edit ${promo.title}`} onClick={() => handleOpenModal(promo)} className="p-2 text-gray-500 hover:text-[#1b1b1b] hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button type="button" aria-label={`Delete ${promo.title}`} onClick={() => setPromotionToDelete(promo)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <Pagination
        page={currentPage}
        pageSize={PROMOTIONS_PER_PAGE}
        totalItems={promotions.length}
        itemLabel="promotions"
        onPageChange={setCurrentPage}
      />

      <ConfirmationModal
        isOpen={Boolean(promotionToDelete)}
        title="Delete promotion?"
        description={`“${promotionToDelete?.title || "This promotion"}” will be permanently removed. Existing customer progress associated with it may no longer be available.`}
        confirmLabel="Delete promotion"
        isLoading={isDeleting}
        onClose={() => setPromotionToDelete(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
