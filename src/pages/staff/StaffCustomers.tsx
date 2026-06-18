import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Users, Star, CreditCard, ChevronRight } from "lucide-react";

export default function StaffCustomers({ store }: { store: any }) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!store?.id) return;
    async function fetchCustomers() {
      try {
        const q = query(collection(db, "cards"), where("storeId", "==", store.id));
        const snap = await getDocs(q);
        
        const custData = [];
        for (const d of snap.docs) {
          custData.push({ id: d.id, ...d.data() });
        }
        setCustomers(custData);
      } catch (err) {
        console.error("Failed to load customers", err);
      } finally {
        setLoading(false);
      }
    }
    fetchCustomers();
  }, [store]);

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Store Customers</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">View customers and their card progress.</p>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
          ))}
        </div>
      ) : customers.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 p-12 rounded-[2rem] border border-dashed border-gray-300 dark:border-gray-700 text-center flex flex-col items-center">
          <Users className="w-16 h-16 text-gray-400 mb-6" />
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No customers yet</h3>
          <p className="text-gray-500 max-w-sm mb-8">When a customer joins your store's program, they will appear here.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Customer ID</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Stars</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {customers.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center border border-orange-200 dark:border-orange-800">
                          <Users className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[120px] sm:max-w-xs">{c.customerId || "Unknown"}</p>
                          <p className="text-xs text-gray-500">Joined {c.joinedAt?.toDate?.()?.toLocaleDateString() || "Recently"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold capitalize ${
                        c.status === 'active' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${c.status === 'active' ? 'bg-green-500' : 'bg-gray-500'}`} />
                        {c.status || "Active"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                       <span className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
                         <Star className="w-4 h-4 text-orange-500 fill-orange-500 cursor-help" title={`Total Stars: ${c.stars || 0}`} />
                         {c.stars || 0}
                       </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
