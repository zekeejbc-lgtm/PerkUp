import React, { lazy, Suspense, useCallback, useState, useEffect } from "react";
import { Routes, Route, Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Store, ShoppingBag, Gift, Users, BadgeCheck, UserCircle, CreditCard, ChevronRight, Building, Menu, ArrowLeft, MessageSquare, Plus, Loader2, RefreshCw, CheckCircle2, XCircle, Clock3 } from "lucide-react";
import { DashboardShellSkeleton, PageSkeleton } from "../components/LoadingSkeleton";

const StoreOwnerInfo = lazy(() => import("./store-owner/StoreOwnerInfo"));
const StoreOwnerProducts = lazy(() => import("./store-owner/StoreOwnerProducts"));
const StoreOwnerPromotions = lazy(() => import("./store-owner/StoreOwnerPromotions"));
const StoreOwnerCustomers = lazy(() => import("./store-owner/StoreOwnerCustomers"));
const StoreOwnerFeedback = lazy(() => import("./store-owner/StoreOwnerFeedback"));
const StoreOwnerStaff = lazy(() => import("./store-owner/StoreOwnerStaff"));
const StoreOwnerAccount = lazy(() => import("./store-owner/StoreOwnerAccount"));
const StoreOwnerSubscription = lazy(() => import("./store-owner/StoreOwnerSubscription"));
import { useAuth } from "../contexts/AuthContext";
import { collection, addDoc, serverTimestamp } from "@/src/lib/dataCompat";
import { db, handleDataError, OperationType } from "../lib/backend";
import { getDisplayImageUrl } from "../lib/imageStorage";
import { StoreLocationPicker } from "../components/StoreLocationPicker";
import { supabase } from "../lib/supabase";

const normalizeDataRows = (rows: { id: string; data: Record<string, unknown> | null }[] | null | undefined) =>
  (rows || []).map((row) => ({ id: row.id, ...(row.data || {}) }));

