import React, { useState, useEffect } from "react";
import { doc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { ArrowLeft, Edit, Trash2, ShieldAlert, Key, Loader2, Save } from "lucide-react";

import { CustomDropdown } from "../../components/CustomDropdown";
import {
  DEFAULT_SUBSCRIPTION_PLANS,
  dateInputToDate,
  formatBillingDate,
  formatMoney,
  getSubscriptionOwedAmount,
  toDateInputValue,
} from "../../lib/subscriptionBilling";

export default function AdminStoreDetail({ storeId, onBack }: { storeId: string, onBack: () => void }) {
  const [store, setStore] = useState<any>(null);
  const [owner, setOwner] = useState<any>(null);
  const [staff, setStaff] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Analytics State
  const [activeTab, setActiveTab] = useState<'overview'|'accounts'|'analytics'>('overview');
  const [analytics, setAnalytics] = useState({
    customers: 0,
    promotions: 0,
    claims: 0
  });

  // Edit store state
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<any>({});
  
  // Password reset state
  const [resetModalUser, setResetModalUser] = useState<any>(null);
  const [newPasswordType, setNewPasswordType] = useState<'default' | 'random' | 'custom'>('default');
  const [customPassword, setCustomPassword] = useState('');
  const [requirePasswordChange, setRequirePasswordChange] = useState(false);

  useEffect(() => {
    async function fetchDetails() {
      try {
        const storeDoc = await getDoc(doc(db, "stores", storeId));
        if (storeDoc.exists()) {
          const storeData = storeDoc.data();
          const subDoc = await getDoc(doc(db, "settings", "subscriptions"));
          const loadedPlans = subDoc.exists() && subDoc.data().plans
            ? subDoc.data().plans
            : DEFAULT_SUBSCRIPTION_PLANS;
          const subscriptionLevel = storeData.subscriptionLevel || loadedPlans[0]?.name || 'Standard';
          const owedAmount = getSubscriptionOwedAmount(loadedPlans, subscriptionLevel, Number(storeData.owedAmount || 0));

          setPlans(loadedPlans);
          setStore({ id: storeDoc.id, ...storeData });
          setEditData({
            name: storeData.name || '',
            subscriptionLevel,
            owedAmount,
            subscriptionStart: toDateInputValue(storeData.subscriptionStart),
            subscriptionEnd: toDateInputValue(storeData.subscriptionEnd),
            paymentDate: toDateInputValue(storeData.paymentDate),
            status: storeData.status || 'active',
          });

          // Fetch owner
          if (storeData.ownerId) {
            const ownerDoc = await getDoc(doc(db, "users", storeData.ownerId));
            if (ownerDoc.exists()) setOwner({ id: ownerDoc.id, ...ownerDoc.data() });
          }

          // Fetch staff
          const staffQuery = query(collection(db, "users"), where("storeId", "==", storeId), where("role", "==", "staff"));
          const staffSnap = await getDocs(staffQuery);
          setStaff(staffSnap.docs.map(d => ({ id: d.id, ...d.data() })));

          // Fetch Analytics (Mocked up via actual queries)
          const customersQuery = query(collection(db, "users"), where("storeId", "==", storeId), where("role", "==", "customer"));
          const customersSnap = await getDocs(customersQuery);
          
          const promosQuery = query(collection(db, "promotions"), where("storeId", "==", storeId));
          const promosSnap = await getDocs(promosQuery);

          const claimsQuery = query(collection(db, "promotions_scanned"), where("storeId", "==", storeId));
          const claimsSnap = await getDocs(claimsQuery);

          setAnalytics({
            customers: customersSnap.size,
            promotions: promosSnap.size,
            claims: claimsSnap.size
          });

        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    fetchDetails();
  }, [storeId]);

  const handleUpdateStore = async () => {
    try {
      const nextData = {
        ...editData,
        owedAmount: getSubscriptionOwedAmount(plans, editData.subscriptionLevel, Number(editData.owedAmount || 0)),
        subscriptionStart: dateInputToDate(editData.subscriptionStart),
        subscriptionEnd: dateInputToDate(editData.subscriptionEnd),
        paymentDate: dateInputToDate(editData.paymentDate),
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "stores", storeId), nextData);
      setStore({ ...store, ...nextData });
      setEditData({
        ...editData,
        owedAmount: nextData.owedAmount,
      });
      setIsEditing(false);
    } catch (error) {
      console.error(error);
      alert("Failed to update store");
    }
  };

  const handleSubscriptionLevelChange = (level: string) => {
    setEditData({
      ...editData,
      subscriptionLevel: level,
      owedAmount: getSubscriptionOwedAmount(plans, level, Number(editData.owedAmount || 0)),
    });
  };

  const handleDeleteStore = async () => {
    if (!window.confirm("Are you sure you want to permanently delete this store? This will also remove the owner and staff accounts.")) return;
    try {
      // Simplistic cascade delete for demo purposes. 
      // In production, an Edge Function/Cloud Function is better.
      await deleteDoc(doc(db, "stores", storeId));
      if (owner) await deleteDoc(doc(db, "users", owner.id));
      for (const s of staff) {
        await deleteDoc(doc(db, "users", s.id));
      }
      onBack();
    } catch (error) {
      console.error(error);
      alert("Failed to delete store");
    }
  };

  const handleResetPassword = async () => {
    if (!resetModalUser) return;
    // In a real application, you would need an Admin SDK endpoint to update a user's password without them being logged in.
    // For this client-side demo, we represent the intent by setting a 'forcePasswordReset' flag on their document
    // and maybe saving a temporary password in a secure way (or just alerting the admin).
    try {
      let tempPassword = "Password123!";
      if (newPasswordType === 'random') tempPassword = Math.random().toString(36).slice(-8) + "!";
      if (newPasswordType === 'custom') tempPassword = customPassword;

      await updateDoc(doc(db, "users", resetModalUser.id), {
        forcePasswordReset: requirePasswordChange,
        // (Fake storing hash, or communicating to backend)
        tempPasswordIndicator: "Password reset authorized"
      });
      alert(`Password has been reset for ${resetModalUser.email}.\nTemporary password: ${tempPassword}\n\nNote: In a true client-only setup, a backend function is required to update another user's Supabase Auth password.`);
      setResetModalUser(null);
    } catch (e) {
      console.error(e);
      alert("Failed to initiate password reset.");
    }
  };

  if (loading) {
    return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-orange-600" /></div>;
  }

  if (!store) {
    return <div className="p-12 text-center text-gray-400">Store not found.</div>;
  }

  return (
    <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-300">
      <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 sticky top-0 z-10 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
            <h3 className="font-bold text-gray-900 dark:text-white text-xl">{store.name} Dashboard</h3>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors">
                <Edit className="w-4 h-4" /> Edit
              </button>
            ) : (
              <button onClick={handleUpdateStore} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-white bg-green-600 hover:bg-green-700 transition-colors">
                <Save className="w-4 h-4" /> Save
              </button>
            )}
            <button onClick={handleDeleteStore} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-red-700 bg-red-100 hover:bg-red-200 transition-colors">
              <Trash2 className="w-4 h-4" /> Delete Store
            </button>
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setActiveTab('overview')} className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'overview' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}>Overview</button>
          <button onClick={() => setActiveTab('accounts')} className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'accounts' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}>Accounts</button>
          <button onClick={() => setActiveTab('analytics')} className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'analytics' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}>Analytics & Logs</button>
        </div>
      </div>

      <div className="p-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
              <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">Store Config</h4>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Store Name</label>
                  {isEditing ? (
                    <input type="text" value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" />
                  ) : (
                    <p className="text-gray-900 dark:text-white font-medium">{store.name}</p>
                  )}
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Status</label>
                  {isEditing ? (
                    <CustomDropdown
                      options={[
                        { label: "Active", value: "active" },
                        { label: "Suspended", value: "suspended" },
                        { label: "Banned", value: "banned" }
                      ]}
                      value={editData.status}
                      onChange={v => setEditData({...editData, status: v})}
                    />
                  ) : (
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold tracking-wider uppercase ${
                      store.status === 'active' ? 'bg-green-100 text-green-700' :
                      store.status === 'suspended' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {store.status}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
              <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">Subscription & Billing</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Subscription Level</label>
                  {isEditing ? (
                    <CustomDropdown
                      options={plans.map(p => ({ label: p.name, value: p.name }))}
                      value={editData.subscriptionLevel}
                      onChange={handleSubscriptionLevelChange}
                    />
                  ) : (
                    <p className="text-gray-900 dark:text-white font-medium">{store.subscriptionLevel || 'Standard'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Owed Amount</label>
                  {isEditing ? (
                    <div className="w-full bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm font-medium text-gray-900 dark:text-white">
                      {formatMoney(editData.owedAmount)}
                    </div>
                  ) : (
                    <p className="text-red-600 font-medium">{formatMoney(getSubscriptionOwedAmount(plans, store.subscriptionLevel, Number(store.owedAmount || 0)))}</p>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Subscription Start</label>
                    {isEditing ? (
                      <input type="date" value={editData.subscriptionStart || ""} onChange={e => setEditData({...editData, subscriptionStart: e.target.value})} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" />
                    ) : (
                      <p className="text-sm text-gray-900 dark:text-gray-300">{formatBillingDate(store.subscriptionStart)}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Subscription End</label>
                    {isEditing ? (
                      <input type="date" value={editData.subscriptionEnd || ""} onChange={e => setEditData({...editData, subscriptionEnd: e.target.value})} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" />
                    ) : (
                      <p className="text-sm text-gray-900 dark:text-gray-300">{formatBillingDate(store.subscriptionEnd)}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Payment Date</label>
                    {isEditing ? (
                      <input type="date" value={editData.paymentDate || ""} onChange={e => setEditData({...editData, paymentDate: e.target.value})} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" />
                    ) : (
                      <p className="text-sm text-gray-900 dark:text-gray-300">{formatBillingDate(store.paymentDate)}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Account Management */}
        {activeTab === 'accounts' && (
          <div className="max-w-3xl space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
              <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">Owner & Staff Accounts</h4>
              
              <div className="mb-6">
                <h5 className="text-xs font-semibold text-gray-500 mb-3 border-b border-gray-200 dark:border-gray-700 pb-1">Store Owner</h5>
                {owner ? (
                  <div className="flex items-center justify-between bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                    <div>
                      <p className="font-medium text-sm text-gray-900 dark:text-white">{owner.name}</p>
                      <p className="text-xs text-gray-500">{owner.email}</p>
                    </div>
                    <button onClick={() => setResetModalUser(owner)} className="p-2 text-gray-500 hover:text-orange-600 bg-gray-50 dark:bg-gray-800 rounded-lg" title="Reset Password">
                      <Key className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No owner found.</p>
                )}
              </div>

              <div>
                <h5 className="text-xs font-semibold text-gray-500 mb-3 border-b border-gray-200 dark:border-gray-700 pb-1">Staff Accounts ({staff.length})</h5>
                {staff.length > 0 ? (
                  <div className="space-y-2">
                    {staff.map(s => (
                      <div key={s.id} className="flex items-center justify-between bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                        <div>
                          <p className="font-medium text-sm text-gray-900 dark:text-white">{s.name}</p>
                          <p className="text-xs text-gray-500">{s.email}</p>
                        </div>
                        <button onClick={() => setResetModalUser(s)} className="p-2 text-gray-500 hover:text-orange-600 bg-gray-50 dark:bg-gray-800 rounded-lg" title="Reset Password">
                          <Key className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No staff accounts active.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Analytics & Logs Subpage */}
        {activeTab === 'analytics' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 text-center">
                 <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-2">Customers</p>
                 <p className="text-4xl font-black text-gray-900 dark:text-white">{analytics.customers}</p>
               </div>
               <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 text-center">
                 <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-2">Promotions</p>
                 <p className="text-4xl font-black text-gray-900 dark:text-white">{analytics.promotions}</p>
               </div>
               <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 text-center">
                 <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-2">Claims Scanned</p>
                 <p className="text-4xl font-black text-gray-900 dark:text-white">{analytics.claims}</p>
               </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
               <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-black/20">
                 <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500">System Activity Log</h4>
               </div>
               <div className="p-0 overflow-x-auto">
                 <table className="w-full text-sm text-left whitespace-nowrap">
                   <thead className="bg-gray-100 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400">
                     <tr>
                       <th className="px-6 py-3 font-semibold">Date</th>
                       <th className="px-6 py-3 font-semibold">Event</th>
                       <th className="px-6 py-3 font-semibold">Actor</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-700 dark:text-gray-300">
                     <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                       <td className="px-6 py-3 font-mono text-xs">{store.createdAt ? new Date(store.createdAt.seconds * 1000).toLocaleString() : 'Unknown'}</td>
                       <td className="px-6 py-3 font-medium">Store Profile Created</td>
                       <td className="px-6 py-3 text-gray-500">System</td>
                     </tr>
                     {staff.map(s => (
                       <tr key={`staff-${s.id}`} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                         <td className="px-6 py-3 font-mono text-xs">Unknown</td>
                         <td className="px-6 py-3 font-medium">Staff Account Registered</td>
                         <td className="px-6 py-3 text-gray-500">{s.name} ({s.email})</td>
                       </tr>
                     ))}
                     {analytics.promotions > 0 && (
                       <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                         <td className="px-6 py-3 font-mono text-xs">Multiple</td>
                         <td className="px-6 py-3 font-medium">{analytics.promotions} Active Promotions Published</td>
                         <td className="px-6 py-3 text-gray-500">Store Owner</td>
                       </tr>
                     )}
                     {analytics.claims > 0 && (
                       <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                         <td className="px-6 py-3 font-mono text-xs">Multiple</td>
                         <td className="px-6 py-3 font-medium">{analytics.claims} Customer Claim(s) Processed</td>
                         <td className="px-6 py-3 text-gray-500">Staff</td>
                       </tr>
                     )}
                   </tbody>
                 </table>
               </div>
            </div>
          </div>
        )}
      </div>

      {resetModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-[2rem] shadow-xl p-6 border border-gray-100 dark:border-gray-800">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Reset Password</h3>
            <p className="text-sm text-gray-600 mb-4">Resetting password for <strong>{resetModalUser.email}</strong></p>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">Password Type</label>
                <select value={newPasswordType} onChange={e => setNewPasswordType(e.target.value as any)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm">
                  <option value="default">Default (Password123!)</option>
                  <option value="random">Randomize</option>
                  <option value="custom">Set Custom</option>
                </select>
              </div>

              {newPasswordType === 'custom' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-2">Custom Password</label>
                  <input type="password" value={customPassword} onChange={e => setCustomPassword(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" placeholder="Enter new password" />
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer mt-4">
                <input type="checkbox" checked={requirePasswordChange} onChange={e => setRequirePasswordChange(e.target.checked)} className="rounded border-gray-300 text-orange-600 focus:ring-orange-500" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Require change on next login</span>
              </label>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setResetModalUser(null)} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium py-2 px-4 rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
              <button onClick={handleResetPassword} className="flex-1 bg-orange-600 text-white font-medium py-2 px-4 rounded-xl hover:bg-orange-700 transition-colors">Confirm Reset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
