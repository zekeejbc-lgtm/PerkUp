import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { Gift, Calendar, Star, ChevronRight, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { SkeletonBlock } from "../../components/LoadingSkeleton";
import { getDisplayImageUrl } from "../../lib/imageStorage";

const getRemainingClaims = (promo: any) => {
  const maxRedemptions = Number(promo.maxRedemptions || 0);
  if (!maxRedemptions) return "Unlimited";
  return `${Math.max(maxRedemptions - Number(promo.claimedCount || 0), 0)} left`;
};

export default function StaffPromotions({ store }: { store: any }) {
  const [promotions, setPromotions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!store?.id) return;
    async function fetchPromotions() {
      try {
        const q = query(collection(db, "promotions"), where("storeId", "==", store.id));
        const snap = await getDocs(q);
        const promos = await Promise.all(
          snap.docs.map(async d => {
            const promo = { id: d.id, ...(d.data() as any) };
            const claimsQuery = query(collection(db, "promotions_scanned"), where("promotionId", "==", d.id));
            const claimsSnap = await getDocs(claimsQuery);
            return { ...promo, claimedCount: claimsSnap.size };
          }),
        );
        const now = Date.now();
        setPromotions(promos.filter(p => {
          if (p.active === false) return false;
          if (p.startDate && new Date(p.startDate).getTime() > now) return false;
          if (p.endDate && new Date(p.endDate).getTime() <= now) return false;
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

      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map(i => (
            <SkeletonBlock key={i} className="h-[420px] rounded-[2rem]" />
          ))}
        </div>
      ) : promotions.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 p-12 rounded-[2rem] border border-dashed border-gray-300 dark:border-gray-700 text-center flex flex-col items-center">
          <Gift className="w-16 h-16 text-gray-400 mb-6" />
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Active Promotions</h3>
          <p className="text-gray-500 max-w-sm mb-8">This store currently doesn't have any active promotions for customers.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {promotions.map((promo) => (
            <Link
              key={promo.id}
              to={`/staff/promotions/${promo.id}`}
              className="group relative flex min-h-[430px] flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-400 hover:shadow-xl dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-600"
            >
              {promo.bannerImageUrl ? (
                <img src={getDisplayImageUrl(promo.bannerImageUrl)} alt="" className="aspect-[16/7] w-full object-cover" />
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
                    <span className="truncate">{promo.endDate ? new Date(promo.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "None"}</span>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1 px-2">
                    <span className="flex items-center gap-1 text-gray-500"><Users className="h-3.5 w-3.5" /> Left</span>
                    <span className="truncate">{getRemainingClaims(promo)}</span>
                  </div>
                </div>

                <div className="flex items-center text-sm font-bold text-[#1b1b1b] dark:text-white mt-auto">
                  Open Scanner <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
