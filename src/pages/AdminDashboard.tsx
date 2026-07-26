import React, { lazy, Suspense, useEffect, useState } from "react";
import { Store, FileText, Layout, CreditCard, Menu, UserCircle, Scale, Inbox, ReceiptText, Users, ShieldCheck, ServerCog, FlaskConical, RadioTower, MoreHorizontal, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { PageSkeleton } from "../components/LoadingSkeleton";
import { useAuth } from "../contexts/AuthContext";

const AdminStores = lazy(() => import("./admin/AdminStores"));
const AdminApplications = lazy(() => import("./admin/AdminApplications"));
const AdminAccount = lazy(() => import("./admin/AdminAccount"));
const AdminHomepage = lazy(() => import("./admin/AdminHomepage"));
const AdminSubscriptions = lazy(() => import("./admin/AdminSubscriptions"));
const AdminInvoices = lazy(() => import("./admin/AdminInvoices"));
const AdminAccounts = lazy(() => import("./admin/AdminAccounts"));
const AdminAudit = lazy(() => import("./admin/AdminAudit"));
const AdminSystemHealth = lazy(() => import("./admin/AdminSystemHealth"));
const AdminDemoManagement = lazy(() => import("./admin/AdminDemoManagement"));
const AdminRuntimeControl = lazy(() => import("./admin/AdminRuntimeControl"));
const AdminLegalPages = lazy(() => import("./admin/AdminLegalPages"));
const AdminPublicEngagement = lazy(() => import("./admin/AdminPublicEngagement"));

export default function AdminDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isAccountPage = location.pathname === '/admin/account';
  const requestedTab = new URLSearchParams(location.search).get('tab');
  const isDemoAdmin = user?.role === "admin" && user?.isDemo === true;
  
  const activeTab =
    isDemoAdmin
      ? requestedTab === 'accounts' ? 'accounts' : 'stores'
      : requestedTab === 'applications' ||
    requestedTab === 'homepage' ||
    requestedTab === 'subscriptions' ||
    requestedTab === 'invoices' ||
    requestedTab === 'accounts' ||
    requestedTab === 'inbox' ||
    requestedTab === 'legal' ||
    (requestedTab === 'demos' && user?.role === 'auditor') ||
    (requestedTab === 'health' && user?.role === 'auditor') ||
    (requestedTab === 'runtime' && user?.role === 'auditor') ||
    (requestedTab === 'audit' && user?.role === 'auditor')
      ? requestedTab
      : 'stores';

  const handleNavClick = (item: typeof navigation[number]) => {
    setIsMobileMenuOpen(false);
    if (item.id === 'account') {
      navigate('/admin/account');
      return;
    }
    navigate(`/admin?tab=${item.id}`);
  };

  const standardNavigation = [
    { id: 'stores', label: 'Partner Stores', icon: Store },
    { id: 'applications', label: 'Applications', icon: FileText },
    { id: 'inbox', label: 'Admin Inbox', icon: Inbox },
    { id: 'homepage', label: 'Edit Homepage', icon: Layout },
    { id: 'legal', label: 'Edit Legal Pages', icon: Scale },
    { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
    { id: 'invoices', label: 'Issued Invoices', icon: ReceiptText },
    { id: 'accounts', label: 'Account Management', icon: Users },
    ...(user?.role === "auditor"
      ? [
          { id: 'audit' as const, label: 'Audit Center', icon: ShieldCheck },
          { id: 'demos' as const, label: 'Demo Management', icon: FlaskConical },
          { id: 'runtime' as const, label: 'Runtime Modes', icon: RadioTower },
          { id: 'health' as const, label: 'System Diagnosis', icon: ServerCog },
        ]
      : []),
    { id: 'account', label: 'Account', icon: UserCircle },
  ] as const;
  const navigation = isDemoAdmin
    ? [
        { id: 'stores' as const, label: 'Partner Stores', icon: Store },
        { id: 'accounts' as const, label: 'Account Management', icon: Users },
        { id: 'account' as const, label: 'Account', icon: UserCircle },
      ]
    : standardNavigation;
  const isAuditor = user?.role === 'auditor';
  const auditorMobileNavigation = navigation.filter((item) =>
    ['stores', 'audit', 'demos', 'health'].includes(item.id)
  );

  const isActive = (item: typeof navigation[number]) => {
    if (item.id === 'account') return isAccountPage;
    return !isAccountPage && activeTab === item.id;
  };
  const isAuditorMoreActive = isAuditor && !auditorMobileNavigation.some(isActive);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isMobileMenuOpen]);

  const fallbackVariant =
    isAccountPage ? 'form' :
    activeTab === 'applications' ? 'table' :
    activeTab === 'inbox' ? 'table' :
    activeTab === 'homepage' ? 'homepage' :
    activeTab === 'subscriptions' ? 'subscriptions' :
    activeTab === 'invoices' ? 'table' :
    activeTab === 'accounts' ? 'table' :
    activeTab === 'audit' ? 'table' :
    activeTab === 'demos' ? 'table' :
    activeTab === 'health' ? 'table' :
    activeTab === 'runtime' ? 'form' :
    activeTab === 'legal' ? 'form' :
    'table';

  return (
    <div className="flex min-h-0 flex-col gap-8 pb-24 md:flex-row md:pb-0 w-full relative">
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

      <nav
        className={`md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 dark:bg-[#1b1b1b]/90 backdrop-blur-xl border-t border-gray-200 dark:border-gray-800 items-center pb-[env(safe-area-inset-bottom)] px-2 py-2 shadow-[0_-10px_40px_-20px_rgba(0,0,0,0.1)] ${
          isAuditor
            ? 'grid grid-cols-5 gap-1'
            : 'flex justify-start sm:justify-center overflow-x-auto gap-2 sm:gap-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]'
        }`}
        aria-label="Dashboard navigation"
      >
        {(isAuditor ? auditorMobileNavigation : navigation).map((item) => {
          const active = isActive(item);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item)}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-xl py-1.5 transition-all ${
                isAuditor ? 'px-1' : 'min-w-[4rem] shrink-0 px-3'
              } ${
                active
                  ? 'text-[#1b1b1b] dark:text-white bg-gray-100 dark:bg-white/10'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
              }`}
            >
              <item.icon className={`w-5 h-5 mb-0.5 ${active ? 'fill-[#1b1b1b]/20' : ''}`} />
              <span className="w-full truncate text-center text-[10px] font-bold tracking-tight">
                {isAuditor && item.id === 'stores' ? 'Stores' :
                  isAuditor && item.id === 'audit' ? 'Audit' :
                  isAuditor && item.id === 'demos' ? 'Demos' :
                  isAuditor && item.id === 'health' ? 'Health' :
                  item.label}
              </span>
            </button>
          );
        })}
        {isAuditor && (
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-expanded={isMobileMenuOpen}
            aria-controls="auditor-mobile-menu"
            className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-1.5 transition-all ${
              isAuditorMoreActive || isMobileMenuOpen
                ? 'bg-gray-100 text-[#1b1b1b] dark:bg-white/10 dark:text-white'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
            }`}
          >
            <MoreHorizontal className="mb-0.5 h-5 w-5" />
            <span className="w-full truncate text-center text-[10px] font-bold tracking-tight">More</span>
          </button>
        )}
      </nav>

      {isAuditor && isMobileMenuOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Close dashboard menu"
          />
          <section
            id="auditor-mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auditor-mobile-menu-title"
            className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto rounded-t-3xl border-t border-gray-200 bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl dark:border-gray-800 dark:bg-[#1b1b1b]"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-700" />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-500">Auditor access</p>
                <h2 id="auditor-mobile-menu-title" className="text-lg font-bold text-gray-900 dark:text-white">All dashboard sections</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Close dashboard menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {navigation.map((item) => {
                const active = isActive(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item)}
                    className={`flex min-w-0 items-center gap-3 rounded-2xl p-3 text-left text-sm font-semibold transition-colors ${
                      active
                        ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
                    }`}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    <span className="min-w-0 leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}

      <div className="flex-1 min-w-0 bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-200 dark:border-gray-800 p-4 sm:p-6 md:p-8 shadow-sm transition-colors">
        {isDemoAdmin && !isAccountPage && (
          <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-medium text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
            Demo administrator sandbox preview. Data is limited to this demo tenant and management actions are read-only.
          </div>
        )}
        <Suspense fallback={<PageSkeleton variant={fallbackVariant} />}>
          {isAccountPage ? (
            <AdminAccount />
          ) : (
            <>
              {activeTab === 'stores' && <AdminStores />}
              {activeTab === 'applications' && <AdminApplications />}
              {activeTab === 'inbox' && <AdminPublicEngagement />}
              {activeTab === 'homepage' && <AdminHomepage />}
              {activeTab === 'legal' && <AdminLegalPages />}
              {activeTab === 'subscriptions' && <AdminSubscriptions />}
              {activeTab === 'invoices' && <AdminInvoices />}
              {activeTab === 'accounts' && <AdminAccounts />}
              {activeTab === 'audit' && <AdminAudit />}
              {activeTab === 'demos' && <AdminDemoManagement />}
              {activeTab === 'health' && <AdminSystemHealth />}
              {activeTab === 'runtime' && <AdminRuntimeControl />}
            </>
          )}
        </Suspense>
      </div>
    </div>
  );
}
