import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { collection, query, getDocs, doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { db, secondaryAuth, handleFirestoreError, OperationType } from "../lib/firebase";
import { ShieldAlert, CheckCircle, Ban, Store, Plus, User, Calendar, X, FileText } from "lucide-react";

export default function AdminDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'stores' | 'applications'>('stores');
  const [stores, setStores] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingApps, setLoadingApps] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // New store form state
  const [storeName, setStoreName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [subStart, setSubStart] = useState("");
  const [subEnd, setSubEnd] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function fetchStores() {
      try {
        const snap = await getDocs(collection(db, "stores"));
        setStores(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, "stores");
      } finally {
        setLoading(false);
      }
    }
    if (activeTab === 'stores') fetchStores();
  }, [user, activeTab]);

  useEffect(() => {
    async function fetchApplications() {
      setLoadingApps(true);
      try {
        const snap = await getDocs(collection(db, "applications"));
        setApplications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        setApplications([]);
      } finally {
        setLoadingApps(false);
      }
    }
    if (activeTab === 'applications') fetchApplications();
  }, [user, activeTab]);

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

  const handleApproveApplication = (app: any) => {
    setStoreName(app.businessName);
    setOwnerName(app.applicantName);
    setOwnerEmail(app.email);
    setOwnerPassword(""); 
    setShowAddModal(true);
  };
  
  const handleRejectApplication = async (appId: string) => {
    try {
       await updateDoc(doc(db, "applications", appId), { status: "rejected" });
       setApplications(applications.map(a => a.id === appId ? { ...a, status: "rejected" } : a));
    } catch (error) {}
  };

  const handleAddStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // 1. Create owner account using secondary auth so we don't log out the admin
      const creds = await createUserWithEmailAndPassword(secondaryAuth, ownerEmail, ownerPassword);
      const newOwnerId = creds.user.uid;
      
      // Update the user profile in db
      await setDoc(doc(db, "users", newOwnerId), {
        email: ownerEmail,
        name: ownerName,
        role: "store_owner", // assign store_owner role
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Sign out from the secondary auth just to clean up
      await signOut(secondaryAuth);

      // 2. Create the store document
      const newStoreRef = doc(collection(db, "stores"));
      const newStore = {
        name: storeName,
        ownerId: newOwnerId,
        status: "active",
        subscriptionStart: subStart ? new Date(subStart) : null,
        subscriptionEnd: subEnd ? new Date(subEnd) : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      await setDoc(newStoreRef, newStore);

      // 3. Update UI and reset form
      setStores([...stores, { id: newStoreRef.id, ...newStore }]);
      setShowAddModal(false);
      setStoreName("");
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

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-max">
        <button
          onClick={() => setActiveTab('stores')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
            activeTab === 'stores' 
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' 
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          Partner Stores
        </button>
        <button
          onClick={() => setActiveTab('applications')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
            activeTab === 'applications' 
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' 
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          Applications
        </button>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Admin Control Panel</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-2">Manage all registered partner stores across the network.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-3 text-sm font-medium text-white hover:bg-orange-700 transition-all shadow-sm w-full sm:w-auto justify-center"
        >
          <Plus className="w-5 h-5" />
          Add Store & Owner
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm transition-colors">
        {activeTab === 'stores' ? (
          <>
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/50">
           <div className="flex items-center gap-3">
             <Store className="w-5 h-5 text-gray-500" />
             <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Partner Registry</h3>
           </div>
           <span className="text-xs font-semibold bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-xl border border-gray-300/50 dark:border-gray-700">
              {stores.length} {stores.length === 1 ? 'store' : 'stores'}
           </span>
        </div>
        
        {loading ? (
          <div className="p-12 text-center text-gray-400 dark:text-gray-500 animate-pulse">Loading directory...</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
            {stores.map(store => (
              <div key={store.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                    <h4 className="font-bold tracking-tight text-gray-900 dark:text-white text-lg truncate">{store.name}</h4>
                    <span className={`self-start sm:self-auto px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase shrink-0 ${
                      store.status === 'active' ? 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/50' :
                      store.status === 'pending' ? 'bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800/50' : 
                      'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50'
                    }`}>
                      {store.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono tracking-widest uppercase truncate max-w-full">
                    Owner ID: {store.ownerId}
                  </p>
                  {(store.subscriptionStart || store.subscriptionEnd) && (
                    <div className="flex gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {store.subscriptionStart && (
                        <span><Calendar className="inline w-3 h-3 mr-1" /> Starts: {store.subscriptionStart.toDate ? store.subscriptionStart.toDate().toLocaleDateString() : new Date(store.subscriptionStart.seconds * 1000).toLocaleDateString()}</span>
                      )}
                      {store.subscriptionEnd && (
                        <span><Calendar className="inline w-3 h-3 mr-1" /> Ends: {store.subscriptionEnd.toDate ? store.subscriptionEnd.toDate().toLocaleDateString() : new Date(store.subscriptionEnd.seconds * 1000).toLocaleDateString()}</span>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-3 sm:shrink-0 bg-gray-50 dark:bg-gray-900 sm:bg-transparent p-3 sm:p-0 rounded-xl sm:rounded-none">
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
          </>
        ) : (
          <>
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/50">
               <div className="flex items-center gap-3">
                 <FileText className="w-5 h-5 text-gray-500" />
                 <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Partner Applications</h3>
               </div>
               <span className="text-xs font-semibold bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-xl border border-gray-300/50 dark:border-gray-700">
                  {applications.filter((a: any) => a.status !== 'rejected').length} Pending
               </span>
            </div>
            
            {loadingApps ? (
              <div className="p-12 text-center text-gray-400 dark:text-gray-500 animate-pulse">Loading applications...</div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
                {applications.filter((a: any) => a.status !== 'rejected').map(app => (
                  <div key={app.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold tracking-tight text-gray-900 dark:text-white text-lg truncate mb-1">{app.businessName}</h4>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-full">
                        Applicant: {app.applicantName} • {app.email}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-full mt-1 line-clamp-2">
                        {app.description}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-3 sm:shrink-0 bg-gray-50 dark:bg-gray-900 sm:bg-transparent p-3 sm:p-0 rounded-xl sm:rounded-none">
                      <button 
                        onClick={() => handleApproveApplication(app)}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-white bg-orange-600 hover:bg-orange-700 transition-colors"
                      >
                        Process Setup
                      </button>
                      <button 
                        onClick={() => handleRejectApplication(app.id)}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 sm:p-2 sm:rounded-full rounded-xl text-red-700 bg-red-100 sm:bg-transparent sm:hover:bg-red-100 dark:text-red-400 dark:bg-red-900/30 dark:sm:bg-transparent dark:sm:hover:bg-red-900/50 transition-colors font-medium text-sm sm:text-transparent"
                        title="Reject Application"
                      >
                        <Ban className="w-5 h-5 sm:text-red-600 dark:sm:text-red-500" />
                        <span className="sm:hidden">Reject</span>
                      </button>
                    </div>
                  </div>
                ))}
                {applications.filter((a: any) => a.status !== 'rejected').length === 0 && (
                  <div className="p-16 text-center text-gray-400 flex flex-col items-center">
                    <FileText className="w-16 h-16 mb-4 text-gray-300 dark:text-gray-700" />
                    <p className="text-lg font-medium text-gray-500 dark:text-gray-400">No pending applications</p>
                    <p className="text-sm mt-1">When someone applies to be a partner, it will appear here.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 w-full max-w-[500px] overflow-hidden rounded-[2rem] shadow-xl relative border border-gray-100 dark:border-gray-800 transition-colors">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">New Store Setup</h3>
              <button onClick={() => setShowAddModal(false)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-full transition-colors border border-gray-200 dark:border-gray-700">
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
                <div className="grid grid-cols-2 gap-4">
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
