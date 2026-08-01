import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, deleteDoc, addDoc } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { Gift, Calendar, Plus, Edit2, Trash2, ArrowLeft, MapPin, ImagePlus, Users, Copy, Ticket, Loader2, ShoppingBag, Archive, ChevronDown, Search, SlidersHorizontal, LayoutGrid, Rows3, X } from "lucide-react";
import { Circle, MapContainer, Marker, useMapEvents } from "react-leaflet";
import { PageSkeleton, SkeletonBlock } from "../../components/LoadingSkeleton";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import { deleteImageFromDriveSecure, getDisplayImageUrl, uploadImageFileToDriveSecure } from "../../lib/imageStorage";
import { getStoreReferralCode, getStoreReferralStats } from "../../lib/secureQr";
import { MapBaseLayers } from "../../components/MapBaseLayers";
import { formatPhilippineDateTime, getPhilippineDateTimeMillis, toDate } from "../../lib/dateTime";
import { getCompletedPromotionCount, getRemainingPromotionClaimsLabel } from "../../lib/promotionProgress";
import { Pagination } from "../../components/Pagination";
import { ScrollableRegion } from "../../components/ScrollableRegion";
import { CustomDropdown } from "../../components/CustomDropdown";
import { ViewModeButton } from "../../components/ViewModeButton";
import { AnimatePresence, motion } from "motion/react";
import { useToast } from "../../components/ToastProvider";

