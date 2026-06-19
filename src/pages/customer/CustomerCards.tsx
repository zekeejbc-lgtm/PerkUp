import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { collection, query, where, getDocs } from "@/src/lib/dataCompat";
import { db, handleDataError, OperationType } from "../../lib/backend";
import { Star, Coffee } from "lucide-react";
import { Link } from "react-router-dom";
import { PageSkeleton } from "../../components/LoadingSkeleton";

export default function CustomerCards() {
  const { user } = useAuth();
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCards() {
      if (!user) return;
      try {
        // Query active cards for this customer
        const q = query(collection(db, "cards"), where("customerId", "==", user.id));
        const querySnapshot = await getDocs(q);
        const fetchedCards = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setCards(fetchedCards);
      } catch (error) {
        handleDataError(error, OperationType.GET, "cards");
      } finally {
        setLoading(false);
      }
    }
    fetchCards();
  }, [user]);

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Active Reward Cards</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Your progress at participating stores.</p>
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl border border-dashed border-gray-300 dark:border-gray-700 text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
            <Coffee className="w-8 h-8 text-gray-300 dark:text-gray-600" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">No active cards found</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm mb-6">You haven't collected any stars yet. Visit an affiliated store and present your Identity QR to start earning!</p>
          <Link to="/customer/stores" className="text-orange-600 dark:text-orange-400 font-medium hover:underline">
            Find stores near you
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Example card UI, needs actual fields to match DB */}
            {cards.map(card => (
              <div key={card.id} className="bg-white dark:bg-gray-900 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 transition-colors">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{card.storeName || "Store Name"}</span>
                  <span className="text-xs font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 px-2 py-1 rounded-md">
                    {card.stars || 0}/10
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap mb-2">
                  {[...Array(card.stars || 0)].map((_, i) => (
                    <div key={i} className="w-8 h-8 bg-orange-100 dark:bg-orange-900/40 rounded-full flex items-center justify-center">
                      <Star className="w-4 h-4 text-orange-600 dark:text-orange-400 fill-orange-600 dark:fill-orange-400" />
                    </div>
                  ))}
                  {[...Array(Math.max(0, 10 - (card.stars || 0)))].map((_, i) => (
                    <div key={`empty-${i}`} className="w-8 h-8 bg-gray-50 dark:bg-gray-800 rounded-full border border-gray-100 dark:border-gray-700"></div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
