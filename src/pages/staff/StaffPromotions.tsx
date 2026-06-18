import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Gift, Calendar, Star, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function StaffPromotions({ store }: { store: any }) {
  const [promotions, setPromotions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!store?.id) return;
    async function fetchPromotions() {
      try {
        const q = query(collection(db, "promotions"), where("storeId", "==", store.id));
        const snap = await getDocs(q);
        const promos = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        // Filter out inactive if needed, but showing all might be good. Let's just show active promos or all here.
        setPromotions(promos.filter(p => p.active !== false));
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
            <div key={i} className="h-48 bg-gray-100 dark:bg-gray-800 rounded-3xl animate-pulse" />
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
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[2rem] p-6 text-left hover:border-orange-500 dark:hover:border-orange-500 hover:shadow-lg transition-all group relative overflow-hidden flex flex-col"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50 dark:bg-orange-900/10 rounded-bl-full -z-10 transition-transform group-hover:scale-110" />
              
              <div className="w-14 h-14 bg-orange-100 dark:bg-orange-900/30 rounded-2xl flex items-center justify-center mb-6">
                <Gift className="w-7 h-7 text-orange-600 dark:text-orange-400" />
              </div>

              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 line-clamp-1">{promo.title || "Untitled Promo"}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-6 flex-1">
                {promo.description || "No description provided."}
              </p>

              <div className="flex items-center gap-4 text-xs font-semibold text-gray-700 dark:text-gray-300 mb-6 bg-gray-50 dark:bg-gray-800 p-3 rounded-xl">
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 flex items-center gap-1"><Star className="w-3.5 h-3.5" /> Needed</span>
                  <span>{promo.requiredStamps || 0} Stamps</span>
                </div>
                <div className="w-px h-8 bg-gray-200 dark:bg-gray-700"></div>
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Ends</span>
                  <span>{promo.endDate ? new Date(promo.endDate).toLocaleDateString() : 'No expiry'}</span>
                </div>
              </div>

              <div className="flex items-center text-sm font-bold text-orange-600 dark:text-orange-400 mt-auto">
                Open Scanner <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
