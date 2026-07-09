import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { lazy, Suspense, useState } from "react";
import { QrCode, Map, CreditCard, Gift, User as UserIcon, Menu, Ticket } from "lucide-react";
import { PageSkeleton } from "../components/LoadingSkeleton";

const CustomerOverview = lazy(() => import("./customer/CustomerOverview"));
const CustomerProfile = lazy(() => import("./customer/CustomerProfile"));
const CustomerStores = lazy(() => import("./customer/CustomerStores"));
const CustomerCards = lazy(() => import("./customer/CustomerCards"));
const CustomerPromotions = lazy(() => import("./customer/CustomerPromotions"));
const CustomerTickets = lazy(() => import("./customer/CustomerTickets"));

export default function CustomerDashboard() {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const navigation = [
    { name: 'Overview', href: '/customer', icon: QrCode },
    { name: 'My Cards', href: '/customer/cards', icon: CreditCard },
    { name: 'Stores & Maps', href: '/customer/stores', icon: Map },
    { name: 'Promotions', href: '/customer/promotions', icon: Gift },
    { name: 'My Tickets', href: '/customer/tickets', icon: Ticket },
    { name: 'Profile', href: '/customer/profile', icon: UserIcon },
  ];

  const isActive = (href: string) => {
    if (href === '/customer') return location.pathname === '/customer';
    return location.pathname.startsWith(href);
  };

  const fallbackVariant =
    location.pathname === '/customer/cards' ? 'cards' :
    location.pathname === '/customer/stores' ? 'map-list' :
    location.pathname === '/customer/promotions' ? 'promotions' :
    location.pathname === '/customer/tickets' ? 'tickets' :
    location.pathname === '/customer/profile' ? 'form' :
    'overview';

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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 dark:bg-[#1b1b1b]/90 backdrop-blur-xl border-t border-gray-200 dark:border-gray-800 flex items-center justify-start sm:justify-center overflow-x-auto pb-[env(safe-area-inset-bottom)] px-2 py-2 shadow-[0_-10px_40px_-20px_rgba(0,0,0,0.1)] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] gap-2 sm:gap-6">
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
      <div className="flex-1 min-w-0">
        <Suspense fallback={<PageSkeleton variant={fallbackVariant} />}>
          <Routes>
            <Route path="/" element={<CustomerOverview />} />
            <Route path="/cards" element={<CustomerCards />} />
            <Route path="/stores" element={<CustomerStores />} />
            <Route path="/promotions" element={<CustomerPromotions />} />
            <Route path="/tickets" element={<CustomerTickets />} />
            <Route path="/profile" element={<CustomerProfile />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}
