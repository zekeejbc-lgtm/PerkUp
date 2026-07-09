import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { collection, query, getDocs } from "@/src/lib/dataCompat";
import { db, handleDataError, OperationType } from "../../lib/backend";
import { Gift, Calendar, Users, Search, Store, MapPin } from "lucide-react";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { getDisplayImageUrl } from "../../lib/imageStorage";
import { getCompletedPromotionCount, getRemainingPromotionClaims } from "../../lib/promotionProgress";
import { Pagination } from "../../components/Pagination";

const PROMOTIONS_PER_PAGE = 6;

const formatDate = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
};

const getRemainingClaims = (promo: any) => {
  const remaining = getRemainingPromotionClaims(promo);
  if (remaining === null) return "Unlimited";
  return `${remaining} left`;
};

const getPromotionAvailability = (promo: any) => {
  const now = Date.now();
  const storeStatus = String(promo.store?.status || "").toLowerCase();
  const startsAt = promo.startDate ? new Date(promo.startDate).getTime() : Number.NaN;
  const endsAt = promo.endDate ? new Date(promo.endDate).getTime() : Number.NaN;

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

export default function CustomerPromotions() {
  const [promotions, setPromotions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

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
        // Suppress expected errors if permission denied.
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
  const totalPages = Math.max(1, Math.ceil(filteredPromotions.length / PROMOTIONS_PER_PAGE));
  const paginatedPromotions = filteredPromotions.slice(
    (currentPage - 1) * PROMOTIONS_PER_PAGE,
    currentPage * PROMOTIONS_PER_PAGE,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  if (loading) return <PageSkeleton variant="promotions" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Promotions & Campaigns</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Special offers from affiliated stores.</p>
        </div>
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
      </div>

      {promotions.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl border border-dashed border-gray-300 dark:border-gray-700 text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
            <Gift className="w-8 h-8 text-gray-300 dark:text-gray-600" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">No active promotions</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm">Check back later for special offers and campaigns from our partners.</p>
        </div>
      ) : filteredPromotions.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl border border-dashed border-gray-300 dark:border-gray-700 text-center">
          <p className="text-gray-500 dark:text-gray-400 font-medium">No promotions match your search.</p>
          <button type="button" onClick={() => setSearchQuery("")} className="mt-3 text-sm font-semibold text-[#1b1b1b] hover:underline dark:text-white">
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {paginatedPromotions.map(promo => {
              const availability = getPromotionAvailability(promo);
              return (
              <div key={promo.id} className={`bg-white dark:bg-gray-900 rounded-3xl shadow-sm border transition-colors flex flex-col relative overflow-hidden group ${availability.active ? "border-gray-100 dark:border-gray-800" : "border-gray-200 dark:border-gray-700"}`}>
                {promo.bannerImageUrl ? (
                  <img src={getDisplayImageUrl(promo.bannerImageUrl)} alt="" loading="lazy" className={`h-44 w-full object-cover ${availability.active ? "" : "grayscale"}`} />
                ) : (
                  <div className="h-28 bg-gray-100 dark:bg-white/10" />
                )}
                <div className="p-6 flex flex-col flex-1">
                  <div className="mb-5 flex items-start gap-3 rounded-2xl bg-gray-50 p-3 dark:bg-white/5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-100 bg-white dark:border-white/10 dark:bg-gray-900">
                      {promo.store?.logoUrl ? (
                        <img src={getDisplayImageUrl(promo.store.logoUrl)} alt={`${promo.store.name} logo`} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <Store className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      {promo.store ? (
                        <Link to={`/store/${promo.store.id}`} className="block truncate text-sm font-bold text-gray-900 hover:underline dark:text-white">
                          {promo.store.name}
                        </Link>
                      ) : (
                        <p className="truncate text-sm font-bold text-gray-900 dark:text-white">Affiliated store</p>
                      )}
                      <p className="mt-0.5 truncate text-xs font-medium text-gray-500 dark:text-gray-400">{promo.store?.category || "Partner store"}</p>
                      {promo.store?.address && (
                        <p className="mt-1 flex items-start gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span className="line-clamp-2">{promo.store.address}</span>
                        </p>
                      )}
                      {promo.store?.contact && (
                        <p className="mt-1 truncate text-xs text-gray-400 dark:text-gray-500">{promo.store.contact}</p>
                      )}
                    </div>
                  </div>
                  <div className="relative z-10 flex-1">
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-white/10 text-[#1b1b1b] dark:text-white text-xs font-semibold tracking-wide uppercase">
                        <Gift className="w-3 h-3" />
                        Offer
                      </div>
                      <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide uppercase ${availability.className}`}>
                        {availability.label}
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{promo.title || "Special Promotion"}</h3>
                    {promo.linkedProductName && (
                      <p className="mb-3 text-xs font-semibold text-gray-500 dark:text-gray-400">
                        Product: {promo.linkedProductName}
                      </p>
                    )}
                    <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 line-clamp-3">
                        {promo.description || "Grab this amazing offer while it lasts! Visit our store to redeem your reward points for special discounts."}
                    </p>
                    {availability.detail && (
                      <p className="mb-6 rounded-2xl bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 dark:bg-white/5 dark:text-gray-400">
                        {availability.detail}
                      </p>
                    )}
                  </div>
                  <div className="relative z-10 pt-4 border-t border-gray-100 dark:border-gray-800 grid gap-2">
                    <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                        <Calendar className="w-4 h-4" />
                        <span>Valid until {formatDate(promo.endDate) || "further notice"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                        <Users className="w-4 h-4" />
                        <span>{getRemainingClaims(promo)}</span>
                    </div>
                  </div>
                </div>
              </div>
              );
            })}
        </div>
      )}
      <Pagination
        page={currentPage}
        pageSize={PROMOTIONS_PER_PAGE}
        totalItems={filteredPromotions.length}
        itemLabel="promotions"
        onPageChange={setCurrentPage}
      />
    </div>
  );
}
