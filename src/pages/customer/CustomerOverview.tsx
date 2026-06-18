import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "../../contexts/AuthContext";
import { doc, getDoc, collection, query, where, getCountFromServer } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import { Star, ShieldCheck, CreditCard, Gift, TrendingUp, Info } from "lucide-react";
import { Link } from "react-router-dom";

export default function CustomerOverview() {
  const { user } = useAuth();
  const [lifetimeStars, setLifetimeStars] = useState<number>(0);
  const [activeCards, setActiveCards] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCustomerData() {
      if (!user) return;
      try {
        const custRef = doc(db, "customers", user.id);
        const custSnap = await getDoc(custRef);
        if (custSnap.exists()) {
          setLifetimeStars(custSnap.data().lifetimeStars || 0);
        }

        const cardsQuery = query(collection(db, "cards"), where("customerId", "==", user.id));
        const cardsSnapshot = await getCountFromServer(cardsQuery);
        setActiveCards(cardsSnapshot.data().count);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, "overview");
      } finally {
        setLoading(false);
      }
    }
    fetchCustomerData();
  }, [user]);

  if (loading) return <div className="animate-pulse text-gray-500 dark:text-gray-400">Loading your dashboard...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
          Welcome back, {user?.name?.split(' ')[0] || 'User'}! 👋
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">Here is a quick overview of your rewards and activity.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-900 p-6 rounded-[2rem] border border-gray-200 dark:border-gray-800 shadow-sm transition-colors flex items-center gap-4 xl:gap-6 min-w-0">
          <div className="w-12 h-12 xl:w-14 xl:h-14 bg-orange-50 dark:bg-orange-900/30 rounded-2xl flex items-center justify-center shrink-0">
            <Star className="w-6 h-6 xl:w-7 xl:h-7 text-orange-500 dark:text-orange-400 fill-orange-500 dark:fill-orange-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs xl:text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-widest truncate">Lifetime Stars</h3>
            <p className="text-2xl xl:text-3xl font-bold text-gray-900 dark:text-white mt-1 truncate">{lifetimeStars}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-6 rounded-[2rem] border border-gray-200 dark:border-gray-800 shadow-sm transition-colors flex items-center gap-4 xl:gap-6 min-w-0">
          <div className="w-12 h-12 xl:w-14 xl:h-14 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center shrink-0">
            <CreditCard className="w-6 h-6 xl:w-7 xl:h-7 text-indigo-500 dark:text-indigo-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs xl:text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-widest truncate">Active Cards</h3>
            <p className="text-2xl xl:text-3xl font-bold text-gray-900 dark:text-white mt-1 truncate">{activeCards}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-6 rounded-[2rem] border border-gray-200 dark:border-gray-800 shadow-sm transition-colors flex items-center gap-4 xl:gap-6 min-w-0 sm:col-span-2 lg:col-span-1">
          <div className="w-12 h-12 xl:w-14 xl:h-14 bg-green-50 dark:bg-green-900/30 rounded-2xl flex items-center justify-center shrink-0">
            <Gift className="w-6 h-6 xl:w-7 xl:h-7 text-green-500 dark:text-green-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs xl:text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-widest truncate">Rewards Ready</h3>
            <p className="text-2xl xl:text-3xl font-bold text-gray-900 dark:text-white mt-1 truncate">0</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-gray-900 p-6 md:p-8 rounded-[2rem] border border-gray-200 dark:border-gray-800 shadow-sm transition-colors flex flex-col items-center sm:items-start text-center sm:text-left">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Your Identity QR</h2>
            <ShieldCheck className="w-6 h-6 text-green-500" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm">
            Scan this code at the counter of any affiliated partner store to earn stars or redeem your rewards.
          </p>
          
          <div className="w-full max-w-[280px] bg-gray-50 dark:bg-gray-800/50 p-6 rounded-3xl border border-gray-100 dark:border-gray-700/50 flex flex-col items-center self-center sm:self-start">
            <div className="p-4 bg-white rounded-2xl shadow-sm border border-gray-200">
              <QRCodeSVG value={user?.id || ""} size={160} className="w-full max-w-[160px] h-auto" />
            </div>
            <div className="mt-4 text-center">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Unique ID (Manual Entry)</p>
              <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400 tracking-widest uppercase break-all">{user?.id}</p>
            </div>
            <div className="mt-4 text-center text-xs text-orange-600 dark:text-orange-400 font-medium">
              1 Visit = 1 Sticker
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-8 rounded-[2rem] border border-gray-200 dark:border-gray-800 shadow-sm transition-colors">
          <div className="flex items-center gap-3 mb-6">
            <Info className="w-6 h-6 text-blue-500" />
            <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">How it Works</h2>
          </div>
          
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold shrink-0">1</div>
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">Find a Partner Store</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Browse our <Link to="/customer/stores" className="text-orange-600 dark:text-orange-400 hover:underline">store directory</Link> to discover cafes, shops, and restaurants that use PerkUp.</p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold shrink-0">2</div>
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">Present Your QR Code</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">When making a purchase, show your Identity QR to the staff. They'll scan it to automatically add stars to your digital card.</p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold shrink-0">3</div>
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">Redeem Freebies</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Once you collect 10 stars at a specific store, let the staff know to redeem your reward on your next visit!</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
