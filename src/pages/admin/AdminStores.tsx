import React, { useState, useEffect, useMemo } from "react";
import { collection, getDocs, doc, updateDoc, serverTimestamp, getDoc } from "@/src/lib/dataCompat";
import { db, handleDataError, OperationType } from "../../lib/backend";
import { invokeAdminBackend } from "../../lib/adminBackend";
import { ShieldAlert, CheckCircle, Ban, Store, Plus, X, Upload, Image as ImageIcon, Search, SlidersHorizontal } from "lucide-react";
import AdminStoreDetail from "./AdminStoreDetail";
import { CustomDropdown } from "../../components/CustomDropdown";
import { getDisplayImageUrl, uploadImageFileToDriveSecure } from "../../lib/imageStorage";
import {
  DEFAULT_SUBSCRIPTION_PLANS,
  dateInputToDate,
  formatMoney,
  getSubscriptionOwedAmount,
  PAYMENT_SCHEDULE_OPTIONS,
} from "../../lib/subscriptionBilling";
import { SkeletonBlock } from "../../components/LoadingSkeleton";
import { ImageCropEditor } from "../../components/ImageCropEditor";
import { useSearchParams } from "react-router-dom";
import { TemporaryPasswordField } from "../../components/TemporaryPasswordField";
import { validateStrongPassword } from "../../lib/passwordStrength";
import { StoreLocationPicker } from "../../components/StoreLocationPicker";
import { getAvailableStoreCategories, normalizeStoreCategory, splitStoreCategories } from "../../lib/storeDirectory";
import { TimeInput } from "../../components/TimeInput";
import { formatStoreHours } from "../../lib/dateTime";
import { CategoryInput } from "../../components/CategoryInput";

