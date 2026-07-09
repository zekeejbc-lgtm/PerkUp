import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { collection, query, getDocs } from "@/src/lib/dataCompat";
import { db, handleDataError, OperationType } from "../../lib/backend";
import { Gift, Calendar, Users, Search, Store, MapPin, LayoutGrid, Rows3, Table2, X, Tag, Shuffle } from "lucide-react";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { getDisplayImageUrl } from "../../lib/imageStorage";
import { getCompletedPromotionCount, getRemainingPromotionClaims } from "../../lib/promotionProgress";
import { Pagination } from "../../components/Pagination";
import { formatPhilippineDate, getPhilippineDateTimeMillis } from "../../lib/dateTime";

type PromotionViewMode = "card" | "page" | "table";

const PROMOTIONS_PER_PAGE_BY_VIEW: Record<PromotionViewMode, number> = {
  card: 8,
  page: 6,
  table: 10,
};

const viewOptions: Array<{ value: PromotionViewMode; label: string; icon: typeof LayoutGrid }> = [
  { value: "card", label: "Card", icon: LayoutGrid },
  { value: "page", label: "Page", icon: Rows3 },
  { value: "table", label: "Table", icon: Table2 },
];

const formatDate = (value?: string) => {
  return value ? formatPhilippineDate(value, "") : "";
};

const getRemainingClaims = (promo: any) => {
  const remaining = getRemainingPromotionClaims(promo);
  if (remaining === null) return "Unlimited";
  return `${remaining} left`;
};

const getPromotionAvailability = (promo: any) => {
  const now = Date.now();
  const storeStatus = String(promo.store?.status || "").toLowerCase();
  const startsAt = promo.startDate ? getPhilippineDateTimeMillis(promo.startDate) : Number.NaN;
  const endsAt = promo.endDate ? getPhilippineDateTimeMillis(promo.endDate) : Number.NaN;

  if (!promo.store) {
    return {
      active: false,
      label: "Store unavailable",
      detail: "This store has been removed or is no longer available.",
      className: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
    };
  }

  if (storeStatus && storeStatus !== "active") {
    return {
      active: false,
      label: storeStatus === "deleted" ? "Store deleted" : "Store inactive",
      detail: "This store is no longer accepting this promotion.",
      className: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
    };
  }

  if (promo.active === false) {
    return {
      active: false,
      label: "Ended by store",
      detail: "The store has ended this promotion.",
      className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
    };
  }

  if (Number.isFinite(startsAt) && startsAt > now) {
    return {
      active: false,
      label: "Upcoming",
      detail: `Starts ${formatDate(promo.startDate) || "soon"}.`,
      className: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200",
    };
  }

  if (Number.isFinite(endsAt) && endsAt <= now) {
    return {
      active: false,
      label: "Ended",
      detail: `This promotion ended ${formatDate(promo.endDate) || "recently"}.`,
      className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
    };
  }

  if (getRemainingPromotionClaims(promo) === 0) {
    return {
      active: false,
      label: "Fully claimed",
      detail: "All available claims for this promotion have been used.",
      className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
    };
  }

  return {
    active: true,
    label: "Active",
    detail: "",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
  };
};

const getPromotionDescription = (promo: any) =>
  promo.description || "Grab this offer while it lasts. Visit the store to redeem eligible rewards and perks.";

const PromotionStatus = ({ promo, compact = false }: { promo: any; compact?: boolean }) => {
  const availability = getPromotionAvailability(promo);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!compact && (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1b1b1b] dark:bg-white/10 dark:text-white">
          <Gift className="h-3 w-3" />
          Offer
        </span>
      )}
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${availability.className}`}>
        {availability.label}
      </span>
    </div>
  );
};

const StoreIdentity = ({ promo, compact = false, linkable = true }: { promo: any; compact?: boolean; linkable?: boolean }) => (
  <div className="flex min-w-0 items-center gap-2">
    <div className={`${compact ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl"} flex shrink-0 items-center justify-center overflow-hidden border border-gray-100 bg-white dark:border-white/10 dark:bg-gray-900`}>
      {promo.store?.logoUrl ? (
        <img src={getDisplayImageUrl(promo.store.logoUrl)} alt={`${promo.store.name} logo`} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <Store className="h-4 w-4 text-gray-400" />
      )}
    </div>
    <div className="min-w-0">
      {promo.store && linkable ? (
        <Link
          to={`/store/${promo.store.id}`}
          onClick={(event) => event.stopPropagation()}
          className="block truncate text-xs font-bold text-gray-900 hover:underline dark:text-white"
        >
          {promo.store.name}
        </Link>
      ) : promo.store ? (
        <p className="truncate text-xs font-bold text-gray-900 dark:text-white">{promo.store.name}</p>
      ) : (
        <p className="truncate text-xs font-bold text-gray-900 dark:text-white">Affiliated store</p>
      )}
      <p className="truncate text-[11px] font-medium text-gray-500 dark:text-gray-400">{promo.store?.category || "Partner store"}</p>
    </div>
  </div>
);

