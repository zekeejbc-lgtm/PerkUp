import { useState, useEffect } from "react";
import { collection, query, getDocs } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import { Gift, Calendar } from "lucide-react";

export default function CustomerPromotions() {
  const [promotions, setPromotions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPromotions() {
      // Assuming stores have a subcollection 'promotions' or there is a global 'promotions' collection.
      // For now, let's fetch from a global 'promotions' collection.
      try {
        const q = query(collection(db, "promotions"));
        const querySnapshot = await getDocs(q);
        const fetchedPromotions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPromotions(fetchedPromotions);
      } catch (error) {
        // Suppress expected errors if permission denied.
        if ((error as any).code !== "permission-denied") {
            handleFirestoreError(error, OperationType.GET, "promotions");
        }
      } finally {
        setLoading(false);
      }
    }
    fetchPromotions();
  }, []);

  if (loading) return <div className="animate-pulse text-gray-500 dark:text-gray-400">Loading promotions...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Promotions & Campaigns</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Special offers from affiliated stores.</p>
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {promotions.map(promo => (
              <div key={promo.id} className="bg-white dark:bg-gray-900 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 transition-colors flex flex-col relative overflow-hidden group">
                <div className="absolute top-0 right-0 -mt-10 -mr-10 w-32 h-32 bg-orange-100 dark:bg-orange-900/20 xl:group-hover:bg-orange-200 dark:xl:group-hover:bg-orange-900/30 rounded-full transition-colors mix-blend-multiply dark:mix-blend-lighten blur-2xl z-0"></div>
                <div className="relative z-10 flex-1">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 text-xs font-semibold tracking-wide uppercase mb-4">
                        <Gift className="w-3 h-3" />
                        Offer
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{promo.title || "Special Promotion"}</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 line-clamp-3">
                        {promo.description || "Grab this amazing offer while it lasts! Visit our store to redeem your reward points for special discounts."}
                    </p>
                </div>
                <div className="relative z-10 pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                        <Calendar className="w-4 h-4" />
                        <span>Valid until {promo.endDate ? new Date(promo.endDate).toLocaleDateString() : "further notice"}</span>
                    </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
