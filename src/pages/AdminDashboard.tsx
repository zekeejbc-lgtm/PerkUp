import React, { lazy, Suspense, useState } from "react";
import { Store, FileText, Layout, CreditCard, Menu, UserCircle, Scale } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { PageSkeleton } from "../components/LoadingSkeleton";
import { useAuth } from "../contexts/AuthContext";

const AdminStores = lazy(() => import("./admin/AdminStores"));
const AdminApplications = lazy(() => import("./admin/AdminApplications"));
const AdminAccount = lazy(() => import("./admin/AdminAccount"));
const AdminHomepage = lazy(() => import("./admin/AdminHomepage"));
const AdminSubscriptions = lazy(() => import("./admin/AdminSubscriptions"));
const AdminLegalPages = lazy(() => import("./admin/AdminLegalPages"));

export default function AdminDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const isAccountPage = location.pathname === '/admin/account';
  const requestedTab = new URLSearchParams(location.search).get('tab');
  const activeTab =
    requestedTab === 'applications' ||
    requestedTab === 'homepage' ||
    requestedTab === 'subscriptions' ||
    (requestedTab === 'legal' && (user?.role === 'admin' || user?.role === 'assistant_admin'))
      ? requestedTab
      : 'stores';

  const handleNavClick = (item: typeof navigation[number]) => {
    if (item.id === 'account') {
      navigate('/admin/account');
      return;
    }

    navigate(`/admin?tab=${item.id}`);
  };

  const navigation = [
    { id: 'stores', label: 'Partner Stores', icon: Store },
    { id: 'applications', label: 'Applications', icon: FileText },
    { id: 'homepage', label: 'Edit Homepage', icon: Layout },
    ...((user?.role === "admin" || user?.role === "assistant_admin")
      ? [{ id: 'legal' as const, label: 'Edit Legal Pages', icon: Scale }]
      : []),
    { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
    { id: 'account', label: 'Account', icon: UserCircle },
  ] as const;

  const isActive = (item: typeof navigation[number]) => {
    if (item.id === 'account') return isAccountPage;
    return !isAccountPage && activeTab === item.id;
  };

  return (
    <div className="flex flex-col md:flex-row gap-8 pb-24 md:pb-0 w-full relative">
      <aside className={`hidden md:flex flex-col shrink-0 sticky top-24 h-max z-10 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-64' : 'w-20'} space-y-4`}>
        <div className={`flex items-center ${isSidebarOpen ? 'justify-between' : 'justify-center'} mb-2`}>
          {isSidebarOpen && <span className="font-bold text-gray-900 dark:text-white px-2 text-xs tracking-widest uppercase">Navigation</span>}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <Menu className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-2">
          {navigation.map((item) => {
            const active = isActive(item);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item)}
                title={!isSidebarOpen ? item.label : undefined}
                className={`flex items-center ${isSidebarOpen ? 'gap-3 px-4' : 'justify-center'} py-3 rounded-2xl text-sm font-medium transition-all whitespace-nowrap overflow-hidden group ${
                  active
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-md scale-[1.02]'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white hover:shadow-sm'
                }`}
              >
                <item.icon className={`w-5 h-5 shrink-0 ${active ? 'text-current' : 'text-gray-400 group-hover:text-gray-500'}`} />
                {isSidebarOpen && <span className="truncate outline-none transition-opacity duration-300">{item.label}</span>}
              </button>
            );
          })}
        </nav>
      </aside>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 dark:bg-[#1b1b1b]/90 backdrop-blur-xl border-t border-gray-200 dark:border-gray-800 flex items-center justify-start sm:justify-center overflow-x-auto pb-[env(safe-area-inset-bottom)] px-2 py-2 shadow-[0_-10px_40px_-20px_rgba(0,0,0,0.1)] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] gap-2 sm:gap-6">
        {navigation.map((item) => {
          const active = isActive(item);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item)}
              className={`flex flex-col items-center gap-1 min-w-[4rem] px-3 py-1.5 rounded-xl transition-all shrink-0 ${
                active
                  ? 'text-[#1b1b1b] dark:text-white bg-gray-100 dark:bg-white/10'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
              }`}
            >
              <item.icon className={`w-5 h-5 mb-0.5 ${active ? 'fill-[#1b1b1b]/20' : ''}`} />
              <span className="text-[10px] font-bold tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex-1 min-w-0 bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-200 dark:border-gray-800 p-4 sm:p-6 md:p-8 shadow-sm transition-colors">
        <Suspense fallback={<PageSkeleton variant="table" />}>
          {isAccountPage ? (
            <AdminAccount />
          ) : (
            <>
              {activeTab === 'stores' && <AdminStores />}
              {activeTab === 'applications' && <AdminApplications />}
              {activeTab === 'homepage' && <AdminHomepage />}
              {activeTab === 'legal' && <AdminLegalPages />}
              {activeTab === 'subscriptions' && <AdminSubscriptions />}
            </>
          )}
        </Suspense>
      </div>
    </div>
  );
}