export default function CustomerPromotions() {
  const [promotions, setPromotions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<PromotionViewMode>("card");
  const [selectedPromotion, setSelectedPromotion] = useState<any | null>(null);

  useEffect(() => {
    async function fetchPromotions() {
      try {
        const [promotionsSnapshot, storesSnapshot, cardsSnapshot] = await Promise.all([
          getDocs(query(collection(db, "promotions"))),
          getDocs(query(collection(db, "stores"))),
          getDocs(query(collection(db, "cards"))),
        ]);
        const storesById = storesSnapshot.docs.reduce<Record<string, any>>((result, storeDoc) => {
          const store = storeDoc.data();
          result[storeDoc.id] = {
            id: storeDoc.id,
            ...store,
            name: store.name || store.storeName || "Affiliated store",
            category: store.category || "Partner store",
            address: store.address || store.location || "",
            contact: store.contact || store.phone || "",
            logoUrl: store.logoUrl || store.imageUrl || "",
          };
          return result;
        }, {});

        const cardsByStoreId = cardsSnapshot.docs.reduce<Record<string, any[]>>((result, cardDoc) => {
          const card = { id: cardDoc.id, ...cardDoc.data() };
          const storeId = String((card as any).storeId || "");
          if (!storeId) return result;
          result[storeId] = [...(result[storeId] || []), card];
          return result;
        }, {});

        const fetchedPromotions = promotionsSnapshot.docs.map(doc => {
          const promo = { id: doc.id, ...doc.data() };
          const storeId = String((promo as any).storeId || "");
          return {
            ...promo,
            store: storesById[storeId] || null,
            claimedCount: getCompletedPromotionCount(cardsByStoreId[storeId] || [], promo),
          };
        });
        setPromotions(fetchedPromotions.sort((first: any, second: any) => {
          const firstAvailability = getPromotionAvailability(first);
          const secondAvailability = getPromotionAvailability(second);
          if (firstAvailability.active !== secondAvailability.active) return firstAvailability.active ? -1 : 1;
          return String(first.title || "").localeCompare(String(second.title || ""));
        }));
      } catch (error) {
        if ((error as any).code !== "permission-denied") {
          handleDataError(error, OperationType.GET, "promotions");
        }
      } finally {
        setLoading(false);
      }
    }
    fetchPromotions();
  }, []);

  const filteredPromotions = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return promotions;

    return promotions.filter((promo) => {
      const store = promo.store || {};
      return [
        promo.title,
        promo.description,
        promo.linkedProductName,
        getPromotionAvailability(promo).label,
        store.name,
        store.category,
        store.address,
        store.contact,
      ].some((value) => String(value || "").toLowerCase().includes(term));
    });
  }, [promotions, searchQuery]);

  const pageSize = PROMOTIONS_PER_PAGE_BY_VIEW[viewMode];
  const totalPages = Math.max(1, Math.ceil(filteredPromotions.length / pageSize));
  const paginatedPromotions = filteredPromotions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const activeViewOption = viewOptions.find((option) => option.value === viewMode) || viewOptions[0];

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, viewMode]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (!selectedPromotion) return undefined;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedPromotion(null);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedPromotion]);

  const openPromotion = (promo: any) => setSelectedPromotion(promo);
  const cycleViewMode = () => {
    const currentIndex = viewOptions.findIndex((option) => option.value === viewMode);
    const nextOption = viewOptions[(currentIndex + 1) % viewOptions.length];
    setViewMode(nextOption.value);
  };

  const renderCardView = () => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {paginatedPromotions.map((promo) => {
        const availability = getPromotionAvailability(promo);
        return (
          <button
            key={promo.id}
            type="button"
            onClick={() => openPromotion(promo)}
            className={`group flex min-h-full flex-col overflow-hidden rounded-xl border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:bg-gray-900 dark:focus:ring-white ${availability.active ? "border-gray-100 dark:border-gray-800" : "border-gray-200 dark:border-gray-700"}`}
          >
            {promo.bannerImageUrl ? (
              <img src={getDisplayImageUrl(promo.bannerImageUrl)} alt="" loading="lazy" className={`h-28 w-full object-cover ${availability.active ? "" : "grayscale"}`} />
            ) : (
              <div className="h-24 bg-gray-100 dark:bg-white/10" />
            )}
            <div className="flex flex-1 flex-col gap-3 p-4">
              <StoreIdentity promo={promo} linkable={false} />
              <div className="min-w-0 flex-1">
                <PromotionStatus promo={promo} />
                <h3 className="mt-2 line-clamp-2 text-base font-bold leading-snug text-gray-900 dark:text-white">{promo.title || "Special Promotion"}</h3>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{getPromotionDescription(promo)}</p>
              </div>
              <div className="grid gap-1 border-t border-gray-100 pt-3 text-[11px] text-gray-400 dark:border-gray-800 dark:text-gray-500">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Valid until {formatDate(promo.endDate) || "further notice"}
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  {getRemainingClaims(promo)}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );

  const renderPageView = () => (
    <div className="space-y-3">
      {paginatedPromotions.map((promo) => (
        <button
          key={promo.id}
          type="button"
          onClick={() => openPromotion(promo)}
          className="grid w-full gap-4 rounded-xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 dark:focus:ring-white md:grid-cols-[180px_1fr_auto]"
        >
          <div className="h-28 overflow-hidden rounded-lg bg-gray-100 dark:bg-white/10 md:h-full">
            {promo.bannerImageUrl ? (
              <img src={getDisplayImageUrl(promo.bannerImageUrl)} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Gift className="h-6 w-6 text-gray-300 dark:text-gray-600" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <PromotionStatus promo={promo} />
              {promo.linkedProductName && <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{promo.linkedProductName}</span>}
            </div>
            <h3 className="mt-2 text-lg font-bold leading-snug text-gray-900 dark:text-white">{promo.title || "Special Promotion"}</h3>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{getPromotionDescription(promo)}</p>
            <div className="mt-3">
              <StoreIdentity promo={promo} compact linkable={false} />
            </div>
          </div>
          <div className="grid content-start gap-2 text-xs text-gray-500 dark:text-gray-400 md:w-36">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {formatDate(promo.endDate) || "No end date"}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              {getRemainingClaims(promo)}
            </span>
          </div>
        </button>
      ))}
    </div>
  );

  const renderTableView = () => (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
          <thead className="bg-gray-50 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:bg-white/5 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3">Promotion</th>
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Ends</th>
              <th className="px-4 py-3">Claims</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {paginatedPromotions.map((promo) => (
              <tr
                key={promo.id}
                tabIndex={0}
                onClick={() => openPromotion(promo)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") openPromotion(promo);
                }}
                className="cursor-pointer transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#1b1b1b] dark:hover:bg-white/5 dark:focus:ring-white"
              >
                <td className="px-4 py-3">
                  <div className="flex min-w-64 items-center gap-3">
                    <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-white/10">
                      {promo.bannerImageUrl ? (
                        <img src={getDisplayImageUrl(promo.bannerImageUrl)} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{promo.title || "Special Promotion"}</p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">{promo.linkedProductName || getPromotionDescription(promo)}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StoreIdentity promo={promo} compact linkable={false} />
                </td>
                <td className="px-4 py-3">
                  <PromotionStatus promo={promo} compact />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{formatDate(promo.endDate) || "No end date"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300">{getRemainingClaims(promo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderPromotions = () => {
    if (viewMode === "page") return renderPageView();
    if (viewMode === "table") return renderTableView();
    return renderCardView();
  };

  if (loading) return <PageSkeleton variant="promotions" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Promotions & Campaigns</h2>
          <p className="mt-1 text-gray-500 dark:text-gray-400">Special offers from affiliated stores.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row xl:w-auto">
          <div className="relative w-full shrink-0 sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search promotions or stores..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="block w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-gray-900 transition-colors placeholder:text-gray-400 focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:focus:ring-white sm:text-sm"
            />
          </div>
          <button
            type="button"
            onClick={cycleViewMode}
            title="Change promotion view"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/10 dark:focus:ring-white"
          >
            <Shuffle className="h-4 w-4" />
            <span>{activeViewOption.label}</span>
          </button>
        </div>
      </div>

      {promotions.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800">
            <Gift className="h-8 w-8 text-gray-300 dark:text-gray-600" />
          </div>
          <p className="mb-1 font-medium text-gray-500 dark:text-gray-400">No active promotions</p>
          <p className="max-w-sm text-sm text-gray-400 dark:text-gray-500">Check back later for special offers and campaigns from our partners.</p>
        </div>
      ) : filteredPromotions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-900">
          <p className="font-medium text-gray-500 dark:text-gray-400">No promotions match your search.</p>
          <button type="button" onClick={() => setSearchQuery("")} className="mt-3 text-sm font-semibold text-[#1b1b1b] hover:underline dark:text-white">
            Clear search
          </button>
        </div>
      ) : (
        renderPromotions()
      )}

      <Pagination
        page={currentPage}
        pageSize={pageSize}
        totalItems={filteredPromotions.length}
        itemLabel="promotions"
        onPageChange={setCurrentPage}
      />

      {selectedPromotion && (
        <PromotionDetailsModal promo={selectedPromotion} onClose={() => setSelectedPromotion(null)} />
      )}
    </div>
  );
}

function PromotionDetailsModal({ promo, onClose }: { promo: any; onClose: () => void }) {
  const availability = getPromotionAvailability(promo);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/60 px-3 py-4 backdrop-blur-sm sm:items-center sm:justify-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="promotion-details-title"
        className="max-h-[92vh] w-full overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-900 sm:max-w-2xl"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">Promotion details</p>
            <h2 id="promotion-details-title" className="truncate text-lg font-bold text-gray-900 dark:text-white">
              {promo.title || "Special Promotion"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close promotion details"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-73px)] overflow-y-auto">
          {promo.bannerImageUrl && (
            <img src={getDisplayImageUrl(promo.bannerImageUrl)} alt={`${promo.title || "Promotion"} banner`} className="h-48 w-full object-cover sm:h-56" />
          )}

          <div className="space-y-5 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <StoreIdentity promo={promo} />
              <PromotionStatus promo={promo} />
            </div>

            <div>
              <h3 className="text-xl font-bold leading-tight text-gray-900 dark:text-white">{promo.title || "Special Promotion"}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{getPromotionDescription(promo)}</p>
            </div>

            {availability.detail && (
              <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm font-medium text-gray-600 dark:bg-white/5 dark:text-gray-300">
                {availability.detail}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-gray-100 p-4 dark:border-gray-800">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  <Calendar className="h-4 w-4" />
                  Validity
                </p>
                <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                  {formatDate(promo.startDate) || "Available now"} - {formatDate(promo.endDate) || "No end date"}
                </p>
              </div>
              <div className="rounded-xl border border-gray-100 p-4 dark:border-gray-800">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  <Users className="h-4 w-4" />
                  Claims
                </p>
                <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{getRemainingClaims(promo)}</p>
              </div>
              <div className="rounded-xl border border-gray-100 p-4 dark:border-gray-800">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  <Gift className="h-4 w-4" />
                  Required stamps
                </p>
                <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{Math.max(Number(promo.requiredStamps || 10), 1)}</p>
              </div>
              <div className="rounded-xl border border-gray-100 p-4 dark:border-gray-800">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  <Tag className="h-4 w-4" />
                  Product
                </p>
                <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{promo.linkedProductName || "Store-wide offer"}</p>
              </div>
            </div>

            {promo.store?.address && (
              <div className="rounded-xl border border-gray-100 p-4 dark:border-gray-800">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  <MapPin className="h-4 w-4" />
                  Store location
                </p>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{promo.store.address}</p>
                {promo.store.contact && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{promo.store.contact}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
