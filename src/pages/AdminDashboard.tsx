import React, { lazy, Suspense, useState } from "react";
import { Store, FileText, Layout, CreditCard } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { PageSkeleton } from "../components/LoadingSkeleton";

const AdminStores = lazy(() => import("./admin/AdminStores"));
const AdminApplications = lazy(() => import("./admin/AdminApplications"));
const AdminAccount = lazy(() => import("./admin/AdminAccount"));
const AdminHomepage = lazy(() => import("./admin/AdminHomepage"));
const AdminSubscriptions = lazy(() => import("./admin/AdminSubscriptions"));

export default function AdminDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'stores' | 'applications' | 'homepage' | 'subscriptions'>('stores');
  const isAccountPage = location.pathname === '/admin/account';

  const handleTabClick = (tabId: typeof activeTab) => {
    setActiveTab(tabId);
    if (isAccountPage) navigate('/admin');
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-max">
          {[
            { id: 'stores', label: 'Partner Stores', icon: Store },
            { id: 'applications', label: 'Applications', icon: FileText },
            { id: 'homepage', label: 'Edit Homepage', icon: Layout },
            { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                !isAccountPage && activeTab === tab.id 
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' 
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm transition-colors">
        <Suspense fallback={<PageSkeleton variant="table" />}>
          {isAccountPage ? (
            <AdminAccount />
          ) : (
            <>
              {activeTab === 'stores' && <AdminStores />}
              {activeTab === 'applications' && <AdminApplications />}
              {activeTab === 'homepage' && <AdminHomepage />}
              {activeTab === 'subscriptions' && <AdminSubscriptions />}
            </>
          )}
        </Suspense>
      </div>
    </div>
  );
}
