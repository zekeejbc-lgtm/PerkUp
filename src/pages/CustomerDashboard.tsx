import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { QrCode, Map, CreditCard, Gift, User as UserIcon, Menu, Ticket } from "lucide-react";
import { PageSkeleton } from "../components/LoadingSkeleton";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/ToastProvider";
import { MobileDashboardNavigation } from "../components/MobileDashboardNavigation";

const CustomerOverview = lazy(() => import("./customer/CustomerOverview"));
const CustomerProfile = lazy(() => import("./customer/CustomerProfile"));
const CustomerStores = lazy(() => import("./customer/CustomerStores"));
const CustomerCards = lazy(() => import("./customer/CustomerCards"));
const CustomerPromotions = lazy(() => import("./customer/CustomerPromotions"));
const CustomerTickets = lazy(() => import("./customer/CustomerTickets"));

type CustomerScanEvent = {
  customerId?: string;
  staffName?: string;
  storeName?: string;
  points?: number | string;
};

function CustomerScanNotifications() {
  const { user } = useAuth();
  const toast = useToast();
  const notifiedTicketIds = useRef(new Set<string>());

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`customer-scan-notifications-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "promotions_scanned" },
        (payload) => {
          const row = payload.new as { id?: string; data?: CustomerScanEvent };
          const ticketId = String(row.id || "");
          const scan = row.data;
          if (!scan || scan.customerId !== user.id || !ticketId || notifiedTicketIds.current.has(ticketId)) return;

          notifiedTicketIds.current.add(ticketId);
          const staffName = String(scan.staffName || "Store staff");
          const storeName = String(scan.storeName || "the store");
          const points = Number(scan.points || 0);
          const creditMessage = points > 0
            ? ` You received ${points} stamp${points === 1 ? "" : "s"}.`
            : "";
          toast.success(`${staffName} scanned your QR at ${storeName}.${creditMessage}`, {
            title: "Scan successful",
            duration: 7000,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [toast, user?.id]);

  return null;
}

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
    location.pathname.startsWith('/customer/cards') ? 'cards' :
    location.pathname === '/customer/stores' ? 'map-list' :
    location.pathname.startsWith('/customer/promotions') ? 'promotions' :
    location.pathname.startsWith('/customer/tickets') ? 'tickets' :
    location.pathname === '/customer/profile' ? 'form' :
    'overview';

  return (
    <div className="flex flex-col md:flex-row gap-8 pb-24 md:pb-0 w-full relative">
      <CustomerScanNotifications />
      {/* Desktop Sidebar Navigation */}
      <aside className={`hidden md:flex flex-col shrink-0 sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain z-10 transition-all duration-300 ease-in-out [scrollbar-gutter:stable] ${isSidebarOpen ? 'w-64' : 'w-20'} space-y-4`}>
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

      <MobileDashboardNavigation
        accessLabel="Customer access"
        items={navigation.map((item) => ({
          id: item.href,
          label: item.name,
          shortLabel:
            item.name === "Stores & Maps" ? "Stores" :
            item.name === "My Tickets" ? "Tickets" :
            item.name === "My Cards" ? "Cards" :
            item.name,
          icon: item.icon,
          active: isActive(item.href),
          to: item.href,
        }))}
      />

      {/* Main Content Area */}
      <div className="flex-1 min-w-0">
        <Suspense fallback={<PageSkeleton variant={fallbackVariant} />}>
          <Routes>
            <Route path="/" element={<CustomerOverview />} />
            <Route path="/cards" element={<CustomerCards />} />
            <Route path="/cards/:storeId" element={<CustomerCards />} />
            <Route path="/stores" element={<CustomerStores />} />
            <Route path="/promotions" element={<CustomerPromotions />} />
            <Route path="/promotions/:storeId" element={<CustomerPromotions />} />
            <Route path="/tickets" element={<CustomerTickets />} />
            <Route path="/tickets/:storeId" element={<CustomerTickets />} />
            <Route path="/profile" element={<CustomerProfile />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}