const requestTimestamp = (request: any) => {
  const value = request.updatedAt || request.reviewedAt || request.createdAt;
  if (value?.seconds) return value.seconds * 1000;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const branchRequestStatus = (status: string) => {
  if (status === "approved") {
    return {
      label: "Approved",
      message: "This branch was approved and added to your account.",
      icon: CheckCircle2,
      className: "border-green-200 bg-green-50 text-green-700 dark:border-green-900/60 dark:bg-green-950/20 dark:text-green-300",
    };
  }
  if (status === "denied") {
    return {
      label: "Denied",
      message: "This branch request was not approved.",
      icon: XCircle,
      className: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300",
    };
  }
  return {
    label: "Pending",
    message: "Awaiting admin review.",
    icon: Clock3,
    className: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300",
  };
};

export default function StoreOwnerDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [stores, setStores] = useState<any[]>([]);
  const [selectedStore, setSelectedStore] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [branchRequests, setBranchRequests] = useState<any[]>([]);
  const [showBranchRequest, setShowBranchRequest] = useState(false);
  const [requestLookupBusy, setRequestLookupBusy] = useState(false);
  const [requestName, setRequestName] = useState("");
  const [requestAddress, setRequestAddress] = useState("");
  const [requestLatitude, setRequestLatitude] = useState(7.4478);
  const [requestLongitude, setRequestLongitude] = useState(125.8078);
  const [requestLocationSelected, setRequestLocationSelected] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState("");
  const isAccountOnlyRoute = location.pathname === '/owner/account' || location.pathname === '/owner/subscription';
  const activeStore = selectedStore;
  const requestedStoreId = searchParams.get("branch");

  const loadOwnerData = useCallback(async (quiet = false) => {
    if (!user) return;
    if (!quiet) setRequestLookupBusy(true);

    try {
      const [storesResult, requestsResult] = await Promise.allSettled([
        supabase
          .from("stores")
          .select("id,data")
          .eq("data->>ownerId", user.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("branch_requests")
          .select("id,data,updated_at")
          .eq("data->>ownerId", user.id)
          .order("updated_at", { ascending: false }),
      ]);

      if (storesResult.status === "rejected") throw storesResult.reason;
      if (storesResult.value.error) throw storesResult.value.error;
      setStores(normalizeDataRows(storesResult.value.data as any));

      if (requestsResult.status === "fulfilled" && !requestsResult.value.error) {
        setBranchRequests(normalizeDataRows(requestsResult.value.data as any));
      } else {
        const requestError = requestsResult.status === "rejected" ? requestsResult.reason : requestsResult.value.error;
        console.warn("Branch requests are unavailable until the database migration is deployed.", requestError);
        setBranchRequests([]);
      }
    } catch (error) {
      handleDataError(error, OperationType.LIST, "stores");
    } finally {
      setLoading(false);
      setRequestLookupBusy(false);
    }
  }, [user]);

  useEffect(() => {
    loadOwnerData(true);
  }, [loadOwnerData]);

  useEffect(() => {
    if (!user) return;
    const refreshId = window.setInterval(() => loadOwnerData(true), 10000);
    return () => window.clearInterval(refreshId);
  }, [loadOwnerData, user]);

  useEffect(() => {
    if (requestedStoreId && stores.length > 0) {
      setSelectedStore(stores.find((store) => store.id === requestedStoreId) || null);
    }
  }, [requestedStoreId, stores]);

  const selectStore = (store: any | null) => {
    setSelectedStore(store);
    const nextParams = new URLSearchParams(searchParams);
    if (store) nextParams.set("branch", store.id);
    else nextParams.delete("branch");
    setSearchParams(nextParams);
  };
  const goToBranches = () => {
    setSelectedStore(null);
    navigate('/owner');
  };
  const branchLimit = Math.max(1, Number(user?.branchLimit || 1));
  const remainingBranchSlots = Math.max(0, branchLimit - stores.length);
  const pendingBranchRequest = branchRequests.find((request) => request.status === "pending");
  const visibleBranchRequests = [...branchRequests]
    .sort((a, b) => requestTimestamp(b) - requestTimestamp(a))
    .slice(0, 3);

  const submitBranchRequest = async () => {
    if (!user || !requestName.trim() || !requestAddress.trim() || !requestLocationSelected || remainingBranchSlots < 1 || pendingBranchRequest) return;
    setRequestBusy(true);
    setRequestError("");
    try {
      const requestRef = await addDoc(collection(db, "branch_requests"), {
        ownerId: user.id,
        ownerName: user.name,
        ownerEmail: user.email,
        branchName: requestName.trim(),
        address: requestAddress.trim(),
        lat: requestLatitude,
        lng: requestLongitude,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setBranchRequests([...branchRequests, {
        id: requestRef.id,
        ownerId: user.id,
        branchName: requestName.trim(),
        address: requestAddress.trim(),
        status: "pending",
      }]);
      setRequestName("");
      setRequestAddress("");
      setRequestLocationSelected(false);
      setShowBranchRequest(false);
      await loadOwnerData(true);
    } catch (error) {
      setRequestError((error as Error).message);
    } finally {
      setRequestBusy(false);
    }
  };

  const navigation = [
    { name: 'Store Info', href: '/owner', icon: Store, requiresBranch: true },
    { name: 'Products', href: '/owner/products', icon: ShoppingBag, requiresBranch: true },
    { name: 'Promotions', href: '/owner/promotions', icon: Gift, requiresBranch: true },
    { name: 'Customers', href: '/owner/customers', icon: Users, requiresBranch: true },
    { name: 'Reviews', href: '/owner/feedback', icon: MessageSquare, requiresBranch: true },
    { name: 'Staff', href: '/owner/staff', icon: BadgeCheck, requiresBranch: true },
    { name: 'Account', href: '/owner/account', icon: UserCircle, requiresBranch: false },
    { name: 'Subscription', href: '/owner/subscription', icon: CreditCard, requiresBranch: false },
  ];
  const visibleNavigation = navigation.filter((item) => activeStore || !item.requiresBranch);
  const fallbackVariant =
    location.pathname === '/owner/products' ? 'products' :
    location.pathname === '/owner/promotions' ? 'promotions' :
    location.pathname === '/owner/customers' ? 'table' :
    location.pathname === '/owner/feedback' ? 'feedback' :
    location.pathname === '/owner/staff' ? 'table' :
    location.pathname === '/owner/subscription' ? 'subscriptions' :
    'form';

  if (loading) {
    return <DashboardShellSkeleton navigationItems={9} />;
  }

  // Branch Selector View
  if (!activeStore && !isAccountOnlyRoute) {
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Your Branches</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-2">Select a branch assigned by an admin to manage its information, products, promotions, and feedback.</p>
          <p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            {stores.length} of {branchLimit} branches used · {remainingBranchSlots} available
          </p>
        </div>

        {stores.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 p-12 rounded-[2rem] border border-dashed border-gray-300 dark:border-gray-700 text-center flex flex-col items-center">
            <Store className="w-16 h-16 text-gray-400 dark:text-gray-500 mb-6" />
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No branches assigned</h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-sm mb-8">Request a branch below. An admin must confirm it before it is added to your account.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {stores.map((store) => {
              const logoUrl = getDisplayImageUrl(store.logoUrl || "");

              return (
                <button
                  key={store.id}
                  onClick={() => selectStore(store)}
                  className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 text-left hover:border-[#1b1b1b] dark:hover:border-white hover:shadow-lg transition-all group relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gray-100 dark:bg-[#1b1b1b]/10 rounded-bl-full -z-10 transition-transform group-hover:scale-110" />
                  <div className="w-12 h-12 overflow-hidden bg-gray-100 dark:bg-white/15 rounded-2xl flex items-center justify-center mb-6 border border-gray-200 dark:border-white/10">
                    {logoUrl ? (
                      <img src={logoUrl} alt={`${store.name || "Branch"} logo`} className="h-full w-full object-cover" />
                    ) : (
                      <Building className="w-6 h-6 text-[#1b1b1b] dark:text-white" />
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{store.name || 'Unnamed Branch'}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-6">{store.address || 'No address set'}</p>
                  <div className="flex items-center text-sm font-semibold text-[#1b1b1b] dark:text-white">
                    Manage Branch <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <div className="rounded-3xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">Request another branch</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {pendingBranchRequest
                  ? `Your request for ${pendingBranchRequest.branchName} is awaiting admin review.`
                  : remainingBranchSlots > 0
                    ? `You can request ${remainingBranchSlots} more ${remainingBranchSlots === 1 ? "branch" : "branches"}.`
                    : "You have used all branch slots. Contact an admin to increase your limit."}
              </p>
            </div>
            <button type="button" disabled={remainingBranchSlots < 1 || Boolean(pendingBranchRequest)} onClick={() => setShowBranchRequest(!showBranchRequest)} className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-900">
              <Plus className="h-4 w-4" /> Request a branch
            </button>
            <button type="button" disabled={requestLookupBusy} onClick={() => loadOwnerData()} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
              <RefreshCw className={`h-4 w-4 ${requestLookupBusy ? "animate-spin" : ""}`} /> Check status
            </button>
          </div>
          {visibleBranchRequests.length > 0 && (
            <div className="mt-5 space-y-3">
              {visibleBranchRequests.map((request) => {
                const status = branchRequestStatus(String(request.status || "pending"));
                const StatusIcon = status.icon;
                return (
                  <div key={request.id} className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/40 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{request.branchName || "Branch request"}</p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{request.address || "No address provided"}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{status.message}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${status.className}`}>
                      <StatusIcon className="h-3.5 w-3.5" /> {status.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {showBranchRequest && (
            <div className="mt-6 space-y-4 border-t border-gray-200 pt-6 dark:border-gray-800">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">Branch label
                  <input value={requestName} onChange={(event) => setRequestName(event.target.value)} placeholder="e.g. Tagum" className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 font-normal text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                </label>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">Branch address
                  <input value={requestAddress} onChange={(event) => setRequestAddress(event.target.value)} placeholder="Street, barangay, city" className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 font-normal text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                </label>
              </div>
              <div>
                <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">Click the map to set the exact branch location.</p>
                <StoreLocationPicker latitude={requestLatitude} longitude={requestLongitude} onChange={(latitude, longitude) => {
                  setRequestLatitude(latitude);
                  setRequestLongitude(longitude);
                  setRequestLocationSelected(true);
                }} />
              </div>
              {requestError && <p className="text-sm text-red-600">{requestError}</p>}
              <div className="flex justify-end gap-3">
                <button type="button" disabled={requestBusy} onClick={() => setShowBranchRequest(false)} className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold dark:bg-gray-800">Cancel</button>
                <button type="button" disabled={requestBusy || !requestName.trim() || !requestAddress.trim() || !requestLocationSelected} onClick={submitBranchRequest} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  {requestBusy && <Loader2 className="h-4 w-4 animate-spin" />} Submit request
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-8 pb-24 md:pb-0 w-full relative">
      {/* Desktop Sidebar Navigation */}
      <aside className={`hidden md:flex flex-col shrink-0 sticky top-24 h-max z-10 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-64' : 'w-20'} space-y-4`}>
        <div className={`flex items-center ${isSidebarOpen ? 'justify-between' : 'justify-center'} mb-2`}>
            {isSidebarOpen && <span className="font-bold text-gray-900 dark:text-white px-2 text-xs tracking-widest uppercase">Navigation</span>}
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
               <Menu className="w-5 h-5" />
            </button>
        </div>

        {activeStore && (
          <div className="hidden md:block overflow-hidden transition-all duration-300">
            {isSidebarOpen ? (
              <div className="w-full px-4 py-3 bg-gray-100 dark:bg-white/10 border-gray-300 dark:border-white/15 rounded-2xl border">
                <p className="text-xs font-semibold text-[#1b1b1b] dark:text-white uppercase tracking-widest mb-1">Current Branch</p>
                <p className="font-bold text-gray-900 dark:text-white truncate">{activeStore.name}</p>
                <button
                    type="button"
                    onClick={goToBranches}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#1b1b1b] dark:text-white hover:text-black dark:hover:text-white"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to branches
                  </button>
              </div>
            ) : (
              <button
                onClick={goToBranches}
                title={`Branch: ${activeStore.name}`}
                className="w-full flex items-center justify-center p-3 bg-gray-100 dark:bg-white/10 border-gray-300 dark:border-white/15 rounded-2xl border hover:bg-gray-100 dark:hover:bg-white/15 cursor-pointer"
              >
                {activeStore.logoUrl ? (
                  <img src={getDisplayImageUrl(activeStore.logoUrl)} alt={`${activeStore.name || "Branch"} logo`} className="h-8 w-8 rounded-xl object-cover" />
                ) : (
                  <Building className="w-6 h-6 text-[#1b1b1b] dark:text-white" />
                )}
              </button>
            )}
          </div>
        )}

        <nav className="flex flex-col gap-2">
          {visibleNavigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={activeStore ? `${item.href}?branch=${encodeURIComponent(activeStore.id)}` : item.href}
                title={!isSidebarOpen ? item.name : undefined}
                className={`flex items-center ${isSidebarOpen ? 'gap-3 px-4' : 'justify-center'} py-3 rounded-2xl text-sm font-medium transition-all whitespace-nowrap overflow-hidden group ${
                  isActive
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-md scale-[1.02]'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white hover:shadow-sm'
                }`}
              >
                <item.icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-current' : 'text-gray-400 group-hover:text-gray-500'}`} />
                {isSidebarOpen && <span className="truncate outline-none transition-opacity duration-300">{item.name}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 dark:bg-[#1b1b1b]/90 backdrop-blur-xl border-t border-gray-200 dark:border-gray-800 flex items-center justify-start sm:justify-center overflow-x-auto pb-[env(safe-area-inset-bottom)] px-2 py-2 shadow-[0_-10px_40px_-20px_rgba(0,0,0,0.1)] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] gap-2 sm:gap-6">
        {visibleNavigation.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={activeStore ? `${item.href}?branch=${encodeURIComponent(activeStore.id)}` : item.href}
              className={`flex flex-col items-center gap-1 min-w-[4rem] px-3 py-1.5 rounded-xl transition-all shrink-0 ${
                isActive
                  ? 'text-[#1b1b1b] dark:text-white bg-gray-100 dark:bg-white/10'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <item.icon className={`w-5 h-5 mb-0.5 ${isActive ? 'fill-[#1b1b1b]/20' : ''}`} />
              <span className="text-[10px] font-bold tracking-tight">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-200 dark:border-gray-800 p-4 sm:p-6 md:p-8 shadow-sm">
        {(activeStore || isAccountOnlyRoute) && (
          <button
            type="button"
            onClick={goToBranches}
            className={`mb-5 items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 ${
              isAccountOnlyRoute && !activeStore ? 'inline-flex' : 'inline-flex md:hidden'
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to branches
          </button>
        )}
        <Suspense fallback={<PageSkeleton variant={fallbackVariant} />}>
          <Routes>
            <Route path="/" element={<StoreOwnerInfo store={activeStore} setStore={(updatedStore: any) => {
              setSelectedStore(updatedStore);
              setStores(stores.map(s => s.id === updatedStore.id ? updatedStore : s));
            }} />} />
            <Route path="/products" element={<StoreOwnerProducts store={activeStore} />} />
            <Route path="/promotions" element={<StoreOwnerPromotions store={activeStore} />} />
            <Route path="/customers" element={<StoreOwnerCustomers store={activeStore} />} />
            <Route path="/feedback" element={<StoreOwnerFeedback store={activeStore} />} />
            <Route path="/staff" element={<StoreOwnerStaff store={activeStore} />} />
            <Route path="/account" element={<StoreOwnerAccount />} />
            <Route path="/subscription" element={<StoreOwnerSubscription stores={stores} />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}
