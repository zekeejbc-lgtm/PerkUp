import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { Store, Clock, Zap, ArrowRight, Activity, MessageSquare } from "lucide-react";

export default function StoreOwnerDashboard() {
  const { user } = useAuth();
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStores() {
      if (!user) return;
      try {
        const q = query(collection(db, "stores"), where("ownerId", "==", user.id));
        const snap = await getDocs(q);
        setStores(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, "stores");
      } finally {
        setLoading(false);
      }
    }
    fetchStores();
  }, [user]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
           <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">My Stores</h2>
           <p className="text-gray-500 dark:text-gray-400 mt-2">Manage your locations, staff, and promotional offers.</p>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse flex gap-4 text-gray-500 dark:text-gray-400">
           Loading your locations...
        </div>
      ) : stores.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 p-12 rounded-[2rem] border border-dashed border-gray-300 dark:border-gray-700 text-center flex flex-col items-center transition-colors">
           <div className="w-20 h-20 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6">
             <Store className="w-10 h-10 text-gray-400 max-w-full" />
           </div>
           <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No stores assigned</h3>
           <p className="text-gray-500 dark:text-gray-400 max-w-sm mb-8">You haven't been assigned any locations yet. Please contact your system administrator to register a new store and manage subscriptions.</p>
           <button 
             className="inline-flex items-center gap-2 rounded-xl bg-orange-50 dark:bg-orange-900/30 px-6 py-3 text-sm font-medium text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800/50 hover:bg-orange-100 dark:hover:bg-orange-900/50 transition-colors"
           >
             <MessageSquare className="w-5 h-5" />
             Contact Administrator
           </button>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map(store => (
            <div key={store.id} className="bg-white dark:bg-gray-900 p-6 sm:p-8 rounded-[2rem] border border-gray-200 dark:border-gray-800 flex flex-col justify-between group hover:border-gray-300 dark:hover:border-gray-700 transition-all shadow-sm hover:shadow-md">
              <div>
                <div className="flex justify-between items-start mb-6 gap-4">
                  <h3 className="font-bold text-xl text-gray-900 dark:text-white truncate">{store.name}</h3>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase shrink-0 ${
                    store.status === 'active' ? 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/50' :
                    store.status === 'pending' ? 'bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800/50' : 
                    'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50'
                  }`}>
                    {store.status}
                  </span>
                </div>
                
                <div className="space-y-4 mb-8">
                   <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                      <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center shrink-0">
                        {store.status === 'active' ? <Activity className="w-5 h-5 text-green-500" /> : <Clock className="w-5 h-5 text-gray-400" />}
                      </div>
                      <span className="font-medium">{store.status === 'active' ? 'Accepting customer scans' : 'Awaiting admin approval'}</span>
                   </div>
                   <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                      <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center shrink-0">
                        <Zap className="w-5 h-5 text-yellow-500" />
                      </div>
                      <span className="font-medium">0 active promotional offers</span>
                   </div>
                </div>
              </div>

              <div className="pt-6 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center mt-auto">
                 <p className="text-xs font-mono text-gray-400 dark:text-gray-500 uppercase tracking-widest truncate max-w-[100px]">{store.id.slice(0,8)}</p>
                 <button className="text-sm font-semibold text-gray-900 dark:text-white hover:text-orange-600 dark:hover:text-orange-400 transition-colors flex items-center gap-1 group-hover:gap-2">
                   Manage <ArrowRight className="w-4 h-4" />
                 </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
