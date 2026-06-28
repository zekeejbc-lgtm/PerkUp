import React, { useState, useEffect } from "react";
import { collection, getDocs, doc, updateDoc, serverTimestamp, getDoc } from "@/src/lib/dataCompat";
import { db, handleDataError, OperationType } from "../../lib/backend";
import { invokeAdminBackend } from "../../lib/adminBackend";
import { ShieldAlert, CheckCircle, Ban, Store, Plus, X, Upload, Image as ImageIcon } from "lucide-react";
import AdminStoreDetail from "./AdminStoreDetail";
import { CustomDropdown } from "../../components/CustomDropdown";
import { getDisplayImageUrl, uploadImageFileToDriveSecure } from "../../lib/imageStorage";
import {
  DEFAULT_SUBSCRIPTION_PLANS,
  dateInputToDate,
  formatMoney,
  getSubscriptionOwedAmount,
} from "../../lib/subscriptionBilling";
import { SkeletonBlock } from "../../components/LoadingSkeleton";
import { useSearchParams } from "react-router-dom";

export default function AdminStores() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const selectedStoreId = searchParams.get("store");
  const [subscriptionPlans, setSubscriptionPlans] = useState<any[]>([]);

  // New store form state
  const [storeName, setStoreName] = useState("");
  const [storeLocation, setStoreLocation] = useState("");
  const [storeLogo, setStoreLogo] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const uploadedUrl = await uploadImageFileToDriveSecure(file, {
          owner: storeName || ownerEmail,
          purpose: "admin-store-logo",
        });
        setStoreLogo(uploadedUrl);
      } catch (error) {
        console.error("Store logo upload failed", error);
        alert("Failed to upload store logo");
      }
    }
  };
  const [ownerName, setOwnerName] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [subLevel, setSubLevel] = useState("Standard");
  const [subStart, setSubStart] = useState("");
  const [subEnd, setSubEnd] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const billingPlans = subscriptionPlans.length > 0 ? subscriptionPlans : DEFAULT_SUBSCRIPTION_PLANS;
  const selectedOwedAmount = getSubscriptionOwedAmount(billingPlans, subLevel);

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
        handleDataError(error, OperationType.LIST, "stores");
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
      handleDataError(error, OperationType.UPDATE, `stores/${storeId}`);
    }
  };

  const handleAddStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const result = await invokeAdminBackend<{ store: any }>({
        action: "create_store",
        email: ownerEmail,
        password: ownerPassword,
        name: ownerName,
        store: {
          name: storeName,
          location: storeLocation,
          logoUrl: storeLogo,
          status: "active",
          subscriptionLevel: subLevel,
          owedAmount: selectedOwedAmount,
          subscriptionStart: dateInputToDate(subStart),
          subscriptionEnd: dateInputToDate(subEnd),
          paymentDate: dateInputToDate(paymentDate),
        },
      });

      setStores([...stores, result.store]);
      setShowAddModal(false);
      setStoreName("");
      setStoreLocation("");
      setStoreLogo("");
      setOwnerEmail("");
      setOwnerName("");
      setOwnerPassword("");
      setSubStart("");
      setSubEnd("");
      setPaymentDate("");
    } catch (error) {
      console.error(error);
      alert("Failed to create store: " + (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (selectedStoreId) {
    return <AdminStoreDetail storeId={selectedStoreId} onBack={() => {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("store");
      nextParams.delete("detailTab");
      setSearchParams(nextParams);
    }} />;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-100 bg-gray-50/50 p-5 dark:border-gray-800 dark:bg-gray-900/50 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:p-6">
        <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-3">
          <Store className="mt-1 h-6 w-6 shrink-0 text-gray-500 sm:mt-0 sm:h-5 sm:w-5" />
          <h3 className="min-w-0 text-2xl font-bold leading-tight text-gray-900 dark:text-white sm:text-lg sm:font-semibold">Partner Registry</h3>
        </div>
        <div className="mt-5 grid grid-cols-[auto_1fr] items-stretch gap-3 sm:mt-0 sm:flex sm:shrink-0 sm:items-center sm:gap-4">
          <span className="flex min-h-12 items-center justify-center rounded-2xl border border-gray-300/50 bg-gray-200 px-4 text-base font-semibold leading-tight text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 sm:min-h-0 sm:rounded-xl sm:px-3 sm:py-1.5 sm:text-xs">
            {stores.length} {stores.length === 1 ? 'store' : 'stores'}
          </span>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#1b1b1b] px-4 text-base font-semibold leading-tight text-white transition-colors hover:bg-black sm:min-h-0 sm:rounded-xl sm:px-3 sm:py-1.5 sm:text-sm sm:font-medium"
          >
            <Plus className="h-5 w-5 sm:h-4 sm:w-4" />
            <span>Add Store</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 p-6">
          <SkeletonBlock className="h-20 rounded-2xl" />
          <SkeletonBlock className="h-20 rounded-2xl" />
          <SkeletonBlock className="h-20 rounded-2xl" />
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
          {stores.map(store => (
            <div key={store.id} className="group flex cursor-pointer flex-col gap-6 p-6 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 sm:flex-row sm:items-center sm:justify-between sm:gap-6" onClick={() => {
              const nextParams = new URLSearchParams(searchParams);
              nextParams.set("store", store.id);
              setSearchParams(nextParams);
            }}>
              <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-4">
                {store.logoUrl ? (
                  <img src={getDisplayImageUrl(store.logoUrl)} alt="Store Logo" className="h-14 w-14 shrink-0 rounded-full border border-gray-200 object-cover dark:border-gray-700 sm:h-12 sm:w-12" />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-gray-100 text-lg font-bold text-[#1b1b1b] dark:border-white/15 dark:bg-white/10 dark:text-white sm:h-12 sm:w-12 sm:text-base">
                    {store.name?.charAt(0) || <Store className="h-6 w-6 sm:h-5 sm:w-5" />}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2 sm:mb-1 sm:gap-3">
                    <h4 className="w-full truncate text-xl font-bold tracking-tight text-gray-900 transition-colors group-hover:text-[#1b1b1b] dark:text-white dark:group-hover:text-white sm:w-auto sm:text-lg">{store.name}</h4>
                    <span className={`self-start sm:self-auto px-3 py-1 sm:px-2.5 rounded-full text-[11px] sm:text-[10px] font-bold tracking-wider uppercase shrink-0 ${
                      store.status === 'active' ? 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/50' :
                      store.status === 'pending' ? 'bg-gray-100 text-[#1b1b1b] border border-gray-300 dark:bg-white/10 dark:text-white dark:border-white/15' :
                      'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50'
                    }`}>
                      {store.status}
                    </span>
                    {store.subscriptionLevel && (
                      <span className="self-start sm:self-auto px-3 py-1 sm:px-2.5 rounded-full text-[11px] sm:text-[10px] font-bold tracking-wider uppercase shrink-0 bg-gray-100 text-[#1b1b1b] border border-gray-300 dark:bg-white/10 dark:text-white dark:border-white/15">
                        {store.subscriptionLevel}
                      </span>
                    )}
                  </div>
                  {store.location && <p className="max-w-full truncate text-sm text-gray-500 dark:text-gray-400 sm:text-xs">{store.location}</p>}
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-2xl bg-gray-50 p-3 dark:bg-gray-900 sm:shrink-0 sm:rounded-none sm:bg-transparent sm:p-0" onClick={(e) => e.stopPropagation()}>
                {store.status !== 'active' && (
                  <button
                    onClick={() => updateStoreStatus(store.id, 'active')}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 sm:p-2 sm:rounded-full rounded-xl text-green-700 bg-green-100 sm:bg-transparent sm:hover:bg-green-100 dark:text-green-400 dark:bg-green-900/30 dark:sm:bg-transparent dark:sm:hover:bg-green-900/50 transition-colors font-semibold text-base sm:text-transparent"
                    title="Approve Store"
                  >
                    <CheckCircle className="h-6 w-6 sm:h-5 sm:w-5 sm:text-green-600 dark:sm:text-green-500" />
                    <span className="sm:hidden">Approve</span>
                  </button>
                )}
                {store.status !== 'suspended' && (
                  <button
                    onClick={() => updateStoreStatus(store.id, 'suspended')}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 sm:p-2 sm:rounded-full rounded-xl text-red-700 bg-red-100 sm:bg-transparent sm:hover:bg-red-100 dark:text-red-400 dark:bg-red-900/30 dark:sm:bg-transparent dark:sm:hover:bg-red-900/50 transition-colors font-semibold text-base sm:text-transparent"
                    title="Suspend Store"
                  >
                    <Ban className="h-6 w-6 sm:h-5 sm:w-5 sm:text-red-600 dark:sm:text-red-500" />
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
                  <input type="text" required value={storeName} onChange={e => setStoreName(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-[#1b1b1b] outline-none" placeholder="e.g. Downtown Coffee" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Location (Address)</label>
                  <input type="text" value={storeLocation} onChange={e => setStoreLocation(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-[#1b1b1b] outline-none" placeholder="123 Main St, City" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Logo Image Upload</label>
                  <div className="flex items-center gap-4">
                    {storeLogo ? (
                      <div className="w-12 h-12 rounded-xl border border-gray-200 overflow-hidden shrink-0">
                        <img src={getDisplayImageUrl(storeLogo)} alt="Logo Preview" className="w-full h-full object-cover" />
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Subscription Level</label>
                    <CustomDropdown
                       options={
                          billingPlans.map(p => ({ label: p.name || "Unnamed Plan", value: p.name || p.id || "Standard" }))
                       }
                       value={subLevel}
                       onChange={setSubLevel}
                       className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Owed Amount</label>
                    <div className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl text-sm font-medium">
                      {formatMoney(selectedOwedAmount)}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Subscription Start</label>
                    <input type="date" required value={subStart} onChange={e => setSubStart(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-[#1b1b1b] outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Subscription End</label>
                    <input type="date" required value={subEnd} onChange={e => setSubEnd(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-[#1b1b1b] outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Payment Date</label>
                    <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-[#1b1b1b] outline-none" />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-widest border-b border-gray-200 dark:border-gray-800 pb-2">Owner Account</h4>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Owner Name</label>
                  <input type="text" required value={ownerName} onChange={e => setOwnerName(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-[#1b1b1b] outline-none" placeholder="John Doe" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Owner Email</label>
                  <input type="email" required value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-[#1b1b1b] outline-none" placeholder="owner@store.com" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Temporary Password</label>
                  <input type="password" required minLength={6} value={ownerPassword} onChange={e => setOwnerPassword(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-[#1b1b1b] outline-none" placeholder="At least 6 characters" />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button type="button" onClick={() => setShowAddModal(false)} className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="rounded-lg bg-[#1b1b1b] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-50 dark:bg-[#1b1b1b] dark:hover:bg-black">
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
