import React, { lazy, Suspense, useState, useEffect } from "react";
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Store, ShoppingBag, Gift, Users, BadgeCheck, UserCircle, CreditCard, ChevronRight, Building, Menu, ArrowLeft, MessageSquare } from "lucide-react";
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
import { query, where, getDocs, collection } from "@/src/lib/dataCompat";
import { db, handleDataError, OperationType } from "../lib/backend";

export default function StoreOwnerDashboard() {
  const location = useLocation();
  const { user } = useAuth();
  const [stores, setStores] = useState<any[]>([]);
  const [selectedStore, setSelectedStore] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const isAccountOnlyRoute = location.pathname === '/owner/account' || location.pathname === '/owner/subscription';
  const activeStore = isAccountOnlyRoute ? null : selectedStore;

  useEffect(() => {
    async function fetchStores() {
      if (!user) return;
      try {
        const q = query(collection(db, "stores"), where("ownerId", "==", user.id));
        const snap = await getDocs(q);
        const fetchedStores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setStores(fetchedStores);
      } catch (error) {
        handleDataError(error, OperationType.LIST, "stores");
      } finally {
        setLoading(false);
      }
    }
    fetchStores();
  }, [user]);

  useEffect(() => {
    if (isAccountOnlyRoute) {
      setSelectedStore(null);
    }
  }, [isAccountOnlyRoute]);

  const navigation = [
    { name: 'Store Info', href: '/owner', icon: Store, requiresBranch: true },
    { name: 'Products', href: '/owner/products', icon: ShoppingBag, requiresBranch: true },
    { name: 'Promotions', href: '/owner/promotions', icon: Gift, requiresBranch: true },
    { name: 'Customers', href: '/owner/customers', icon: Users, requiresBranch: true },
    { name: 'Feedback', href: '/owner/feedback', icon: MessageSquare, requiresBranch: true },
    { name: 'Staff', href: '/owner/staff', icon: BadgeCheck, requiresBranch: true },
    { name: 'Account', href: '/owner/account', icon: UserCircle, requiresBranch: false },
    { name: 'Subscription', href: '/owner/subscription', icon: CreditCard, requiresBranch: false },
  ];
  const visibleNavigation = navigation.filter((item) => activeStore || !item.requiresBranch);

  if (loading) {
    return <DashboardShellSkeleton />;
  }

  // Branch Selector View
  if (!activeStore && !isAccountOnlyRoute) {
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Your Branches</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-2">Select a branch assigned by an admin to manage its information, products, promotions, and feedback.</p>
        </div>

        {stores.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 p-12 rounded-[2rem] border border-dashed border-gray-300 dark:border-gray-700 text-center flex flex-col items-center">
            <Store className="w-16 h-16 text-gray-400 mb-6" />
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No branches assigned</h3>
            <p className="text-gray-500 max-w-sm mb-8">Only admins can add branches. Ask an admin to assign one to your account.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {stores.map((store) => (
              <button
                key={store.id}
                onClick={() => setSelectedStore(store)}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 text-left hover:border-[#1b1b1b] dark:hover:border-[#1b1b1b] hover:shadow-lg transition-all group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-gray-100 dark:bg-[#1b1b1b]/10 rounded-bl-full -z-10 transition-transform group-hover:scale-110" />
                <div className="w-12 h-12 bg-gray-100 dark:bg-white/15 rounded-2xl flex items-center justify-center mb-6">
                  <Building className="w-6 h-6 text-[#1b1b1b] dark:text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{store.name || 'Unnamed Branch'}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-6">{store.address || 'No address set'}</p>
                <div className="flex items-center text-sm font-semibold text-[#1b1b1b] dark:text-white">
                  Manage Branch <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            ))}
          </div>
        )}
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
                {stores.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSelectedStore(null)}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#1b1b1b] dark:text-white hover:text-black dark:hover:text-white"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to branches
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => {
                  if (stores.length > 1) setSelectedStore(null);
                }}
                title={`Branch: ${activeStore.name}`}
                className={`w-full flex items-center justify-center p-3 bg-gray-100 dark:bg-white/10 border-gray-300 dark:border-white/15 rounded-2xl border ${stores.length > 1 ? 'hover:bg-gray-100 dark:hover:bg-white/15 cursor-pointer' : 'cursor-default'}`}
              >
                <Building className="w-6 h-6 text-[#1b1b1b] dark:text-white" />
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
                to={item.href}
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
              to={item.href}
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
        {activeStore && stores.length > 1 && (
          <button
            type="button"
            onClick={() => setSelectedStore(null)}
            className="mb-5 inline-flex md:hidden items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to branches
          </button>
        )}
        <Suspense fallback={<PageSkeleton />}>
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
            <Route path="/subscription" element={<StoreOwnerSubscription />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}
