import React, { useState } from "react";
import { Store, FileText, User, Layout, CreditCard } from "lucide-react";
import AdminStores from "./admin/AdminStores";
import AdminApplications from "./admin/AdminApplications";
import AdminAccount from "./admin/AdminAccount";
import AdminHomepage from "./admin/AdminHomepage";
import AdminSubscriptions from "./admin/AdminSubscriptions";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'stores' | 'applications' | 'account' | 'homepage' | 'subscriptions'>('stores');

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex flex-wrap gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-max">
        {[
          { id: 'stores', label: 'Partner Stores', icon: Store },
          { id: 'applications', label: 'Applications', icon: FileText },
          { id: 'account', label: 'Account', icon: User },
          { id: 'homepage', label: 'Edit Homepage', icon: Layout },
          { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeTab === tab.id 
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' 
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm transition-colors">
        {activeTab === 'stores' && <AdminStores />}
        {activeTab === 'applications' && <AdminApplications />}
        {activeTab === 'account' && <AdminAccount />}
        {activeTab === 'homepage' && <AdminHomepage />}
        {activeTab === 'subscriptions' && <AdminSubscriptions />}
      </div>
    </div>
  );
}
