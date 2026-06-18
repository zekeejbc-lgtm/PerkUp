import React, { useState, useEffect } from "react";
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Store, ShoppingBag, Gift, Users, BadgeCheck, UserCircle, CreditCard, ChevronRight, Building, Menu } from "lucide-react";
import StoreOwnerInfo from "./store-owner/StoreOwnerInfo";
import StoreOwnerProducts from "./store-owner/StoreOwnerProducts";
import StoreOwnerPromotions from "./store-owner/StoreOwnerPromotions";
import StoreOwnerCustomers from "./store-owner/StoreOwnerCustomers";
import StoreOwnerStaff from "./store-owner/StoreOwnerStaff";
import StoreOwnerAccount from "./store-owner/StoreOwnerAccount";
import StoreOwnerSubscription from "./store-owner/StoreOwnerSubscription";
import { useAuth } from "../contexts/AuthContext";
import { query, where, getDocs, collection } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";

export default function StoreOwnerDashboard() {
  const location = useLocation();
  const { user } = useAuth();
  const [stores, setStores] = useState<any[]>([]);
  const [selectedStore, setSelectedStore] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    async function fetchStores() {
      if (!user) return;
      try {
        const q = query(collection(db, "stores"), where("ownerId", "==", user.id));
        const snap = await getDocs(q);
        const fetchedStores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setStores(fetchedStores);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, "stores");
      } finally {
        setLoading(false);
      }
    }
    fetchStores();
  }, [user]);

  const navigation = [
    { name: 'Store Info', href: '/owner', icon: Store },
    { name: 'Products', href: '/owner/products', icon: ShoppingBag },
    { name: 'Promotions', href: '/owner/promotions', icon: Gift },
    { name: 'Customers', href: '/owner/customers', icon: Users },
    { name: 'Staff', href: '/owner/staff', icon: BadgeCheck },
    { name: 'Account', href: '/owner/account', icon: UserCircle },
    { name: 'Subscription', href: '/owner/subscription', icon: CreditCard },
  ];

  if (loading) {
    return <div className="animate-pulse p-8 text-gray-500">Loading your store dashboard...</div>;
  }

  // Branch Selector View
  if (!selectedStore && location.pathname !== '/owner/account' && location.pathname !== '/owner/subscription') {
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Your Branches</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-2">Select a branch to manage its information, products, and promotions.</p>
        </div>

        {stores.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 p-12 rounded-[2rem] border border-dashed border-gray-300 dark:border-gray-700 text-center flex flex-col items-center">
            <Store className="w-16 h-16 text-gray-400 mb-6" />
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No branches assigned</h3>
            <p className="text-gray-500 max-w-sm mb-8">You haven't been assigned any branches yet.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {stores.map((store) => (
              <button
                key={store.id}
                onClick={() => setSelectedStore(store)}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 text-left hover:border-orange-500 dark:hover:border-orange-500 hover:shadow-lg transition-all group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50 dark:bg-orange-500/10 rounded-bl-full -z-10 transition-transform group-hover:scale-110" />
                <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/50 rounded-2xl flex items-center justify-center mb-6">
                  <Building className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{store.name || 'Unnamed Branch'}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-6">{store.address || 'No address set'}</p>
                <div className="flex items-center text-sm font-semibold text-orange-600 dark:text-orange-400">
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

        {selectedStore && (
          <div className="hidden md:block overflow-hidden transition-all duration-300">
            {isSidebarOpen ? (
              <button 
                onClick={() => {
                  if (stores.length > 1) setSelectedStore(null);
                }}
                className={`w-full text-left px-4 py-3 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800/50 rounded-2xl border ${stores.length > 1 ? 'hover:bg-orange-100 dark:hover:bg-orange-900/40 cursor-pointer' : 'cursor-default'}`}
              >
                <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-widest mb-1">Current Branch</p>
                <p className="font-bold text-gray-900 dark:text-white truncate">{selectedStore.name}</p>
              </button>
            ) : (
              <button 
                onClick={() => {
                  if (stores.length > 1) setSelectedStore(null);
                }}
                title={`Branch: ${selectedStore.name}`}
                className={`w-full flex items-center justify-center p-3 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800/50 rounded-2xl border ${stores.length > 1 ? 'hover:bg-orange-100 dark:hover:bg-orange-900/40 cursor-pointer' : 'cursor-default'}`}
              >
                <Building className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              </button>
            )}
          </div>
        )}

        <nav className="flex flex-col gap-2">
          {navigation.map((item) => {
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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 dark:bg-gray-950/90 backdrop-blur-xl border-t border-gray-200 dark:border-gray-800 flex items-center justify-start sm:justify-center overflow-x-auto pb-[env(safe-area-inset-bottom)] px-2 py-2 shadow-[0_-10px_40px_-20px_rgba(0,0,0,0.1)] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] gap-2 sm:gap-6">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={`flex flex-col items-center gap-1 min-w-[4rem] px-3 py-1.5 rounded-xl transition-all shrink-0 ${
                isActive 
                  ? 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20' 
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <item.icon className={`w-5 h-5 mb-0.5 ${isActive ? 'fill-orange-500/20' : ''}`} />
              <span className="text-[10px] font-bold tracking-tight">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-200 dark:border-gray-800 p-4 sm:p-6 md:p-8 shadow-sm">
        <Routes>
          <Route path="/" element={<StoreOwnerInfo store={selectedStore} setStore={(updatedStore: any) => {
            setSelectedStore(updatedStore);
            setStores(stores.map(s => s.id === updatedStore.id ? updatedStore : s));
          }} />} />
          <Route path="/products" element={<StoreOwnerProducts store={selectedStore} />} />
          <Route path="/promotions" element={<StoreOwnerPromotions store={selectedStore} />} />
          <Route path="/customers" element={<StoreOwnerCustomers store={selectedStore} />} />
          <Route path="/staff" element={<StoreOwnerStaff store={selectedStore} />} />
          <Route path="/account" element={<StoreOwnerAccount />} />
          <Route path="/subscription" element={<StoreOwnerSubscription />} />
        </Routes>
      </div>
    </div>
  );
}
