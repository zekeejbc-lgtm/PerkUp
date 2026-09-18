import { useState, useEffect, useMemo } from "react";
import { collection, query, where, getDocs } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { Gift, Calendar, Star, ChevronRight, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { SkeletonBlock } from "../../components/LoadingSkeleton";
import { getDisplayImageUrl } from "../../lib/imageStorage";
import { getCompletedPromotionCount, getRemainingPromotionClaimsLabel } from "../../lib/promotionProgress";
import { Pagination } from "../../components/Pagination";
import { ScrollableRegion } from "../../components/ScrollableRegion";
import { formatPhilippineDate, getPhilippineDateTimeMillis } from "../../lib/dateTime";
import { CategorySearchInput } from "../../components/CategorySearchInput";

const PROMOTIONS_PER_PAGE = 6;

export default function StaffPromotions({ store }: { store: any }) {
  const [promotions, setPromotions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const filteredPromotions = useMemo(() => {
    const terms = searchQuery.toLocaleLowerCase().split(",").map((term) => term.trim()).filter(Boolean);
    if (!terms.length) return promotions;
    const now = Date.now();
    const soonThreshold = now + 7 * 24 * 60 * 60 * 1000;
    return promotions.filter((promotion) => {
      const endTime = promotion.endDate ? getPhilippineDateTimeMillis(promotion.endDate) : Number.NaN;
      const hasExpiry = Number.isFinite(endTime);
      const expiringSoon = hasExpiry && endTime > now && endTime <= soonThreshold;
      const hasClaimLimit = Number(promotion.maxRedemptions || 0) > 0;
      const hasLinkedProduct = Boolean(promotion.linkedProductId || promotion.linkedProductName);
      const searchable = [
        promotion.title,
        promotion.description,
        promotion.redemptionInstructions,
        promotion.linkedProductName,
        `${promotion.requiredStamps || 0} stamps`,
        promotion.endDate ? formatPhilippineDate(promotion.endDate) : "no expiry",
        getRemainingPromotionClaimsLabel(promotion),
      ].join(" ").toLocaleLowerCase();
      return terms.every((term) => {
        if (term === "expiring soon") return expiringSoon;
        if (term === "no expiry") return !hasExpiry;
        if (term === "limited claims") return hasClaimLimit;
        if (term === "unlimited claims") return !hasClaimLimit;
        if (term === "linked product") return hasLinkedProduct;
        if (term === "general reward") return !hasLinkedProduct;
        return searchable.includes(term);
      });
    });
  }, [promotions, searchQuery]);
  const totalPages = Math.max(1, Math.ceil(filteredPromotions.length / PROMOTIONS_PER_PAGE));
  const paginatedPromotions = filteredPromotions.slice(
    (currentPage - 1) * PROMOTIONS_PER_PAGE,
    currentPage * PROMOTIONS_PER_PAGE,
  );

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (!store?.id) return;
    async function fetchPromotions() {
      try {
        const [promotionsSnap, cardsSnap] = await Promise.all([
          getDocs(query(collection(db, "promotions"), where("storeId", "==", store.id))),
          getDocs(query(collection(db, "cards"), where("storeId", "==", store.id))),
        ]);
        const cards = cardsSnap.docs.map((cardDoc) => ({ id: cardDoc.id, ...cardDoc.data() }));
        const promos = promotionsSnap.docs.map((d) => {
          const promo = { id: d.id, ...(d.data() as any) };
          return { ...promo, claimedCount: getCompletedPromotionCount(cards, promo) };
        });
        const now = Date.now();
        setPromotions(promos.filter(p => {
          if (p.active === false) return false;
          if (p.startDate && getPhilippineDateTimeMillis(p.startDate) > now) return false;
          if (p.endDate && getPhilippineDateTimeMillis(p.endDate) <= now) return false;
          if (p.maxRedemptions && Number(p.claimedCount || 0) >= Number(p.maxRedemptions)) return false;
          return true;
        }));
      } catch (err) {
        console.error("Failed to load promotions", err);
      } finally {
        setLoading(false);
      }
    }
    fetchPromotions();
  }, [store]);

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Active Promotions</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">Select a promotion to scan customer QR codes and manage rewards.</p>
      </div>

      <CategorySearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        categories={["Expiring Soon", "No Expiry", "Limited Claims", "Unlimited Claims", "Linked Product", "General Reward"]}
        placeholder="Search promotions or filter by expiry, claims..."
        ariaLabel="Search and filter active promotions"
        suggestionLabel="promotion filter"
        collapsibleFilters
        resultsId="staff-active-promotions-results"
        className="w-full rounded-2xl border border-gray-200 bg-white py-3.5 pl-12 pr-12 text-sm text-gray-900 shadow-sm outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-gray-500"
      />

      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map(i => (
            <SkeletonBlock key={i} className="h-[420px] rounded-[2rem]" />
          ))}
        </div>
      ) : filteredPromotions.length === 0 ? (
        <div id="staff-active-promotions-results" className="scroll-mt-6 bg-white dark:bg-gray-900 p-12 rounded-[2rem] border border-dashed border-gray-300 dark:border-gray-700 text-center flex flex-col items-center">
          <Gift className="w-16 h-16 text-gray-400 mb-6" />
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{promotions.length ? "No promotions match your filters" : "No Active Promotions"}</h3>
          <p className="text-gray-500 max-w-sm mb-8">{promotions.length ? "Try another search or clear the current filters." : "This store currently doesn't have any active promotions for customers."}</p>
        </div>
      ) : (
        <ScrollableRegion label="Active promotions" id="staff-active-promotions-results" className="scroll-mt-6 grid gap-6 pr-1 sm:grid-cols-2 lg:grid-cols-3">
          {paginatedPromotions.map((promo) => (
            <Link
              key={promo.id}
              to={`/staff/promotions/${promo.id}`}
              className="group relative flex min-h-[430px] flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-400 hover:shadow-xl dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-600"
            >
              {promo.bannerImageUrl ? (
                <img src={getDisplayImageUrl(promo.bannerImageUrl)} alt="" loading="lazy" decoding="async" className="aspect-[16/7] w-full object-cover" />
              ) : (
                <div className="aspect-[16/7] w-full bg-gray-100 dark:bg-white/5" />
              )}

              <div className="flex flex-1 flex-col p-6 pt-0">
                <div className="-mt-7 mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border-4 border-white bg-gray-100 shadow-sm dark:border-gray-900 dark:bg-gray-800">
                  <Gift className="h-6 w-6 text-[#1b1b1b] dark:text-white" />
                </div>

                <h3 className="mb-2 line-clamp-2 text-lg font-bold leading-snug text-gray-900 dark:text-white">{promo.title || "Untitled Promo"}</h3>
                <p className="mb-6 line-clamp-2 min-h-10 text-sm text-gray-500 dark:text-gray-400">
                  {promo.description || "No description provided."}
                </p>

                <div className="mb-6 mt-auto grid grid-cols-3 divide-x divide-gray-200 rounded-2xl bg-gray-50 px-2 py-3 text-xs font-semibold text-gray-700 dark:divide-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  <div className="flex min-w-0 flex-col gap-1 px-2">
                    <span className="flex items-center gap-1 text-gray-500"><Star className="h-3.5 w-3.5" /> Needed</span>
                    <span className="truncate">{promo.requiredStamps || 0}</span>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1 px-2">
                    <span className="flex items-center gap-1 text-gray-500"><Calendar className="h-3.5 w-3.5" /> Ends</span>
                    <span className="truncate">{promo.endDate ? formatPhilippineDate(promo.endDate) : "None"}</span>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1 px-2">
                    <span className="flex items-center gap-1 text-gray-500"><Users className="h-3.5 w-3.5" /> Left</span>
                    <span className="truncate">{getRemainingPromotionClaimsLabel(promo)}</span>
                  </div>
                </div>

                <div className="flex items-center text-sm font-bold text-[#1b1b1b] dark:text-white mt-auto">
                  Open Scanner <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>
          ))}
        </ScrollableRegion>
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