type PromotionFormData = {
  title: string;
  description: string;
  redemptionInstructions: string;
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

type PromotionViewMode = "grid" | "list";
type PromotionLifecycleFilter = "all" | "live" | "scheduled";
type PromotionProductFilter = "all" | "linked" | "general";
type PromotionSortOrder = "newest" | "oldest" | "endingSoon";

const ownerPromotionViewOptions = [
  { value: "grid", label: "Card", icon: LayoutGrid },
  { value: "list", label: "List", icon: Rows3 },
] as const;

const isPromotionExpired = (promotion: any, now = Date.now()) => {
  if (!promotion?.endDate) return false;
  const endTime = getPhilippineDateTimeMillis(promotion.endDate);
  return Number.isFinite(endTime) && endTime <= now;
};

const getPromotionCreatedAtMillis = (promotion: any) =>
  toDate(promotion?.createdAt)?.getTime() ?? 0;

const matchesPromotionSearch = (promotion: any, normalizedQuery: string) => {
  if (!normalizedQuery) return true;
  return [
    promotion?.publicId,
    promotion?.title,
    promotion?.description,
    promotion?.redemptionInstructions,
    promotion?.linkedProductName,
  ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
};

const matchesProductFilter = (promotion: any, filter: PromotionProductFilter) => {
  if (filter === "linked") return Boolean(promotion?.linkedProductId || promotion?.linkedProductName);
  if (filter === "general") return !promotion?.linkedProductId && !promotion?.linkedProductName;
  return true;
};

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
  const toast = useToast();
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
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [referralOpen, setReferralOpen] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedArchivedPromotion, setSelectedArchivedPromotion] = useState<any>(null);
  const [promotionClock, setPromotionClock] = useState(() => Date.now());
  const [searchQuery, setSearchQuery] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState<PromotionLifecycleFilter>("all");
  const [productFilter, setProductFilter] = useState<PromotionProductFilter>("all");
  const [sortOrder, setSortOrder] = useState<PromotionSortOrder>("newest");
  const [viewMode, setViewMode] = useState<PromotionViewMode>("grid");
  const expirySyncingIds = useRef(new Set<string>());

  const storeCenter = useMemo(() => getStoreCenter(store), [store]);
  const [formData, setFormData] = useState<PromotionFormData>({
    title: "",
    description: "",
    redemptionInstructions: "",
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

  useEffect(() => {
    const timer = window.setInterval(() => setPromotionClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (loading) return;

    const expiredPromotions = promotions.filter((promotion) =>
      (promotion.active ?? true)
      && isPromotionExpired(promotion, promotionClock)
      && !expirySyncingIds.current.has(promotion.id)
    );
    if (expiredPromotions.length === 0) return;

    expiredPromotions.forEach((promotion) => expirySyncingIds.current.add(promotion.id));
    void Promise.allSettled(expiredPromotions.map(async (promotion) => {
      try {
        await updateDoc(doc(db, "promotions", promotion.id), {
          active: false,
          updatedAt: serverTimestamp(),
        });
        setPromotions((current) => current.map((item) =>
          item.id === promotion.id ? { ...item, active: false } : item
        ));
      } catch (error) {
        console.error(`Failed to automatically archive promotion ${promotion.id}`, error);
      } finally {
        expirySyncingIds.current.delete(promotion.id);
      }
    }));
  }, [loading, promotionClock, promotions]);

  const activePromotions = useMemo(() => promotions.filter((promotion) =>
    (promotion.active ?? true) && !isPromotionExpired(promotion, promotionClock)
  ), [promotionClock, promotions]);
  const archivedPromotions = useMemo(() => promotions.filter((promotion) =>
    !(promotion.active ?? true) || isPromotionExpired(promotion, promotionClock)
  ), [promotionClock, promotions]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const visibleActivePromotions = useMemo(() => activePromotions
    .filter((promotion) => matchesPromotionSearch(promotion, normalizedSearchQuery))
    .filter((promotion) => matchesProductFilter(promotion, productFilter))
    .filter((promotion) => {
      if (lifecycleFilter === "all") return true;
      const startsAt = promotion.startDate ? getPhilippineDateTimeMillis(promotion.startDate) : Number.NaN;
      const scheduled = Number.isFinite(startsAt) && startsAt > promotionClock;
      return lifecycleFilter === "scheduled" ? scheduled : !scheduled;
    })
    .sort((first, second) => {
      if (sortOrder === "oldest") {
        return getPromotionCreatedAtMillis(first) - getPromotionCreatedAtMillis(second);
      }
      if (sortOrder === "endingSoon") {
        const firstEnd = first.endDate ? getPhilippineDateTimeMillis(first.endDate) : Number.POSITIVE_INFINITY;
        const secondEnd = second.endDate ? getPhilippineDateTimeMillis(second.endDate) : Number.POSITIVE_INFINITY;
        return firstEnd - secondEnd;
      }
      return getPromotionCreatedAtMillis(second) - getPromotionCreatedAtMillis(first);
    }), [activePromotions, lifecycleFilter, normalizedSearchQuery, productFilter, promotionClock, sortOrder]);

  const visibleArchivedPromotions = useMemo(() => archivedPromotions
    .filter((promotion) => matchesPromotionSearch(promotion, normalizedSearchQuery))
    .filter((promotion) => matchesProductFilter(promotion, productFilter))
    .sort((first, second) => getPromotionCreatedAtMillis(second) - getPromotionCreatedAtMillis(first)),
  [archivedPromotions, normalizedSearchQuery, productFilter]);

  const hasActiveFilters = Boolean(normalizedSearchQuery || lifecycleFilter !== "all" || productFilter !== "all");
  const totalPages = Math.max(1, Math.ceil(visibleActivePromotions.length / PROMOTIONS_PER_PAGE));
  const paginatedPromotions = visibleActivePromotions.slice(
    (currentPage - 1) * PROMOTIONS_PER_PAGE,
    currentPage * PROMOTIONS_PER_PAGE,
  );

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [lifecycleFilter, normalizedSearchQuery, productFilter, sortOrder]);

  useEffect(() => {
    if (!selectedArchivedPromotion) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedArchivedPromotion(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedArchivedPromotion]);

  const handleGetReferralCode = async () => {
    if (!store?.id || loadingReferralCode) return;
    setLoadingReferralCode(true);
    const progressToastId = toast.progress("Getting your referral code…", { title: "Referral code" });
    try {
      const result = await getStoreReferralCode(store.id);
      setReferralCode(result.referralCode);
      setReferralCodeExpiresAt(result.expiresAt);
      setReferralCount(result.referralCount);
      toast.update(progressToastId, "Your referral code is ready.", "success", { title: "Code loaded" });
    } catch (error) {
      toast.update(progressToastId, (error as Error).message || "The referral code could not be loaded.", "error", { error, title: "Code unavailable" });
    } finally {
      setLoadingReferralCode(false);
    }
  };

  const handleCopyReferralCode = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      toast.success("Referral code copied.");
    } catch (error) {
      toast.error("Clipboard access was unavailable. Select and copy the code manually.", { error, title: "Copy failed" });
    }
  };

  const resetForm = () => {
    setPendingBannerFile(null);
    setFormData({
      title: "",
      description: "",
      redemptionInstructions: "",
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
        redemptionInstructions: promo.redemptionInstructions || "",
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
    const progressToastId = toast.progress(editingPromo ? "Saving promotion changes…" : "Creating the promotion…", { title: editingPromo ? "Updating promotion" : "New promotion" });
    let uploadedBannerUrl = "";
    let promotionPersisted = false;
    try {
      setUploadingBanner(Boolean(pendingBannerFile));
      const bannerImageUrl = pendingBannerFile
        ? await uploadImageFileToDriveSecure(pendingBannerFile, {
            owner: store?.id,
            purpose: "promotion-banner",
          })
        : formData.bannerImageUrl;
      if (pendingBannerFile) uploadedBannerUrl = bannerImageUrl;
      const maxRedemptions = Number(formData.maxRedemptions || 0);
      const linkedProduct = products.find((product) => product.id === formData.linkedProductId);
      const data = {
        storeId: store.id,
        ...formData,
        active: formData.active && !isPromotionExpired(formData),
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
        promotionPersisted = true;
        if (editingPromo.bannerImageUrl && editingPromo.bannerImageUrl !== data.bannerImageUrl) {
          await deleteImageFromDriveSecure(editingPromo.bannerImageUrl).catch(console.error);
        }
        setPromotions(promotions.map((p) => (p.id === editingPromo.id ? { ...p, ...data } : p)));
      } else {
        const createdAt = serverTimestamp();
        const newRef = await addDoc(collection(db, "promotions"), { ...data, createdAt });
        promotionPersisted = true;
        setPromotions([...promotions, { id: newRef.id, ...data, createdAt, claimedCount: 0 }]);
      }
      setIsModalOpen(false);
      setPendingBannerFile(null);
      toast.update(progressToastId, editingPromo ? "Promotion changes saved." : "Promotion created.", "success", { title: editingPromo ? "Promotion updated" : "Promotion created" });
    } catch (error) {
      if (!promotionPersisted && uploadedBannerUrl) {
        await deleteImageFromDriveSecure(uploadedBannerUrl).catch(console.error);
      }
      console.error("Failed to save promotion", error);
      toast.update(progressToastId, "The promotion could not be saved.", "error", { error, title: "Save failed" });
    } finally {
      setUploadingBanner(false);
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!promotionToDelete) return;
    setIsDeleting(true);
    const progressToastId = toast.progress("Deleting the promotion…", { title: "Deleting promotion" });
    try {
      await deleteDoc(doc(db, "promotions", promotionToDelete.id));
      if (promotionToDelete.bannerImageUrl) await deleteImageFromDriveSecure(promotionToDelete.bannerImageUrl).catch(console.error);
      setPromotions((current) => current.filter((promotion) => promotion.id !== promotionToDelete.id));
      setPromotionToDelete(null);
      toast.update(progressToastId, "The promotion was deleted.", "success", { title: "Promotion deleted" });
    } catch (error) {
      toast.update(progressToastId, "The promotion could not be deleted.", "error", { error, title: "Delete failed" });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAvailabilityToggle = async (promo: any) => {
    if (isPromotionExpired(promo)) return;
    const nextActive = !(promo.active ?? true);
    const progressToastId = toast.progress(`${nextActive ? "Publishing" : "Pausing"} the promotion…`, { title: "Updating availability" });

    setAvailabilitySavingIds((current) => new Set(current).add(promo.id));
    setPromotions((current) =>
      current.map((item) => item.id === promo.id ? { ...item, active: nextActive } : item)
    );

    try {
      await updateDoc(doc(db, "promotions", promo.id), {
        active: nextActive,
        updatedAt: serverTimestamp(),
      });
      toast.update(progressToastId, `Promotion ${nextActive ? "published" : "paused"}.`, "success", { title: "Availability updated" });
    } catch (error) {
      console.error("Failed to update promotion availability", error);
      setPromotions((current) =>
        current.map((item) => item.id === promo.id ? { ...item, active: !nextActive } : item)
      );
      toast.update(progressToastId, "The promotion availability could not be updated.", "error", { error, title: "Update failed" });
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

  const renderPromotionCard = (promo: any) => {
    const expired = isPromotionExpired(promo, promotionClock);
    const active = (promo.active ?? true) && !expired;
    const availabilitySaving = availabilitySavingIds.has(promo.id);

    const openDetails = () => setSelectedArchivedPromotion(promo);

    return (
      <motion.article
        layout
        key={promo.id}
        role="button"
        tabIndex={0}
        aria-label={`View archived promotion ${promo.title}`}
        onClick={openDetails}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openDetails();
          }
        }}
        whileHover={{ y: -2 }}
        className="group cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-gray-100 text-gray-600 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-300 dark:focus-visible:ring-white"
      >
        {promo.bannerImageUrl && (
          <img src={getDisplayImageUrl(promo.bannerImageUrl)} alt="" loading="lazy" decoding="async" className="h-24 w-full object-cover grayscale" />
        )}
        <div className="p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                <Gift className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold text-gray-700 dark:text-gray-200">{promo.title}</h3>
                {promo.publicId && <p className="font-mono text-[10px] font-semibold text-gray-400">{promo.publicId}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    {expired ? "Expired" : "Inactive"}
                  </span>
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{promo.requiredStamps} stamps</span>
                  {promo.linkedProductName && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                      <ShoppingBag className="h-3.5 w-3.5" />
                      {promo.linkedProductName}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <p className="mb-3 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{promo.description || "No description provided."}</p>

          <div className="mb-3 grid gap-1.5">
            {(promo.startDate || promo.endDate) && (
              <div className="flex items-center gap-2 rounded-lg bg-gray-200/70 p-2 text-[11px] text-gray-500 dark:bg-gray-700/70 dark:text-gray-400">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span>{promo.startDate ? formatPhilippineDateTime(promo.startDate) : "Anytime"} - {promo.endDate ? formatPhilippineDateTime(promo.endDate) : "No expiry"}</span>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-lg bg-gray-200/70 p-2 text-[11px] text-gray-500 dark:bg-gray-700/70 dark:text-gray-400">
              <Users className="h-3.5 w-3.5 shrink-0" />
              <span>{getRemainingPromotionClaimsLabel(promo)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-gray-300 pt-3 dark:border-gray-700">
            <button
              type="button"
              role="switch"
              aria-checked={active}
              aria-label={expired ? `${promo.title} has expired` : `Mark ${promo.title} as ${active ? "inactive" : "active"}`}
              disabled={availabilitySaving || expired}
              onClick={(event) => {
                event.stopPropagation();
                handleAvailabilityToggle(promo);
              }}
              title={expired ? "Edit the end time before reactivating this promotion." : undefined}
              className={`group/switch flex min-h-9 items-center gap-2.5 rounded-full border py-1.5 pl-2 pr-3 text-xs font-bold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 dark:focus-visible:ring-white ${
                active
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-950/80"
                  : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              <span className={`relative h-5 w-9 shrink-0 rounded-full shadow-inner transition-colors ${active ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`}>
                <span className={`absolute left-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white shadow transition-transform duration-200 ${active ? "translate-x-4" : "translate-x-0"}`}>
                  {availabilitySaving && <Loader2 className="h-2.5 w-2.5 animate-spin text-gray-500" />}
                </span>
              </span>
              <span className="min-w-[4.6rem] text-left">
                {availabilitySaving ? "Updating..." : expired ? "Expired" : active ? "Active" : "Inactive"}
              </span>
            </button>
            <div className="flex gap-2">
              <button type="button" aria-label={`Edit ${promo.title}`} onClick={(event) => { event.stopPropagation(); handleOpenModal(promo); }} className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900 dark:hover:bg-gray-700 dark:hover:text-white">
                <Edit2 className="w-4 h-4" />
              </button>
              <button type="button" aria-label={`Delete ${promo.title}`} onClick={(event) => { event.stopPropagation(); setPromotionToDelete(promo); }} className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </motion.article>
    );
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

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Claim / Redeem Instructions</label>
                  <textarea
                    rows={3}
                    maxLength={1000}
                    value={formData.redemptionInstructions}
                    onChange={(event) => setFormData({ ...formData, redemptionInstructions: event.target.value })}
                    placeholder="e.g. Show your one-time QR at the cashier and present a valid ID."
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b] resize-none"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">Customers see these instructions after reserving the reward.</p>
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
                  <CustomDropdown
                    value={formData.linkedProductId}
                    onChange={(linkedProductId) => {
                      const product = products.find((item) => item.id === linkedProductId);
                      setFormData({
                        ...formData,
                        linkedProductId,
                        linkedProductName: product ? String(product.name || "Product") : "",
                      });
                    }}
                    options={[
                      { label: "No specific product", value: "" },
                      ...products.map((product) => ({
                        label: product.name || "Untitled product",
                        value: product.id,
                      })),
                    ]}
                    ariaLabel="Product dependency"
                    className="w-full [&>button]:min-h-[42px] [&>button]:px-4 [&>button]:py-2.5"
                  />
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
              <button type="submit" disabled={saving || uploadingBanner} aria-label="Save promotion" className="flex items-center justify-center gap-2 bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-6 py-2.5 rounded-xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">
                {saving ? "Saving..." : "Save"}
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
          aria-label="Add promotion"
          className="flex items-center gap-2 bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-4 py-2 rounded-xl font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors text-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <button
          type="button"
          aria-expanded={referralOpen}
          aria-controls="store-referral-content"
          onClick={() => setReferralOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/5"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-[#1b1b1b] dark:bg-white/10 dark:text-white">
              <Ticket className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-bold text-gray-900 dark:text-white">Store Referral Code</span>
              <span className="mt-0.5 block text-sm text-gray-500 dark:text-gray-400">Share a code with new customers</span>
            </span>
          </span>
          <ChevronDown className={`h-5 w-5 shrink-0 text-gray-500 transition-transform duration-300 ${referralOpen ? "rotate-180" : ""}`} />
        </button>

        <AnimatePresence initial={false}>
          {referralOpen && (
            <motion.div
              id="store-referral-content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-4 border-t border-gray-200 p-5 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Give this to new customers. If they sign up with it, they get 1 stamp from this store.</p>
                  {referralCount === null ? <SkeletonBlock className="mt-2 h-5 w-52 rounded-lg" /> : <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{referralCount} {referralCount === 1 ? "person has" : "people have"} used your referral</p>}
                </div>

                <div className="flex flex-col gap-2 sm:items-end">
                  {referralCodeIsActive && promotions.length > 0 ? (
                    <div className="flex flex-col gap-1 sm:items-end">
                      <div className="flex items-center gap-2">
                        <code className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-bold tracking-widest text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white">{referralCode}</code>
                        <button type="button" onClick={handleCopyReferralCode} className="rounded-xl border border-gray-200 p-2.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-[#1b1b1b] dark:border-gray-700 dark:hover:bg-white/10 dark:hover:text-white" title="Copy referral code">
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                      {referralCodeExpiresAt && <p className="text-xs text-gray-500 dark:text-gray-400">Expires {new Date(referralCodeExpiresAt).toLocaleString()}</p>}
                    </div>
                  ) : (
                    <button type="button" onClick={handleGetReferralCode} disabled={loadingReferralCode || promotions.length < 1} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100">
                      <Ticket className="h-4 w-4" />
                      {loadingReferralCode ? "Checking..." : referralCode ? "Get New Referral Code" : "Get Referral Code"}
                    </button>
                  )}
                  {promotions.length < 1 && <p className="text-xs font-medium text-[#1b1b1b] dark:text-white">Add at least one promotion before getting a code.</p>}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search promotions, products, or descriptions"
              aria-label="Search promotions"
              className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-900/10 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-gray-500 dark:focus:ring-white/10"
            />
          </div>
          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="promotion-filters-content"
            onClick={() => setFiltersOpen((open) => !open)}
            className={`inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors ${
              filtersOpen || lifecycleFilter !== "all" || productFilter !== "all"
                ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {(lifecycleFilter !== "all" || productFilter !== "all") && <span className="h-2 w-2 rounded-full bg-emerald-400" aria-label="Filters active" />}
            <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
          </button>
        </div>

        <AnimatePresence initial={false}>
          {filtersOpen && (
            <motion.div
              id="promotion-filters-content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-800">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="hidden h-4 w-4 shrink-0 text-gray-400 xl:block" aria-hidden="true" />
              <CustomDropdown
                value={lifecycleFilter}
                onChange={(value) => setLifecycleFilter(value as PromotionLifecycleFilter)}
                ariaLabel="Filter promotions by schedule"
                className="min-w-40"
                options={[
                  { value: "all", label: "All schedules" },
                  { value: "live", label: "Live now" },
                  { value: "scheduled", label: "Scheduled" },
                ]}
              />
            </div>

            <CustomDropdown
              value={productFilter}
              onChange={(value) => setProductFilter(value as PromotionProductFilter)}
              ariaLabel="Filter promotions by product dependency"
              className="min-w-40"
              options={[
                { value: "all", label: "All products" },
                { value: "linked", label: "Product linked" },
                { value: "general", label: "No product" },
              ]}
            />

            <CustomDropdown
              value={sortOrder}
              onChange={(value) => setSortOrder(value as PromotionSortOrder)}
              ariaLabel="Sort promotions"
              className="min-w-40"
              options={[
                { value: "newest", label: "Newest created" },
                { value: "oldest", label: "Oldest created" },
                { value: "endingSoon", label: "Ending soon" },
              ]}
            />

            <ViewModeButton value={viewMode} options={ownerPromotionViewOptions} onChange={setViewMode} ariaLabel="Change promotion view" />

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setLifecycleFilter("all");
                  setProductFilter("all");
                }}
                className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
                Clear
              </button>
            )}
          </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <p className="mt-3 text-xs font-medium text-gray-500 dark:text-gray-400">
          Showing {visibleActivePromotions.length} of {activePromotions.length} active {activePromotions.length === 1 ? "promotion" : "promotions"}. Newest promotions are prioritized by default.
        </p>
      </section>

      <ScrollableRegion label="Store promotions" className={`grid gap-4 pr-1 ${viewMode === "grid" ? "sm:grid-cols-2 lg:grid-cols-2" : "grid-cols-1"}`}>
        {visibleActivePromotions.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-gray-50 dark:bg-[#1b1b1b] rounded-3xl border border-dashed border-gray-200 dark:border-gray-800">
            <Gift className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-700 mb-3" />
            <p className="font-medium text-gray-900 dark:text-white">{hasActiveFilters ? "No matching active promotions" : "No active promotions"}</p>
            <p className="text-sm text-gray-500 mt-1">{hasActiveFilters ? "Try changing or clearing the search and filters." : "Add a promotion or reactivate one from the archive."}</p>
          </div>
        ) : (
          paginatedPromotions.map((promo) => (
            <div key={promo.id} className={`bg-white dark:bg-gray-900 border rounded-2xl overflow-hidden ${viewMode === "list" ? "sm:grid sm:grid-cols-[minmax(180px,260px)_minmax(0,1fr)]" : ""} ${(promo.active ?? true) ? "border-gray-300 dark:border-white/15 shadow-sm" : "border-gray-200 dark:border-gray-800 opacity-75"}`}>
              {promo.bannerImageUrl && (
                <img src={getDisplayImageUrl(promo.bannerImageUrl)} alt="" loading="lazy" decoding="async" className={viewMode === "list" ? "h-48 w-full object-cover sm:h-full sm:min-h-64" : "h-36 w-full object-cover"} />
              )}
              <div className={`p-6 ${viewMode === "list" && !promo.bannerImageUrl ? "sm:col-span-2" : ""}`}>
                <div className="flex justify-between items-start gap-4 mb-4">
                  <div className="flex gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${(promo.active ?? true) ? "bg-gray-100 dark:bg-white/15 text-[#1b1b1b] dark:text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-400"}`}>
                      <Gift className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-white">{promo.title}</h3>
                      {promo.publicId && <p className="font-mono text-[10px] font-semibold text-gray-400">{promo.publicId}</p>}
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
                  <button type="button" aria-label={`Edit ${promo.title}`} onClick={() => handleOpenModal(promo)} className="p-2 text-gray-500 hover:text-[#1b1b1b] hover:bg-gray-100 dark:hover:bg-white/10 dark:hover:text-white rounded-lg transition-colors">
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
      </ScrollableRegion>
      <Pagination
        page={currentPage}
        pageSize={PROMOTIONS_PER_PAGE}
        totalItems={visibleActivePromotions.length}
        itemLabel="active promotions"
        onPageChange={setCurrentPage}
      />

      {visibleArchivedPromotions.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <button
            type="button"
            aria-expanded={archiveOpen}
            aria-controls="promotion-archive"
            onClick={() => setArchiveOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/5"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <Archive className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Promotion Archive</h3>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  {visibleArchivedPromotions.length} inactive or expired {visibleArchivedPromotions.length === 1 ? "promotion" : "promotions"}
                </p>
              </div>
            </div>
            <ChevronDown className={`h-5 w-5 shrink-0 text-gray-500 transition-transform duration-300 ${archiveOpen ? "rotate-180" : ""}`} />
          </button>

          <AnimatePresence initial={false}>
            {archiveOpen && (
              <motion.div
                id="promotion-archive"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="grid gap-3 border-t border-gray-200 p-4 dark:border-gray-800 sm:grid-cols-2 xl:grid-cols-3">
                  {visibleArchivedPromotions.map(renderPromotionCard)}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      <AnimatePresence>
        {selectedArchivedPromotion && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSelectedArchivedPromotion(null);
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="archived-promotion-title"
              initial={{ y: 40, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 40, opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-4xl border border-gray-100 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900 sm:rounded-4xl"
            >
              <header className="relative shrink-0 border-b border-gray-100 bg-gray-50/80 px-6 py-5 pr-16 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/95">
                <span className="rounded-full bg-gray-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  {isPromotionExpired(selectedArchivedPromotion, promotionClock) ? "Expired" : "Inactive"}
                </span>
                <h2 id="archived-promotion-title" className="mt-2 text-xl font-bold text-gray-900 dark:text-white">{selectedArchivedPromotion.title}</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Archived promotion information</p>
                <button
                  type="button"
                  onClick={() => setSelectedArchivedPromotion(null)}
                  aria-label="Close archived promotion details"
                  className="absolute right-5 top-5 rounded-full border border-gray-200 bg-gray-100 p-2 text-gray-400 transition-colors hover:text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:hover:text-gray-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
                {selectedArchivedPromotion.bannerImageUrl && (
                  <div className="relative mb-5 h-44 overflow-hidden rounded-2xl bg-gray-200 dark:bg-gray-800">
                    <img src={getDisplayImageUrl(selectedArchivedPromotion.bannerImageUrl)} alt="" className="h-full w-full object-cover grayscale" />
                    <div className="absolute inset-0 bg-gray-900/20" />
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Description</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600 dark:text-gray-300">{selectedArchivedPromotion.description || "No description provided."}</p>
                </div>

                <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/70"><dt className="text-xs font-medium text-gray-500">Stamps required</dt><dd className="mt-1 font-semibold text-gray-900 dark:text-white">{selectedArchivedPromotion.requiredStamps}</dd></div>
                  <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/70"><dt className="text-xs font-medium text-gray-500">Redemptions</dt><dd className="mt-1 font-semibold text-gray-900 dark:text-white">{getRemainingPromotionClaimsLabel(selectedArchivedPromotion)}</dd></div>
                  <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/70"><dt className="text-xs font-medium text-gray-500">Starts</dt><dd className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{selectedArchivedPromotion.startDate ? formatPhilippineDateTime(selectedArchivedPromotion.startDate) : "Anytime"}</dd></div>
                  <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/70"><dt className="text-xs font-medium text-gray-500">Ends</dt><dd className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{selectedArchivedPromotion.endDate ? formatPhilippineDateTime(selectedArchivedPromotion.endDate) : "No expiry"}</dd></div>
                  {selectedArchivedPromotion.linkedProductName && <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/70"><dt className="text-xs font-medium text-gray-500">Linked product</dt><dd className="mt-1 font-semibold text-gray-900 dark:text-white">{selectedArchivedPromotion.linkedProductName}</dd></div>}
                  {selectedArchivedPromotion.geofenceEnabled && <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/70"><dt className="text-xs font-medium text-gray-500">Scanner geofence</dt><dd className="mt-1 font-semibold text-gray-900 dark:text-white">{selectedArchivedPromotion.geofenceRadiusMeters || DEFAULT_RADIUS_METERS}m radius</dd></div>}
                </dl>

                {selectedArchivedPromotion.redemptionInstructions && (
                  <div className="mt-5 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">Claim / redeem instructions</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600 dark:text-gray-300">{selectedArchivedPromotion.redemptionInstructions}</p>
                  </div>
                )}
              </div>

              <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-gray-200 bg-white/95 px-5 py-4 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/95 sm:flex-row sm:justify-end sm:px-6">
                <button type="button" onClick={() => setSelectedArchivedPromotion(null)} className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">Close</button>
                <button type="button" onClick={() => { const promotion = selectedArchivedPromotion; setSelectedArchivedPromotion(null); handleOpenModal(promotion); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100">
                  <Edit2 className="h-4 w-4" /> Edit promotion
                </button>
              </footer>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={Boolean(promotionToDelete)}
        title="Delete promotion?"
        description={`“${promotionToDelete?.title || "This promotion"}” will be permanently removed. Existing customer progress associated with it may no longer be available.`}
        confirmLabel="Delete"
        isLoading={isDeleting}
        onClose={() => setPromotionToDelete(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
