import React, { useEffect, useMemo, useState } from "react";
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, deleteDoc, addDoc } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { Gift, Calendar, Plus, Edit2, Trash2, ArrowLeft, MapPin, ImagePlus, Users, Copy, Ticket } from "lucide-react";
import { Circle, MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { deleteImageFromDriveSecure, getDisplayImageUrl, uploadImageFileToDriveSecure } from "../../lib/imageStorage";
import { getStoreReferralCode } from "../../lib/secureQr";

type PromotionFormData = {
  title: string;
  description: string;
  requiredStamps: number;
  startDate: string;
  endDate: string;
  active: boolean;
  bannerImageUrl: string;
  maxRedemptions: number | "";
  geofenceEnabled: boolean;
  geofenceLat: number | "";
  geofenceLng: number | "";
  geofenceRadiusMeters: number;
};

const DEFAULT_RADIUS_METERS = 500;
const DEFAULT_CENTER = { lat: 14.5995, lng: 120.9842 };

const getStoreCenter = (store: any) => ({
  lat: Number(store?.lat) || DEFAULT_CENTER.lat,
  lng: Number(store?.lng) || DEFAULT_CENTER.lng,
});

const getRemainingClaims = (promo: any) => {
  const maxRedemptions = Number(promo.maxRedemptions || 0);
  if (!maxRedemptions) return "Unlimited";
  return `${Math.max(maxRedemptions - Number(promo.claimedCount || 0), 0)} / ${maxRedemptions} left`;
};

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
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<any>(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [referralCode, setReferralCode] = useState<string>(store?.referralCode || "");
  const [loadingReferralCode, setLoadingReferralCode] = useState(false);

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
    geofenceEnabled: false,
    geofenceLat: storeCenter.lat,
    geofenceLng: storeCenter.lng,
    geofenceRadiusMeters: DEFAULT_RADIUS_METERS,
  });

  useEffect(() => {
    if (!store?.id) return;
    setReferralCode(store?.referralCode || "");
    const fetchPromotions = async () => {
      try {
        const q = query(collection(db, "promotions"), where("storeId", "==", store.id));
        const snap = await getDocs(q);
        const promos = await Promise.all(
          snap.docs.map(async (d) => {
            const promo = { id: d.id, ...d.data() };
            const claimsQuery = query(collection(db, "promotions_scanned"), where("promotionId", "==", d.id));
            const claimsSnap = await getDocs(claimsQuery);
            return { ...promo, claimedCount: claimsSnap.size };
          }),
        );
        setPromotions(promos);
      } catch (error) {
        console.error("Failed to fetch promos", error);
      } finally {
        setLoading(false);
      }
    };
    fetchPromotions();
  }, [store]);

  const handleGetReferralCode = async () => {
    if (!store?.id || loadingReferralCode) return;
    setLoadingReferralCode(true);
    try {
      const result = await getStoreReferralCode(store.id);
      setReferralCode(result.referralCode);
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
    setFormData({
      title: "",
      description: "",
      requiredStamps: 10,
      startDate: "",
      endDate: "",
      active: true,
      bannerImageUrl: "",
      maxRedemptions: "",
      geofenceEnabled: false,
      geofenceLat: storeCenter.lat,
      geofenceLng: storeCenter.lng,
      geofenceRadiusMeters: DEFAULT_RADIUS_METERS,
    });
  };

  const handleOpenModal = (promo: any = null) => {
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

  const handleBannerUpload = async (file: File | null) => {
    if (!file) return;
    setUploadingBanner(true);
    try {
      const imageUrl = await uploadImageFileToDriveSecure(file, {
        owner: store?.id,
        purpose: "promotion-banner",
      });
      setFormData((current) => ({ ...current, bannerImageUrl: imageUrl }));
    } catch (error) {
      console.error("Promotion banner upload failed", error);
      alert("Failed to upload promotion banner.");
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const maxRedemptions = Number(formData.maxRedemptions || 0);
      const data = {
        storeId: store.id,
        ...formData,
        maxRedemptions: maxRedemptions > 0 ? maxRedemptions : null,
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
    } catch (error) {
      console.error("Failed to save promotion", error);
      alert("Failed to save promotion");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this promotion?")) return;
    try {
      const promotion = promotions.find((item) => item.id === id);
      await deleteDoc(doc(db, "promotions", id));
      if (promotion?.bannerImageUrl) await deleteImageFromDriveSecure(promotion.bannerImageUrl).catch(console.error);
      setPromotions(promotions.filter((p) => p.id !== id));
    } catch (error) {
      alert("Failed to delete promotion");
    }
  };

  if (loading) return <PageSkeleton variant="promotions" />;

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
                  </div>
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
                  <label className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2">
                    <ImagePlus className="w-4 h-4 text-gray-500" /> Promotion Banner
                  </label>
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
                      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
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
            </div>
          </div>

          <div className="flex flex-col sm:items-end gap-2">
            {referralCode && promotions.length > 0 ? (
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
            ) : (
              <button
                type="button"
                onClick={handleGetReferralCode}
                disabled={loadingReferralCode || promotions.length < 1}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              >
                <Ticket className="w-4 h-4" />
                {loadingReferralCode ? "Checking..." : "Get Referral Code"}
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
          promotions.map((promo) => (
            <div key={promo.id} className={`bg-white dark:bg-gray-900 border rounded-2xl overflow-hidden ${promo.active ? "border-gray-300 dark:border-white/15 shadow-sm" : "border-gray-200 dark:border-gray-800 opacity-75"}`}>
              {promo.bannerImageUrl && (
                <img src={getDisplayImageUrl(promo.bannerImageUrl)} alt="" className="h-36 w-full object-cover" />
              )}
              <div className="p-6">
                <div className="flex justify-between items-start gap-4 mb-4">
                  <div className="flex gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${promo.active ? "bg-gray-100 dark:bg-white/15 text-[#1b1b1b] dark:text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-400"}`}>
                      <Gift className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-white">{promo.title}</h3>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${promo.active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}>
                          {promo.active ? "Active" : "Inactive"}
                        </span>
                        <span className="text-xs text-gray-500 font-semibold">{promo.requiredStamps} Stamps Required</span>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">{promo.description}</p>

                <div className="grid gap-2 mb-4">
                  {(promo.startDate || promo.endDate) && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg">
                      <Calendar className="w-4 h-4 shrink-0" />
                      <span>{promo.startDate ? new Date(promo.startDate).toLocaleString() : "Anytime"} - {promo.endDate ? new Date(promo.endDate).toLocaleString() : "No expiry"}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg">
                    <Users className="w-4 h-4 shrink-0" />
                    <span>{getRemainingClaims(promo)}</span>
                  </div>
                  {promo.geofenceEnabled && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg">
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span>{promo.geofenceRadiusMeters || DEFAULT_RADIUS_METERS}m scanner geofence</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <button onClick={() => handleOpenModal(promo)} className="p-2 text-gray-500 hover:text-[#1b1b1b] hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(promo.id)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
}
