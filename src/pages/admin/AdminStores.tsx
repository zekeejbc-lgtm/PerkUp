import React, { useState, useEffect } from "react";
import { collection, getDocs, doc, setDoc, updateDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { db, secondaryAuth, handleFirestoreError, OperationType } from "../../lib/firebase";
import { ShieldAlert, CheckCircle, Ban, Store, Plus, Calendar, X, Trash2, Edit, Upload, Image as ImageIcon } from "lucide-react";
import AdminStoreDetail from "./AdminStoreDetail";
import { CustomDropdown } from "../../components/CustomDropdown";

export default function AdminStores() {
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [subscriptionPlans, setSubscriptionPlans] = useState<any[]>([]);

  // New store form state
  const [storeName, setStoreName] = useState("");
  const [storeLocation, setStoreLocation] = useState("");
  const [storeLogo, setStoreLogo] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setStoreLogo(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };
  const [ownerName, setOwnerName] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [subLevel, setSubLevel] = useState("Standard");
  const [subStart, setSubStart] = useState("");
  const [subEnd, setSubEnd] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function fetchStores() {
      try {
        const snap = await getDocs(collection(db, "stores"));
        setStores(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        
        const subDoc = await getDoc(doc(db, "settings", "subscriptions"));
        if (subDoc.exists() && subDoc.data().plans) {
          setSubscriptionPlans(subDoc.data().plans);
          if (subDoc.data().plans.length > 0) {
             setSubLevel(subDoc.data().plans[0].name);
          }
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, "stores");
      } finally {
        setLoading(false);
      }
    }
    fetchStores();
  }, []);

  const updateStoreStatus = async (storeId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, "stores", storeId), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
      setStores(stores.map(s => s.id === storeId ? { ...s, status: newStatus } : s));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `stores/${storeId}`);
    }
  };

  const handleAddStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const creds = await createUserWithEmailAndPassword(secondaryAuth, ownerEmail, ownerPassword);
      const newOwnerId = creds.user.uid;
      
      await setDoc(doc(db, "users", newOwnerId), {
        email: ownerEmail,
        name: ownerName,
        role: "store_owner", // assign store_owner role
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await signOut(secondaryAuth);

      const newStoreRef = doc(collection(db, "stores"));
      const newStore = {
        name: storeName,
        location: storeLocation,
        logoUrl: storeLogo,
        ownerId: newOwnerId,
        status: "active",
        subscriptionLevel: subLevel,
        subscriptionStart: subStart ? new Date(subStart) : null,
        subscriptionEnd: subEnd ? new Date(subEnd) : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      await setDoc(newStoreRef, newStore);

      setStores([...stores, { id: newStoreRef.id, ...newStore }]);
      setShowAddModal(false);
      setStoreName("");
      setStoreLocation("");
      setStoreLogo("");
      setOwnerEmail("");
      setOwnerName("");
      setOwnerPassword("");
      setSubStart("");
      setSubEnd("");
    } catch (error) {
      console.error(error);
      alert("Failed to create store: " + (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (selectedStoreId) {
    return <AdminStoreDetail storeId={selectedStoreId} onBack={() => setSelectedStoreId(null)} />;
  }

  return (
    <div className="flex flex-col h-full"> 
      <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/50">
        <div className="flex items-center gap-3">
          <Store className="w-5 h-5 text-gray-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Partner Registry</h3>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs font-semibold bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-xl border border-gray-300/50 dark:border-gray-700">
            {stores.length} {stores.length === 1 ? 'store' : 'stores'}
          </span>
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-xl text-white bg-orange-600 hover:bg-orange-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Store
          </button>
        </div>
      </div>
      
      {loading ? (
        <div className="p-12 text-center text-gray-400 dark:text-gray-500 animate-pulse">Loading directory...</div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
          {stores.map(store => (
            <div key={store.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group cursor-pointer" onClick={() => setSelectedStoreId(store.id)}>
              <div className="flex-1 min-w-0 flex items-center gap-4">
                {store.logoUrl ? (
                  <img src={store.logoUrl} alt="Store Logo" className="w-12 h-12 rounded-full object-cover border border-gray-200 dark:border-gray-700 shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400 font-bold shrink-0 border border-orange-200 dark:border-orange-800">
                    {store.name?.charAt(0) || <Store className="w-5 h-5" />}
                  </div>
                )}
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-1">
                    <h4 className="font-bold tracking-tight text-gray-900 dark:text-white text-lg truncate group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">{store.name}</h4>
                    <span className={`self-start sm:self-auto px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase shrink-0 ${
                      store.status === 'active' ? 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/50' :
                      store.status === 'pending' ? 'bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800/50' : 
                      'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50'
                    }`}>
                      {store.status}
                    </span>
                    {store.subscriptionLevel && (
                      <span className="self-start sm:self-auto px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase shrink-0 bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50">
                        {store.subscriptionLevel}
                      </span>
                    )}
                  </div>
                  {store.location && <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-full">{store.location}</p>}
                </div>
              </div>
              
              <div className="flex items-center gap-3 sm:shrink-0 bg-gray-50 dark:bg-gray-900 sm:bg-transparent p-3 sm:p-0 rounded-xl sm:rounded-none" onClick={(e) => e.stopPropagation()}>
                {store.status !== 'active' && (
                  <button 
                    onClick={() => updateStoreStatus(store.id, 'active')}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 sm:p-2 sm:rounded-full rounded-xl text-green-700 bg-green-100 sm:bg-transparent sm:hover:bg-green-100 dark:text-green-400 dark:bg-green-900/30 dark:sm:bg-transparent dark:sm:hover:bg-green-900/50 transition-colors font-medium text-sm sm:text-transparent"
                    title="Approve Store"
                  >
                    <CheckCircle className="w-5 h-5 sm:text-green-600 dark:sm:text-green-500" />
                    <span className="sm:hidden">Approve</span>
                  </button>
                )}
                {store.status !== 'suspended' && (
                  <button 
                    onClick={() => updateStoreStatus(store.id, 'suspended')}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 sm:p-2 sm:rounded-full rounded-xl text-red-700 bg-red-100 sm:bg-transparent sm:hover:bg-red-100 dark:text-red-400 dark:bg-red-900/30 dark:sm:bg-transparent dark:sm:hover:bg-red-900/50 transition-colors font-medium text-sm sm:text-transparent"
                    title="Suspend Store"
                  >
                    <Ban className="w-5 h-5 sm:text-red-600 dark:sm:text-red-500" />
                    <span className="sm:hidden">Suspend</span>
                  </button>
                )}
              </div>
            </div>
          ))}
          
          {stores.length === 0 && (
            <div className="p-16 text-center text-gray-400 flex flex-col items-center">
              <ShieldAlert className="w-16 h-16 mb-4 text-gray-300 dark:text-gray-700" />
              <p className="text-lg font-medium text-gray-500 dark:text-gray-400">Empty Registry</p>
              <p className="text-sm mt-1">No partner stores have registered yet.</p>
            </div>
          )}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 pointer-events-auto">
          <div className="bg-white dark:bg-gray-900 w-full max-w-[600px] max-h-[90vh] overflow-y-auto rounded-[2rem] shadow-xl relative border border-gray-100 dark:border-gray-800 transition-colors" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50 sticky top-0 z-10 backdrop-blur-sm">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">New Store Setup</h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-full transition-colors border border-gray-200 dark:border-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddStore} className="p-6 space-y-6">
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-widest border-b border-gray-200 dark:border-gray-800 pb-2">Store Details</h4>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Store Name</label>
                  <input type="text" required value={storeName} onChange={e => setStoreName(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none" placeholder="e.g. Downtown Coffee" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Location (Address)</label>
                  <input type="text" value={storeLocation} onChange={e => setStoreLocation(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none" placeholder="123 Main St, City" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Logo Image Upload</label>
                  <div className="flex items-center gap-4">
                    {storeLogo ? (
                      <div className="w-12 h-12 rounded-xl border border-gray-200 overflow-hidden shrink-0">
                        <img src={storeLogo} alt="Logo Preview" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 border border-gray-200 text-gray-400">
                       <ImageIcon className="w-5 h-5" />
                      </div>
                    )}
                    <label className="flex-1 cursor-pointer">
                      <div className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700">
                        <Upload className="w-4 h-4" />
                        Choose File
                      </div>
                      <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                    </label>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Subscription Level</label>
                    <CustomDropdown
                       options={
                          subscriptionPlans.length > 0 
                            ? subscriptionPlans.map(p => ({ label: p.name, value: p.name }))
                            : [{ label: "Standard", value: "Standard" }]
                       }
                       value={subLevel}
                       onChange={setSubLevel}
                       className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Subscription Start</label>
                    <input type="date" required value={subStart} onChange={e => setSubStart(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Subscription End</label>
                    <input type="date" required value={subEnd} onChange={e => setSubEnd(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none" />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-widest border-b border-gray-200 dark:border-gray-800 pb-2">Owner Account</h4>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Owner Name</label>
                  <input type="text" required value={ownerName} onChange={e => setOwnerName(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none" placeholder="John Doe" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Owner Email</label>
                  <input type="email" required value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none" placeholder="owner@store.com" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Temporary Password</label>
                  <input type="text" required minLength={6} value={ownerPassword} onChange={e => setOwnerPassword(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none" placeholder="At least 6 characters" />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium py-3 px-4 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-orange-600 dark:bg-orange-600 text-white font-medium py-3 px-4 rounded-xl hover:bg-orange-700 dark:hover:bg-orange-700 transition-colors disabled:opacity-50">
                  {isSubmitting ? 'Creating...' : 'Create Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
