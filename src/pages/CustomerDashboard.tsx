import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { QrCode, Map, CreditCard, Gift, User as UserIcon, Star, ShieldCheck } from "lucide-react";
import CustomerOverview from "./customer/CustomerOverview";
import CustomerProfile from "./customer/CustomerProfile";
import CustomerStores from "./customer/CustomerStores";
import CustomerCards from "./customer/CustomerCards";
import CustomerPromotions from "./customer/CustomerPromotions";

export default function CustomerDashboard() {
  const location = useLocation();

  const navigation = [
    { name: 'Overview', href: '/customer', icon: QrCode },
    { name: 'My Cards', href: '/customer/cards', icon: CreditCard },
    { name: 'Stores & Maps', href: '/customer/stores', icon: Map },
    { name: 'Promotions', href: '/customer/promotions', icon: Gift },
    { name: 'Profile', href: '/customer/profile', icon: UserIcon },
  ];

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 shrink-0 md:sticky md:top-24 h-max z-10">
        <nav className="flex md:flex-col gap-2 overflow-x-auto pb-4 md:pb-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all whitespace-nowrap ${
                  isActive 
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-md scale-[1.02]' 
                    : 'text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white hover:shadow-sm'
                }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? 'text-current' : 'text-gray-400 group-hover:text-gray-500'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0">
        <Routes>
          <Route path="/" element={<CustomerOverview />} />
          <Route path="/cards" element={<CustomerCards />} />
          <Route path="/stores" element={<CustomerStores />} />
          <Route path="/promotions" element={<CustomerPromotions />} />
          <Route path="/profile" element={<CustomerProfile />} />
        </Routes>
      </div>
    </div>
  );
}
