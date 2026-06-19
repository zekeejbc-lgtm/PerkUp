import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { signInWithGoogle, db, handleDataError, OperationType } from "../lib/backend";
import { QrCode, Star, Coffee, ArrowRight, MapPin, Pizza, Scissors, BookOpen, Shirt, Dumbbell, Glasses, Anchor, Search, Store as StoreIcon, Mail, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "@/src/lib/dataCompat";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import * as ReactDOMServer from "react-dom/server";
import L from "leaflet";
import { ThemeToggle } from "../components/ThemeToggle";
import { AuthModal } from "../components/AuthModal";
import { getDisplayImageUrl } from "../lib/imageStorage";
import { PageSkeleton, SkeletonBlock } from "../components/LoadingSkeleton";

import { PartnerApplicationModal } from "../components/PartnerApplicationModal";

interface MapStore {
  id: string;
  name: string;
  lat?: number;
  lng?: number;
  description?: string;
  contact?: string;
  logoUrl?: string;
}

// Temporary demo stores in case DB is empty or lacks location data
const DEMO_STORES: MapStore[] = [
  { id: "demo1", name: "The Daily Grind", lat: 7.4474, lng: 125.8093, description: "Artisan coffee & pastries", contact: "(084) 123-4567" },
  { id: "demo2", name: "Green Leaf Salads", lat: 7.4450, lng: 125.8110, description: "Fresh, locally sourced salads", contact: "(084) 987-6543" },
  { id: "demo3", name: "Midnight Diner", lat: 7.4500, lng: 125.8050, description: "Comfort food 24/7", contact: "(084) 555-0000" }
];

const LOGOS = [
  { icon: Coffee, name: "The Daily Grind" },
  { icon: Pizza, name: "Slice & Co" },
  { icon: Scissors, name: "Sharp Cuts" },
  { icon: BookOpen, name: "Chapter One" },
  { icon: Shirt, name: "Thread & Needle" },
  { icon: Dumbbell, name: "Iron Vault" },
  { icon: Glasses, name: "Clear Vision" },
  { icon: Anchor, name: "Sea Catch" },
];

const getStoreIcon = (name: string) => {
  const logo = LOGOS.find(l => l.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(l.name.toLowerCase()));
  return logo ? logo.icon : StoreIcon;
};

const createCustomPin = (storeName: string) => {
  const IconComponent = getStoreIcon(storeName);
  const iconHtml = ReactDOMServer.renderToString(<IconComponent size={20} strokeWidth={2.5} color="#ea580c" />);

  return L.divIcon({
    className: 'custom-pin',
    html: `
      <div style="background-color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); border: 2px solid #ea580c; position: relative;">
        ${iconHtml}
        <div style="position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid #ea580c;"></div>
      </div>
    `,
    iconSize: [40, 46],
    iconAnchor: [20, 46],
    popupAnchor: [0, -46]
  });
};

export default function LandingPage() {
  const { user, loading } = useAuth();
  const [stores, setStores] = useState<MapStore[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showAppModal, setShowAppModal] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [config, setConfig] = useState<any>({
    heroHeadline: "Reward your \nbest customers.",
    heroSubheadline: "Ditch the paper punch cards. PerkUp is a minimal, fast, and secure digital loyalty system that runs right in your browser. No apps to install.",
    heroImageUrl: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?q=80&w=2047&auto=format&fit=crop",
    trustedBusinesses: [],
    usePartnerStores: false,
    applicationsOpen: true,
    footerInfo: {
      address: "Tagum City, Davao del Norte, Philippines",
      email: "perkup.shop@youthserviceph.org",
      phone: "0962 232 8290",
      socialLinks: {
        facebook: "",
        instagram: "",
        twitter: ""
      }
    }
  });

  const openAuthModal = (mode: 'signin' | 'signup') => {
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  useEffect(() => {
    async function fetchStores() {
      try {
        const q = query(collection(db, "stores"), where("status", "==", "active"));
        const snap = await getDocs(q);
        
        let loadedStores = snap.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name,
          lat: doc.data().lat,
          lng: doc.data().lng,
          description: doc.data().description,
          contact: doc.data().contact,
          logoUrl: doc.data().logoUrl
        }));

        // Filter out those without location, if none have location, use demo stores
        const validStores = loadedStores.filter(s => s.lat !== undefined && s.lng !== undefined);
        if (validStores.length > 0) {
          setStores(validStores);
        } else {
          setStores(DEMO_STORES);
        }
      } catch (error) {
        console.error("Failed to fetch stores", error);
        setStores(DEMO_STORES);
      } finally {
        setMapLoaded(true);
      }
    }

    async function fetchConfig() {
      try {
        const { getDoc, doc } = await import("@/src/lib/dataCompat");
        const snap = await getDoc(doc(db, "settings", "homepage"));
        if (snap.exists()) {
          const data = snap.data();
          setConfig((prev: any) => ({
            ...prev,
            ...data,
            footerInfo: {
              ...prev.footerInfo,
              ...(data.footerInfo || {}),
              socialLinks: {
                ...prev.footerInfo.socialLinks,
                ...(data.footerInfo?.socialLinks || {})
              }
            }
          }));
        }
      } catch (e) {
        console.error(e);
      }
    }

    fetchStores();
    fetchConfig();
  }, []);

  if (loading) return <PageSkeleton variant="store" />;

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const filteredStores = stores.filter(store => 
    store.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    store.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-gray-950 selection:bg-orange-100 selection:text-orange-900 flex flex-col">
      <header className="sticky top-0 z-50 bg-[#fafafa]/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-800/50 transition-colors">
        <nav className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-white rounded-xl shadow-sm overflow-hidden p-0.5">
            <img src="/icons/icon-192.png?v=20260618-logo" alt="PerkUp Logo" className="w-full h-full object-contain" />
          </div>
          <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">PerkUp</span>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <button
            onClick={() => openAuthModal('signin')}
            className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
          >
            Sign in
          </button>
          <button
            onClick={() => openAuthModal('signup')}
            className="px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-500 rounded-xl transition-colors hidden sm:block"
          >
            Sign up
          </button>
        </div>
        </nav>
      </header>

      <main className="flex-1">
        <section className="relative pt-12 sm:pt-20 pb-20 sm:pb-32 overflow-hidden">
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#fafafa]/80 dark:via-gray-950/80 to-[#fafafa] dark:to-gray-950 z-10 transition-colors" />
            <img 
              src={getDisplayImageUrl(config.heroImageUrl)}
              alt="Hero image" 
              data-eager="true"
              loading="eager"
              fetchPriority="high"
              className="w-full h-full object-cover opacity-30 dark:opacity-20" 
            />
          </div>
          
          <div className="mx-auto max-w-7xl px-6 relative z-10">
            <div className="grid lg:grid-cols-2 gap-12 sm:gap-16 items-center">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/50 text-orange-600 dark:text-orange-400 text-xs font-semibold tracking-wide uppercase mb-8">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                </span>
                Digital Loyalty Starts Here
              </div>
              
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight text-gray-900 dark:text-white leading-[1.1] mb-6 sm:mb-8 transition-colors whitespace-pre-wrap">
                {config.heroHeadline}
              </h1>
              
              <p className="text-base sm:text-lg text-gray-500 dark:text-gray-400 mb-8 sm:mb-10 max-w-lg leading-relaxed transition-colors">
                {config.heroSubheadline}
              </p>
              
              <button
                onClick={() => openAuthModal('signup')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gray-900 dark:bg-white px-8 py-4 text-sm font-medium text-white dark:text-gray-900 shadow-sm hover:bg-gray-800 dark:hover:bg-gray-100 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="relative">
              {/* Abstract visual representation */}
              <div className="aspect-[4/3] rounded-[2rem] bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-8 relative overflow-hidden shadow-sm transition-colors">
                <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-orange-200 dark:bg-orange-900/30 rounded-full mix-blend-multiply dark:mix-blend-lighten filter blur-3xl opacity-50 animate-blob"></div>
                <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-64 h-64 bg-blue-200 dark:bg-blue-900/30 rounded-full mix-blend-multiply dark:mix-blend-lighten filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
                
                <div className="relative h-full flex flex-col items-center justify-center space-y-6">
                  <div className="bg-white dark:bg-gray-950 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 w-64 transform -rotate-6 transition-all hover:rotate-0 duration-500">
                    <div className="flex justify-between items-start mb-6">
                      <div className="w-12 h-12 bg-gray-50 dark:bg-gray-900 rounded-2xl flex items-center justify-center">
                        <QrCode className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                      </div>
                      <div className="flex gap-1">
                        {[1, 2, 3].map((i) => (
                          <Star key={i} className="w-4 h-4 text-orange-400 fill-orange-400" />
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded-lg w-3/4"></div>
                      <div className="h-3 bg-gray-50 dark:bg-gray-900 rounded-lg w-1/2"></div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-950 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 w-64 transform translate-x-12 12 rotate-3 transition-all hover:rotate-0 duration-500">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Coffee Card</span>
                      <span className="text-xs font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 px-2 py-1 rounded-md">8/10</span>
                    </div>
                    <div className="flex gap-2 mb-2">
                      {[...Array(8)].map((_, i) => (
                        <div key={i} className="w-6 h-6 bg-orange-100 dark:bg-orange-900/40 rounded-full flex items-center justify-center">
                          <Coffee className="w-3 h-3 text-orange-600 dark:text-orange-400" />
                        </div>
                      ))}
                      {[...Array(2)].map((_, i) => (
                        <div key={`empty-${i}`} className="w-6 h-6 bg-gray-50 dark:bg-gray-900 rounded-full border border-gray-100 dark:border-gray-800"></div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>
        </section>

        {/* Logo Marquee Section */}
        <section className="py-12 sm:py-20 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-hidden relative flex flex-col items-center transition-colors">
          <p className="text-center text-xs sm:text-sm font-bold text-gray-400 dark:text-gray-500 mb-8 sm:mb-12 uppercase tracking-widest px-6">
            Trusted by local businesses
          </p>
          
          <div className="relative w-full overflow-hidden flex">
            {/* gradient fades for the edges */}
            <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-white dark:from-gray-950 to-transparent z-10 pointer-events-none transition-colors"></div>
            <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-white dark:from-gray-950 to-transparent z-10 pointer-events-none transition-colors"></div>
            
            <div className="flex animate-scroll hover:opacity-100 transition-opacity duration-500 w-[200%]">
              {config.usePartnerStores && stores.length > 0 ? (
                 [...stores, ...stores, ...stores, ...stores].map((store, idx) => (
                   <div key={`partner-${idx}`} className="flex flex-col items-center justify-center w-64 shrink-0 gap-4 opacity-40 hover:opacity-100 transition-opacity duration-300">
                     <div className="w-16 h-16 bg-gray-50 dark:bg-gray-900 rounded-3xl flex items-center justify-center text-gray-400 dark:text-gray-500 border border-gray-100 dark:border-gray-800 shadow-sm transition-all hover:scale-105 hover:-rotate-3 duration-300 overflow-hidden">
                       {store.logoUrl ? <img src={getDisplayImageUrl(store.logoUrl)} className="w-full h-full object-cover" alt={store.name} /> : <StoreIcon className="w-8 h-8" />}
                     </div>
                     <span className="font-semibold text-gray-400 dark:text-gray-500 tracking-tight">{store.name}</span>
                   </div>
                 ))
              ) : config.trustedBusinesses && config.trustedBusinesses.length > 0 ? (
                 [...config.trustedBusinesses, ...config.trustedBusinesses, ...config.trustedBusinesses, ...config.trustedBusinesses].map((logo: any, idx: number) => (
                   <div key={`custom-${idx}`} className="flex flex-col items-center justify-center w-64 shrink-0 gap-4 opacity-40 hover:opacity-100 transition-opacity duration-300">
                     <div className="w-16 h-16 bg-gray-50 dark:bg-gray-900 rounded-3xl flex items-center justify-center text-gray-400 dark:text-gray-500 border border-gray-100 dark:border-gray-800 shadow-sm transition-all hover:scale-105 hover:-rotate-3 duration-300 overflow-hidden">
                       {logo.logoUrl ? <img src={getDisplayImageUrl(logo.logoUrl)} className="w-full h-full object-cover" alt={logo.name} /> : <StoreIcon className="w-8 h-8" />}
                     </div>
                     <span className="font-semibold text-gray-400 dark:text-gray-500 tracking-tight">{logo.name}</span>
                   </div>
                 ))
              ) : (
                [...LOGOS, ...LOGOS, ...LOGOS, ...LOGOS].map((logo, idx) => (
                  <div key={`fallback-${idx}`} className="flex flex-col items-center justify-center w-64 shrink-0 gap-4 opacity-40 hover:opacity-100 transition-opacity duration-300">
                    <div className="w-16 h-16 bg-gray-50 dark:bg-gray-900 rounded-3xl flex items-center justify-center text-gray-400 dark:text-gray-500 border border-gray-100 dark:border-gray-800 shadow-sm transition-all hover:scale-105 hover:-rotate-3 duration-300">
                      <logo.icon className="w-8 h-8" />
                    </div>
                    <span className="font-semibold text-gray-400 dark:text-gray-500 tracking-tight">{logo.name}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Map Section */}
        <section className="bg-white dark:bg-gray-950 py-20 sm:py-32 border-t border-gray-100 dark:border-gray-800 transition-colors">
          <div className="mx-auto max-w-7xl px-6">
            <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-16">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl transition-colors">
                Find affiliated stores
              </h2>
              <p className="mt-3 sm:mt-4 text-base sm:text-lg text-gray-500 dark:text-gray-400 mb-8 transition-colors">
                Discover places where you can earn and redeem rewards. Find a partner near you.
              </p>
              
              <div className="relative max-w-md mx-auto">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 z-10">
                  <Search className="h-5 w-5 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                </div>
                <input
                  type="text"
                  name="search"
                  id="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full rounded-2xl border-0 py-4 pl-12 pr-4 text-gray-900 dark:text-white bg-white dark:bg-gray-900 shadow-sm ring-1 ring-inset ring-gray-200 dark:ring-gray-800 placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm sm:leading-6 transition-colors"
                  placeholder="Search by store name or category..."
                />
              </div>
            </div>

            <div className="rounded-[2rem] overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm h-[400px] sm:h-[600px] relative z-0 transition-colors">
               {mapLoaded && stores.length > 0 ? (
                 <MapContainer 
                   center={[stores[0].lat!, stores[0].lng!]} 
                   zoom={14} 
                   scrollWheelZoom={false} 
                   style={{ height: "100%", width: "100%", zIndex: 1 }}
                 >
                   <TileLayer
                     attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                     url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                   />
                   {filteredStores.map(store => store.lat && store.lng ? (
                     <Marker key={store.id} position={[store.lat, store.lng]} icon={createCustomPin(store.name)}>
                       <Popup className="rounded-xl overflow-hidden shadow-md">
                         <div className="p-1 -m-1">
                           <h3 className="font-bold text-gray-900 text-lg mb-1">{store.name}</h3>
                           {store.description && (
                             <p className="text-sm text-gray-600 mb-2 leading-tight">{store.description}</p>
                           )}
                           {store.contact && (
                             <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
                               <MapPin className="w-3 h-3" />
                               {store.contact}
                             </div>
                           )}
                           <div className="flex flex-col gap-2 mt-3">
                             <a 
                               href={`/store/${store.id}`}
                               className="w-full text-center bg-gray-900 text-white font-medium py-2 rounded-lg text-xs hover:bg-gray-800 transition-colors"
                             >
                               View Details
                             </a>
                             <button 
                               onClick={() => alert(`Directions to ${store.name} would open here!`)}
                               className="w-full bg-orange-50 text-orange-700 font-medium py-2 rounded-lg text-xs hover:bg-orange-100 transition-colors"
                             >
                               Get Directions
                             </button>
                           </div>
                         </div>
                       </Popup>
                     </Marker>
                   ) : null)}
                 </MapContainer>
               ) : (
                 <SkeletonBlock className="h-full w-full" />
               )}
            </div>
          </div>
        </section>

        {/* Affiliate Section */}
        {config.applicationsOpen && (
          <section className="bg-gray-900 text-white py-24 sm:py-32 relative overflow-hidden">
            <div className="absolute inset-0 z-0 opacity-10">
              <div className="absolute -top-24 -right-24 w-96 h-96 bg-orange-500 rounded-full blur-3xl mix-blend-screen"></div>
              <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-500 rounded-full blur-3xl mix-blend-screen"></div>
            </div>
            <div className="mx-auto max-w-7xl px-6 relative z-10 text-center">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">Become a Partner Store</h2>
              <p className="text-gray-400 text-lg max-w-2xl mx-auto mb-10">
                Join our growing network of local businesses. Drive more foot traffic, build customer loyalty, and get insights into your best customers.
              </p>
              <button 
                onClick={() => setShowAppModal(true)}
                className="bg-orange-600 text-white px-8 py-4 rounded-2xl font-medium hover:bg-orange-500 transition-colors shadow-lg shadow-orange-600/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-orange-500"
              >
                Apply to be a Partner
              </button>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 pt-16 pb-8 transition-colors">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-gray-100 dark:bg-gray-900 p-1.5 rounded-lg transition-colors">
                  <Star className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                </div>
                <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white transition-colors">PerkUp</span>
              </div>
              <p className="text-gray-500 dark:text-gray-400 max-w-sm mb-6 leading-relaxed transition-colors">
                The modern digital loyalty program for independent businesses. Reward your best customers without the paper cards.
              </p>
              <div className="flex flex-col gap-3 mb-6">
                <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400 transition-colors">
                  <Mail className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <span className="text-sm">{config.footerInfo.email}</span>
                </div>
                <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400 transition-colors">
                  <Phone className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <span className="text-sm">{config.footerInfo.phone}</span>
                </div>
                <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400 transition-colors">
                  <MapPin className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <span className="text-sm">{config.footerInfo.address}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                {config.footerInfo.socialLinks?.facebook && (
                  <a href={config.footerInfo.socialLinks.facebook} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-orange-600 transition-colors">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path fillRule="evenodd" d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" clipRule="evenodd" />
                    </svg>
                  </a>
                )}
                {config.footerInfo.socialLinks?.instagram && (
                  <a href={config.footerInfo.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-orange-600 transition-colors">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd" />
                    </svg>
                  </a>
                )}
                {config.footerInfo.socialLinks?.twitter && (
                  <a href={config.footerInfo.socialLinks.twitter} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-orange-600 transition-colors">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4 transition-colors">Product</h3>
              <ul className="space-y-3 text-sm text-gray-500 dark:text-gray-400">
                <li><a href="#customers" className="hover:text-orange-600 dark:hover:text-orange-400 transition-colors">For Customers</a></li>
                <li><a href="#businesses" className="hover:text-orange-600 dark:hover:text-orange-400 transition-colors">For Businesses</a></li>
                <li><a href="#pricing" className="hover:text-orange-600 dark:hover:text-orange-400 transition-colors">Pricing</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4 transition-colors">Company</h3>
              <ul className="space-y-3 text-sm text-gray-500 dark:text-gray-400">
                <li><a href="#about" className="hover:text-orange-600 dark:hover:text-orange-400 transition-colors">About Us</a></li>
                <li><a href="#careers" className="hover:text-orange-600 dark:hover:text-orange-400 transition-colors">Careers</a></li>
                <li><a href="#privacy" className="hover:text-orange-600 dark:hover:text-orange-400 transition-colors">Privacy Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-100 dark:border-gray-800 pt-8 flex justify-center text-xs text-gray-400 dark:text-gray-500 transition-colors">
            <p>&copy; {new Date().getFullYear()} PerkUp. All rights reserved.</p>
          </div>
        </div>
      </footer>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} initialMode={authMode} />
      <PartnerApplicationModal isOpen={showAppModal} onClose={() => setShowAppModal(false)} />
    </div>
  );
}