export default function AdminStores() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const selectedStoreId = searchParams.get("store");
  const [subscriptionPlans, setSubscriptionPlans] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // New store form state
  const [storeName, setStoreName] = useState("");
  const [storeLocation, setStoreLocation] = useState("");
  const [storeDescription, setStoreDescription] = useState("");
  const [storeCategory, setStoreCategory] = useState("");
  const [storeContact, setStoreContact] = useState("");
  const [storeWebsite, setStoreWebsite] = useState("");
  const [storeOpeningTime, setStoreOpeningTime] = useState("09:00");
  const [storeClosingTime, setStoreClosingTime] = useState("21:00");
  const [storeLatitude, setStoreLatitude] = useState(7.4478);
  const [storeLongitude, setStoreLongitude] = useState(125.8078);
  const [storeLogo, setStoreLogo] = useState("");
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);
  const [logoEditorFile, setLogoEditorFile] = useState<File | null>(null);
  const [ownerEmail, setOwnerEmail] = useState("");

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setLogoEditorFile(file);
    e.target.value = "";
  };
  const [ownerName, setOwnerName] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [requirePasswordChange, setRequirePasswordChange] = useState(true);
  const [subLevel, setSubLevel] = useState("Standard");
  const [subStart, setSubStart] = useState("");
  const [subEnd, setSubEnd] = useState("");
  const [paymentSchedule, setPaymentSchedule] = useState("every_30_days");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const billingPlans = subscriptionPlans.length > 0 ? subscriptionPlans : DEFAULT_SUBSCRIPTION_PLANS;
  const selectedOwedAmount = getSubscriptionOwedAmount(billingPlans, subLevel);
  const categories = useMemo(() => getAvailableStoreCategories(stores), [stores]);
  const filteredStores = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return stores.filter((store) => {
      const storeCategories = splitStoreCategories(store.category);
      const matchesCategory =
        selectedCategory === "All" ||
        storeCategories.some((category) => normalizeStoreCategory(category) === normalizeStoreCategory(selectedCategory));
      const searchableText = [store.name, store.businessName, store.branchName, store.location, store.description, store.category, store.status, store.subscriptionLevel]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesCategory && (!query || searchableText.includes(query));
    }).sort((left, right) => {
      const leftBusiness = String(left.businessName || left.name || "");
      const rightBusiness = String(right.businessName || right.name || "");
      return leftBusiness.localeCompare(rightBusiness) ||
        String(left.branchName || "Main").localeCompare(String(right.branchName || "Main"));
    });
  }, [searchQuery, selectedCategory, stores]);
  const hasActiveFilters = Boolean(searchQuery.trim()) || selectedCategory !== "All";

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCategory("All");
  };

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
    if (!validateStrongPassword(ownerPassword, { name: ownerName, email: ownerEmail }).valid) {
      alert("Use a strong password that meets every requirement.");
      return;
    }
    setIsSubmitting(true);
    try {
      const logoUrl = pendingLogo
        ? await uploadImageFileToDriveSecure(pendingLogo, {
            owner: storeName || ownerEmail,
            purpose: "admin-store-logo",
          })
        : storeLogo;
      const result = await invokeAdminBackend<{
        store: any;
        owner: { id: string };
        notification?: { sent: boolean; error?: string };
      }>({
        action: "create_store",
        email: ownerEmail,
        password: ownerPassword,
        name: ownerName,
        forcePasswordReset: requirePasswordChange,
        store: {
          name: storeName,
          businessName: storeName,
          branchName: "Main",
          location: storeLocation,
          address: storeLocation,
          description: storeDescription,
          category: storeCategory,
          contact: storeContact,
          website: storeWebsite,
          openingTime: storeOpeningTime,
          closingTime: storeClosingTime,
          hours: formatStoreHours(storeOpeningTime, storeClosingTime),
          openingHours: formatStoreHours(storeOpeningTime, storeClosingTime),
          lat: storeLatitude,
          lng: storeLongitude,
          logoUrl,
          status: "active",
          subscriptionLevel: subLevel,
          owedAmount: selectedOwedAmount,
          subscriptionStart: dateInputToDate(subStart),
          subscriptionEnd: dateInputToDate(subEnd),
          paymentSchedule,
        },
      });

      if (!result.owner?.id || result.store.ownerId !== result.owner.id) {
        throw new Error("The store was not linked to a valid owner account.");
      }

      setStores([...stores, result.store]);
      setShowAddModal(false);
      setStoreName("");
      setStoreLocation("");
      setStoreDescription("");
      setStoreCategory("");
      setStoreContact("");
      setStoreWebsite("");
      setStoreOpeningTime("09:00");
      setStoreClosingTime("21:00");
      setStoreLatitude(7.4478);
      setStoreLongitude(125.8078);
      setStoreLogo("");
      setPendingLogo(null);
      setOwnerEmail("");
      setOwnerName("");
      setOwnerPassword("");
      setRequirePasswordChange(true);
      setSubStart("");
      setSubEnd("");
      setPaymentSchedule("every_30_days");
      if (result.notification && !result.notification.sent) {
        alert(`Store created, but the welcome email could not be sent: ${result.notification.error || "Email service unavailable."}`);
      }
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
    }} onDeleted={(deletedStoreId) => {
      setStores((currentStores) => currentStores.filter((store) => store.id !== deletedStoreId));
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
            {filteredStores.length} {filteredStores.length === 1 ? "store" : "stores"}
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
        <div>
          <div className="border-b border-gray-100 p-5 dark:border-gray-800/50 sm:p-6">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by store name, location, or category..."
                className="w-full rounded-2xl border border-gray-200 bg-white py-3.5 pl-12 pr-4 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-gray-500"
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Categories
              </div>
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  aria-pressed={selectedCategory === category}
                  onClick={() => setSelectedCategory(category)}
                  className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                    selectedCategory === category
                      ? "border-[#1b1b1b] bg-[#1b1b1b] text-white dark:border-white dark:bg-white dark:text-[#1b1b1b]"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                  }`}
                >
                  {category}
                </button>
              ))}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-2 rounded-full border border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                >
                  <X className="h-4 w-4" />
                  Clear filters
                </button>
              )}
            </div>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
            {filteredStores.length > 0 ? filteredStores.map(store => {
              const storeCategories = splitStoreCategories(store.category);
              const businessName = store.businessName || store.name;
              const branchName = store.branchName || "Main";

              return (
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
                        <h4 className="w-full truncate text-xl font-bold tracking-tight text-gray-900 transition-colors group-hover:text-[#1b1b1b] dark:text-white dark:group-hover:text-white sm:w-auto sm:text-lg">{businessName}</h4>
                        <span className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                          {branchName} branch
                        </span>
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
                      {store.name !== businessName && (
                        <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{store.name}</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {storeCategories.length > 0 ? storeCategories.map((category) => (
                          <span key={category} className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
                            {category}
                          </span>
                        )) : (
                          <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
                            Uncategorized
                          </span>
                        )}
                      </div>
                      {store.location && <p className="mt-2 max-w-full truncate text-sm text-gray-500 dark:text-gray-400 sm:text-xs">{store.location}</p>}
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
              );
            }) : (
              <div className="p-16 text-center text-gray-400 flex flex-col items-center">
                <ShieldAlert className="w-16 h-16 mb-4 text-gray-300 dark:text-gray-700" />
                <p className="text-lg font-medium text-gray-500 dark:text-gray-400">Empty Registry</p>
                <p className="text-sm mt-1">No partner stores match your current filters.</p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-5 rounded-full bg-[#1b1b1b] px-5 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-[#1b1b1b]"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 pointer-events-auto">
          <div className="bg-white dark:bg-gray-900 w-full max-w-150 max-h-[90vh] overflow-y-auto rounded-4xl shadow-xl relative border border-gray-100 dark:border-gray-800 transition-colors" onClick={e => e.stopPropagation()}>
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
                  <input type="text" required value={storeLocation} onChange={e => setStoreLocation(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-[#1b1b1b] outline-none" placeholder="123 Main St, City" />
                  <p className="text-xs text-gray-500">Drop the marker by clicking the exact storefront location.</p>
                  <StoreLocationPicker
                    latitude={storeLatitude}
                    longitude={storeLongitude}
                    onChange={(latitude, longitude) => {
                      setStoreLatitude(latitude);
                      setStoreLongitude(longitude);
                    }}
                  />
                  <p className="text-xs text-gray-500">{storeLatitude.toFixed(6)}, {storeLongitude.toFixed(6)}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Description</label>
                  <textarea required rows={3} value={storeDescription} onChange={e => setStoreDescription(e.target.value)} className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white" placeholder="What customers should know about this store" />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Category</label>
                    <CategoryInput
                      required
                      value={storeCategory}
                      onChange={setStoreCategory}
                      suggestions={categories.filter((category) => category !== "All")}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                    <p className="text-xs text-gray-500">Choose an existing category or type a new one. Separate multiple categories with commas.</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Contact Number</label>
                    <input type="tel" required value={storeContact} onChange={e => setStoreContact(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800" placeholder="+63..." />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Website (Optional)</label>
                    <input type="url" value={storeWebsite} onChange={e => setStoreWebsite(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800" placeholder="https://example.com" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Opening Time</label>
                    <TimeInput required value={storeOpeningTime} onChange={setStoreOpeningTime} aria-label="Opening time (Philippine time)" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Closing Time</label>
                    <TimeInput required value={storeClosingTime} onChange={setStoreClosingTime} aria-label="Closing time (Philippine time)" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Logo Image Upload</label>
                  <div className="flex items-center gap-4">
                    {storeLogo ? (
                      <button
                        type="button"
                        onClick={() => pendingLogo && setLogoEditorFile(pendingLogo)}
                        disabled={!pendingLogo}
                        className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-gray-200 disabled:cursor-default"
                        aria-label={pendingLogo ? "Edit selected logo" : "Logo preview"}
                      >
                        <img src={getDisplayImageUrl(storeLogo)} alt="Logo Preview" className="w-full h-full object-cover" />
                        {pendingLogo && (
                          <span className="absolute inset-0 flex scale-95 items-center justify-center bg-black/60 text-xs font-semibold text-white opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100">
                            Edit
                          </span>
                        )}
                      </button>
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-100 text-gray-400">
                       <ImageIcon className="w-5 h-5" />
                      </div>
                    )}
                    <label className="cursor-pointer">
                      <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100">
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
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Payment Schedule</label>
                    <CustomDropdown
                      options={PAYMENT_SCHEDULE_OPTIONS}
                      value={paymentSchedule}
                      onChange={setPaymentSchedule}
                      className="w-full"
                    />
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
                  <TemporaryPasswordField value={ownerPassword} onChange={setOwnerPassword} name={ownerName} email={ownerEmail} />
                </div>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                  <input type="checkbox" checked={requirePasswordChange} onChange={(event) => setRequirePasswordChange(event.target.checked)} className="mt-0.5 h-4 w-4 rounded" />
                  <span>
                    <span className="block text-xs font-semibold text-gray-900 dark:text-white">Require password change on first login</span>
                    <span className="mt-0.5 block text-[11px] text-gray-500 dark:text-gray-400">The owner must create a private password before opening their dashboard.</span>
                  </span>
                </label>
              </div>

              <footer className="sticky bottom-0 z-10 -mx-6 -mb-6 flex justify-end gap-2 border-t border-gray-200 bg-white/95 px-6 py-4 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/95">
                <button type="button" onClick={() => setShowAddModal(false)} className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">Cancel</button>
                <button type="submit" disabled={isSubmitting || !validateStrongPassword(ownerPassword, { name: ownerName, email: ownerEmail }).valid} className="rounded-lg bg-[#1b1b1b] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-50 dark:bg-[#1b1b1b] dark:hover:bg-black">
                  {isSubmitting ? 'Creating...' : 'Create Record'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
      {logoEditorFile && (
        <ImageCropEditor
          file={logoEditorFile}
          onCancel={() => setLogoEditorFile(null)}
          onApply={(file, previewUrl) => {
            if (storeLogo.startsWith("blob:")) URL.revokeObjectURL(storeLogo);
            setPendingLogo(file);
            setStoreLogo(previewUrl);
            setLogoEditorFile(null);
          }}
        />
      )}
    </div>
  );
}
