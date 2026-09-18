import React, { lazy, Suspense, useState } from "react";
import { Store, FileText, Layout, CreditCard, Menu, UserCircle, Scale, Inbox, ReceiptText, Users, ScrollText, ServerCog, FlaskConical, RadioTower } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { PageSkeleton } from "../components/LoadingSkeleton";
import { useAuth } from "../contexts/AuthContext";
import { MobileDashboardNavigation } from "../components/MobileDashboardNavigation";

const AdminStores = lazy(() => import("./admin/AdminStores"));
const AdminApplications = lazy(() => import("./admin/AdminApplications"));
const AdminAccount = lazy(() => import("./admin/AdminAccount"));
const AdminHomepage = lazy(() => import("./admin/AdminHomepage"));
const AdminSubscriptions = lazy(() => import("./admin/AdminSubscriptions"));
const AdminInvoices = lazy(() => import("./admin/AdminInvoices"));
const AdminAccounts = lazy(() => import("./admin/AdminAccounts"));
const AdminLogs = lazy(() => import("./admin/AdminAudit"));
const AdminSystemHealth = lazy(() => import("./admin/AdminSystemHealth"));
const AdminDemoManagement = lazy(() => import("./admin/AdminDemoManagement"));
const AdminRuntimeControl = lazy(() => import("./admin/AdminRuntimeControl"));
const AdminLegalPages = lazy(() => import("./admin/AdminLegalPages"));
const AdminPublicEngagement = lazy(() => import("./admin/AdminPublicEngagement"));

type PrivilegedPortalPath = "/admin" | "/auditor";

export default function AdminDashboard({ portalBasePath }: { portalBasePath: PrivilegedPortalPath }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const isAccountPage = location.pathname === `${portalBasePath}/account`;
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
    (requestedTab === 'logs' && ["admin", "assistant_admin", "auditor"].includes(user?.role || "")) ||
    (requestedTab === 'demos' && user?.role === 'auditor') ||
    (requestedTab === 'health' && user?.role === 'auditor') ||
    (requestedTab === 'runtime' && user?.role === 'auditor')
      ? requestedTab
      : 'stores';

  const handleNavClick = (item: typeof navigation[number]) => {
    if (item.id === 'account') {
      navigate(`${portalBasePath}/account`);
      return;
    }
    navigate(`${portalBasePath}?tab=${item.id}`);
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
    { id: 'logs', label: 'Logs', icon: ScrollText },
    ...(user?.role === "auditor"
      ? [
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
  const isActive = (item: typeof navigation[number]) => {
    if (item.id === 'account') return isAccountPage;
    return !isAccountPage && activeTab === item.id;
  };

  const fallbackVariant =
    isAccountPage ? 'form' :
    activeTab === 'applications' ? 'table' :
    activeTab === 'inbox' ? 'table' :
    activeTab === 'homepage' ? 'homepage' :
    activeTab === 'subscriptions' ? 'subscriptions' :
    activeTab === 'invoices' ? 'table' :
    activeTab === 'accounts' ? 'table' :
    activeTab === 'logs' ? 'table' :
    activeTab === 'demos' ? 'table' :
    activeTab === 'health' ? 'table' :
    activeTab === 'runtime' ? 'form' :
    activeTab === 'legal' ? 'form' :
    'table';

  return (
    <div className="flex min-h-0 flex-col gap-8 pb-24 md:flex-row md:pb-0 w-full relative">
      <aside className={`hidden md:flex flex-col shrink-0 sticky top-24 max-h-[calc(100dvh-7rem)] overflow-x-hidden overflow-y-auto overscroll-contain z-10 transition-all duration-300 ease-in-out [scrollbar-gutter:stable] ${isSidebarOpen ? 'w-64' : 'w-20'} space-y-4`}>
        <div className={`sticky top-0 z-20 flex items-center bg-white/95 py-1 backdrop-blur-sm dark:bg-[#1b1b1b]/95 ${isSidebarOpen ? 'justify-between' : 'justify-center'} mb-2`}>
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

      <MobileDashboardNavigation
        accessLabel={
          user?.role === "auditor" ? "Auditor access" :
          user?.role === "assistant_admin" ? "Assistant admin access" :
          "Admin access"
        }
        primaryItemIds={user?.role === "auditor" ? ["stores", "logs", "demos", "health"] : undefined}
        items={navigation.map((item) => ({
          id: item.id,
          label: item.label,
          shortLabel:
            item.id === "stores" ? "Stores" :
            item.id === "applications" ? "Apps" :
            item.id === "homepage" ? "Homepage" :
            item.id === "logs" ? "Logs" :
            item.id === "demos" ? "Demos" :
            item.id === "health" ? "Health" :
            item.label,
          icon: item.icon,
          active: isActive(item),
          onSelect: () => handleNavClick(item),
        }))}
      />

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
              {activeTab === 'logs' && <AdminLogs />}
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
