import { Routes, Route, Link, useLocation } from "react-router-dom";
import { Store, Gift, Users, UserCircle, Menu, QrCode } from "lucide-react";
import { lazy, Suspense, useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { doc, getDocFromServer } from "@/src/lib/dataCompat";
import { db } from "../lib/backend";
import { getEffectiveSubscriptionStatus, isAccountSuspended } from "../lib/subscriptionAccess";
import { AccountSuspendedScreen, SubscriptionAccessBanner, SubscriptionFrozenScreen } from "../components/SubscriptionAccessGate";

import { DashboardShellSkeleton, PageSkeleton } from "../components/LoadingSkeleton";

const StaffStore = lazy(() => import("./staff/StaffStore"));
const StaffScanner = lazy(() => import("./staff/StaffScanner"));
const StaffPromotions = lazy(() => import("./staff/StaffPromotions"));
const StaffPromotionScan = lazy(() => import("./staff/StaffPromotionScan"));
const StaffCustomers = lazy(() => import("./staff/StaffCustomers"));
const StaffAccount = lazy(() => import("./staff/StaffAccount"));

export default function StaffDashboard() {
  const location = useLocation();
  const { user } = useAuth();
  const [store, setStore] = useState<any>(null);
  const [subscriptionStore, setSubscriptionStore] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    async function loadAssignment() {
      let activeStoreId = user?.storeId;

      if (!activeStoreId) {
        setLoading(false);
        return;
      }
      try {
        const storeRef = doc(db, "stores", activeStoreId);
        const storeSnap = await getDocFromServer(storeRef);
        if (storeSnap.exists()) {
          const assignedStore = { id: storeSnap.id, ...storeSnap.data() };
          setStore(assignedStore);
          const primaryStoreId = assignedStore.parentStoreId || assignedStore.id;
          const primarySnap = primaryStoreId === assignedStore.id
            ? storeSnap
            : await getDocFromServer(doc(db, "stores", primaryStoreId));
          setSubscriptionStore(primarySnap.exists() ? { id: primarySnap.id, ...primarySnap.data() } : assignedStore);
        }
      } catch (err) {
        console.error("Failed to load store assignment", err);
        setStore(null);
        setSubscriptionStore(null);
      } finally {
        setLoading(false);
      }
    }
    loadAssignment();
    const refreshId = window.setInterval(loadAssignment, 15_000);
    return () => window.clearInterval(refreshId);
  }, [user]);

  const navigation = [
    { name: 'Store', href: '/staff', icon: Store },
    { name: 'Scanner', href: '/staff/scanner', icon: QrCode },
    { name: 'Promotions', href: '/staff/promotions', icon: Gift },
    { name: 'Customers', href: '/staff/customers', icon: Users },
    { name: 'Account', href: '/staff/account', icon: UserCircle },
  ];

  const fallbackVariant =
    location.pathname === '/staff/scanner' ? 'scanner' :
    location.pathname.startsWith('/staff/promotions/') ? 'scanner' :
    location.pathname === '/staff/promotions' ? 'promotions' :
    location.pathname === '/staff/customers' ? 'table' :
    location.pathname === '/staff/account' ? 'form' :
    'form';

  if (loading) {
    return <DashboardShellSkeleton navigationItems={5}><PageSkeleton variant={fallbackVariant} /></DashboardShellSkeleton>;
  }

  if (subscriptionStore && isAccountSuspended(subscriptionStore.accountRestriction)) {
    return <AccountSuspendedScreen store={subscriptionStore} role="staff" />;
  }

  if (subscriptionStore && getEffectiveSubscriptionStatus(subscriptionStore.subscriptionAccess, new Date(), subscriptionStore.subscriptionEnd) === "frozen") {
    return <SubscriptionFrozenScreen store={subscriptionStore} role="staff" />;
  }

  if (!store && location.pathname !== '/staff/account') {
    return (
      <div className="max-w-2xl mx-auto space-y-6 text-center py-12">
        <div className="bg-white dark:bg-gray-900 p-8 rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800">
          <Store className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-2">No Store Assigned</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">You have not been assigned to a store yet. Please contact your store owner.</p>
          <Link to="/staff/account" className="inline-flex items-center justify-center px-4 py-2 bg-[#1b1b1b] text-white rounded-xl font-medium hover:bg-black transition">
            Go to Account Settings
          </Link>
        </div>
      </div>
    );
  }

  // To check active route considering sub-routes
  const isActive = (href: string) => {
    if (href === '/staff' && location.pathname === '/staff') return true;
    if (href !== '/staff' && location.pathname.startsWith(href)) return true;
    return false;
  };

  return (
    <>
    {subscriptionStore && <SubscriptionAccessBanner store={subscriptionStore} role="staff" />}
    <div className="flex flex-col md:flex-row gap-8 pb-24 md:pb-0 w-full relative">
      {/* Desktop Sidebar Navigation */}
      <aside className={`hidden md:flex flex-col shrink-0 sticky top-24 h-max z-10 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-64' : 'w-20'} space-y-4`}>
        <div className={`flex items-center ${isSidebarOpen ? 'justify-between' : 'justify-center'} mb-2`}>
            {isSidebarOpen && <span className="font-bold text-gray-900 dark:text-white px-2 text-xs tracking-widest uppercase">Navigation</span>}
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
               <Menu className="w-5 h-5" />
            </button>
        </div>

        {store && (
          <div className="hidden md:block overflow-hidden transition-all duration-300 mb-2">
            <div className={`w-full text-left px-4 py-3 bg-gray-100 dark:bg-white/10 border-gray-300 dark:border-white/15 rounded-2xl border flex items-center justify-center`}>
               {!isSidebarOpen ? (
                 <Store className="w-6 h-6 text-[#1b1b1b] dark:text-white" />
               ) : (
                 <div className="w-full">
                    <p className="text-[10px] font-bold text-[#1b1b1b] dark:text-white uppercase tracking-widest mb-0.5">Assigned Store</p>
                    <p className="font-bold text-gray-900 dark:text-white truncate text-sm">{store.name}</p>
                 </div>
               )}
            </div>
          </div>
        )}

        <nav className="flex flex-col gap-2">
          {navigation.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                to={item.href}
                title={!isSidebarOpen ? item.name : undefined}
                className={`flex items-center ${isSidebarOpen ? 'gap-3 px-4' : 'justify-center'} py-3 rounded-2xl text-sm font-medium transition-all whitespace-nowrap overflow-hidden group ${
                  active
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-md scale-[1.02]'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white hover:shadow-sm'
                }`}
              >
                <item.icon className={`w-5 h-5 shrink-0 ${active ? 'text-current' : 'text-gray-400 group-hover:text-gray-500'}`} />
                {isSidebarOpen && <span className="truncate outline-none transition-opacity duration-300">{item.name}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 dark:bg-[#1b1b1b]/90 backdrop-blur-xl border-t border-gray-200 dark:border-gray-800 flex items-center justify-start sm:justify-center overflow-x-auto pb-[env(safe-area-inset-bottom)] px-2 py-2 shadow-[0_-10px_40px_-20px_rgba(0,0,0,0.1)] gap-2 sm:gap-6">
        {navigation.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.name}
              to={item.href}
              className={`flex flex-col items-center gap-1 min-w-[4rem] px-3 py-1.5 rounded-xl transition-all shrink-0 ${
                active
                  ? 'text-[#1b1b1b] dark:text-white bg-gray-100 dark:bg-white/10'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <item.icon className={`w-5 h-5 mb-0.5 ${active ? 'fill-[#1b1b1b]/20' : ''}`} />
              <span className="text-[10px] font-bold tracking-tight">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-200 dark:border-gray-800 p-4 sm:p-6 md:p-8 shadow-sm">
        <Suspense fallback={<PageSkeleton variant={fallbackVariant} />}>
          <Routes>
            <Route path="/" element={<StaffStore store={store} />} />
            <Route path="/scanner" element={<StaffScanner store={store} />} />
            <Route path="/promotions" element={<StaffPromotions store={store} />} />
            <Route path="/promotions/:id" element={<StaffPromotionScan store={store} />} />
            <Route path="/customers" element={<StaffCustomers store={store} />} />
            <Route path="/account" element={<StaffAccount />} />
          </Routes>
        </Suspense>
      </div>
    </div>
    </>
  );
}
