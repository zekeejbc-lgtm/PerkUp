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
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <SkeletonBlock key={i} className="h-48 rounded-3xl" />
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
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[2rem] text-left hover:border-orange-500 dark:hover:border-orange-500 hover:shadow-lg transition-all group relative overflow-hidden flex flex-col"
            >
              {promo.bannerImageUrl ? (
                <img src={getDisplayImageUrl(promo.bannerImageUrl)} alt="" className="h-32 w-full object-cover" />
              ) : (
                <div className="h-24 bg-orange-50 dark:bg-orange-900/10" />
              )}

              <div className="p-6 flex flex-col flex-1">
                <div className="w-14 h-14 bg-orange-100 dark:bg-orange-900/30 rounded-2xl flex items-center justify-center mb-6 -mt-12 border-4 border-white dark:border-gray-900">
                  <Gift className="w-7 h-7 text-orange-600 dark:text-orange-400" />
                </div>

                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 line-clamp-1">{promo.title || "Untitled Promo"}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-6 flex-1">
                  {promo.description || "No description provided."}
                </p>

                <div className="grid grid-cols-3 gap-3 text-xs font-semibold text-gray-700 dark:text-gray-300 mb-6 bg-gray-50 dark:bg-gray-800 p-3 rounded-xl">
                  <div className="flex flex-col gap-1">
                    <span className="text-gray-500 flex items-center gap-1"><Star className="w-3.5 h-3.5" /> Needed</span>
                    <span>{promo.requiredStamps || 0}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-gray-500 flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Ends</span>
                    <span>{promo.endDate ? new Date(promo.endDate).toLocaleDateString() : 'None'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-gray-500 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Left</span>
                    <span>{getRemainingClaims(promo)}</span>
                  </div>
                </div>

                <div className="flex items-center text-sm font-bold text-orange-600 dark:text-orange-400 mt-auto">
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
