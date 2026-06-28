import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { AUTH_REDIRECT_MESSAGE_KEY, db } from "../lib/backend";
import { QrCode, Star, Coffee, ArrowRight, MapPin, Pizza, Scissors, BookOpen, Shirt, Dumbbell, Glasses, Anchor, Search, Store as StoreIcon, Mail, Phone, Clock3, X } from "lucide-react";
import { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "@/src/lib/dataCompat";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import * as ReactDOMServer from "react-dom/server";
import L from "leaflet";
import { BrandMark } from "../components/BrandMark";
import { AuthModal } from "../components/AuthModal";
import { PublicSiteHeader } from "../components/PublicSiteHeader";
import { getDisplayImageUrl } from "../lib/imageStorage";
import { PageSkeleton, SkeletonBlock } from "../components/LoadingSkeleton";
import { DirectionsButton } from "../components/DirectionsButton";
import { DirectoryStore, getStoreCategories, isStoreOpenNow, storeMatchesFilters } from "../lib/storeDirectory";

import { PartnerApplicationModal } from "../components/PartnerApplicationModal";
import { NewsletterForm } from "../components/NewsletterForm";

interface AuthNavigationState {
  authRequired?: boolean;
  returnTo?: string;
}

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
  const iconHtml = ReactDOMServer.renderToString(<IconComponent size={20} strokeWidth={2.5} color="#1b1b1b" />);

  return L.divIcon({
    className: 'custom-pin',
    html: `
      <div style="background-color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); border: 2px solid #1b1b1b; position: relative;">
        ${iconHtml}
        <div style="position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid #1b1b1b;"></div>
      </div>
    `,
    iconSize: [40, 46],
    iconAnchor: [20, 46],
    popupAnchor: [0, -46]
  });
};

export default function LandingPage() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigationState = location.state as AuthNavigationState | null;
  const [stores, setStores] = useState<DirectoryStore[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [openNowOnly, setOpenNowOnly] = useState(false);
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
    const redirectMessage = window.sessionStorage.getItem(AUTH_REDIRECT_MESSAGE_KEY);
    if (!loading && !user && (redirectMessage || navigationState?.authRequired)) {
      setAuthMode("signin");
      setShowAuthModal(true);
    }
  }, [loading, navigationState?.authRequired, user]);

  useEffect(() => {
    if (new URLSearchParams(location.search).get("partner") === "true") setShowAppModal(true);
  }, [location.search]);

  const closeAuthModal = () => {
    setShowAuthModal(false);
  };

  useEffect(() => {
    async function fetchStores() {
      try {
        const q = query(collection(db, "stores"), where("status", "==", "active"));
        const snap = await getDocs(q);

        let loadedStores = snap.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name,
          lat: Number(doc.data().lat ?? doc.data().latitude),
          lng: Number(doc.data().lng ?? doc.data().longitude),
          description: doc.data().description,
          contact: doc.data().contact,
          logoUrl: doc.data().logoUrl,
          category: doc.data().category,
          hours: doc.data().hours || doc.data().openingHours || doc.data().operatingHours
        }));

        const validStores = loadedStores.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng));
        setStores(validStores);
      } catch (error) {
        console.error("Failed to fetch stores", error);
        setStores([]);
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

  if (loading) return <PageSkeleton variant="landing" />;

  if (user) {
    return <Navigate to={navigationState?.returnTo || "/dashboard"} replace />;
  }

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredStores = stores.filter((store) =>
    storeMatchesFilters(store, searchQuery, selectedCategory, openNowOnly)
  );
  const categories = getStoreCategories(stores);
  const hasActiveFilters = selectedCategory !== "All" || openNowOnly || Boolean(normalizedQuery);

  return (
    <div className="min-h-screen bg-white dark:bg-[#1b1b1b] selection:bg-[#1b1b1b] selection:text-white dark:selection:bg-white dark:selection:text-[#1b1b1b] flex flex-col">
      <PublicSiteHeader
        onSignIn={() => openAuthModal("signin")}
        onSignUp={() => openAuthModal("signup")}
      />

      <main className="flex-1">
        <section className="relative pt-12 sm:pt-20 pb-20 sm:pb-32 overflow-hidden">
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/85 dark:via-[#1b1b1b]/85 to-white dark:to-[#1b1b1b] z-10 transition-colors" />
            <img
              src={getDisplayImageUrl(config.heroImageUrl)}
              alt="Hero image"
              data-eager="true"
              loading="eager"
              fetchPriority="high"
              className="w-full h-full object-cover grayscale opacity-20 dark:opacity-10"
            />
          </div>

          <div className="mx-auto max-w-7xl px-6 relative z-10">
            <div className="grid lg:grid-cols-2 gap-12 sm:gap-16 items-center">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1b1b1b] dark:bg-white border border-[#1b1b1b] dark:border-white text-white dark:text-[#1b1b1b] text-xs font-semibold tracking-wide uppercase mb-8">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white dark:bg-[#1b1b1b] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white dark:bg-[#1b1b1b]"></span>
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
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#1b1b1b] dark:bg-white px-8 py-4 text-sm font-medium text-white dark:text-[#1b1b1b] shadow-sm hover:bg-black dark:hover:bg-gray-100 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="relative">
              {/* Abstract visual representation */}
              <div className="aspect-[4/3] rounded-[2rem] bg-[#f6f6f6] dark:bg-[#202020] border border-[#1b1b1b]/10 dark:border-white/10 p-4 sm:p-8 relative overflow-hidden shadow-sm transition-colors">
                <div className="absolute inset-x-4 top-4 h-px bg-[#1b1b1b]/10 dark:bg-white/10 sm:inset-x-8 sm:top-8"></div>
                <div className="absolute inset-y-4 left-4 w-px bg-[#1b1b1b]/10 dark:bg-white/10 sm:inset-y-8 sm:left-8"></div>

                <div className="relative h-full flex flex-col items-center justify-center space-y-4 sm:space-y-6">
                  <div className="bg-white dark:bg-[#1b1b1b] p-4 sm:p-6 rounded-3xl shadow-sm border border-[#1b1b1b]/10 dark:border-white/10 w-full max-w-64 transform -rotate-3 sm:-rotate-6 transition-all hover:rotate-0 duration-500">
                    <div className="flex justify-between items-start mb-4 sm:mb-6">
                      <div className="w-12 h-12 bg-[#1b1b1b] dark:bg-white rounded-2xl flex items-center justify-center">
                        <QrCode className="w-6 h-6 text-white dark:text-[#1b1b1b]" />
                      </div>
                      <div className="flex gap-1">
                        {[1, 2, 3].map((i) => (
                          <Star key={i} className="w-4 h-4 text-[#1b1b1b] fill-[#1b1b1b] dark:text-white dark:fill-white" />
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded-lg w-3/4"></div>
                      <div className="h-3 bg-gray-50 dark:bg-gray-900 rounded-lg w-1/2"></div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-[#1b1b1b] p-4 sm:p-6 rounded-3xl shadow-sm border border-[#1b1b1b]/10 dark:border-white/10 w-full max-w-64 transform sm:translate-x-8 rotate-2 sm:rotate-3 transition-all hover:rotate-0 duration-500">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Coffee Card</span>
                      <span className="text-xs font-medium text-white dark:text-[#1b1b1b] bg-[#1b1b1b] dark:bg-white px-2 py-1 rounded-full">8/10</span>
                    </div>
                    <div className="grid grid-cols-10 gap-1.5 mb-2">
                      {[...Array(8)].map((_, i) => (
                        <div key={i} className="w-full aspect-square bg-[#1b1b1b] dark:bg-white rounded-full flex items-center justify-center">
                          <Coffee className="w-3 h-3 text-white dark:text-[#1b1b1b]" />
                        </div>
                      ))}
                      {[...Array(2)].map((_, i) => (
                        <div key={`empty-${i}`} className="w-full aspect-square bg-gray-50 dark:bg-gray-900 rounded-full border border-gray-100 dark:border-gray-800"></div>
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
        <section className="py-12 sm:py-20 border-t border-[#1b1b1b]/10 dark:border-white/10 bg-white dark:bg-[#1b1b1b] overflow-hidden relative flex flex-col items-center transition-colors">
          <p className="text-center text-xs sm:text-sm font-bold text-gray-400 dark:text-gray-500 mb-8 sm:mb-12 uppercase tracking-widest px-6">
            Trusted by local businesses
          </p>

          <div className="relative w-full overflow-hidden flex">
            {/* gradient fades for the edges */}
            <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-white dark:from-[#1b1b1b] to-transparent z-10 pointer-events-none transition-colors"></div>
            <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-white dark:from-[#1b1b1b] to-transparent z-10 pointer-events-none transition-colors"></div>

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
        <section className="bg-white dark:bg-[#1b1b1b] py-20 sm:py-32 border-t border-[#1b1b1b]/10 dark:border-white/10 transition-colors">
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
                  className="block w-full rounded-full border-0 py-4 pl-12 pr-4 text-gray-900 dark:text-white bg-white dark:bg-[#202020] shadow-sm ring-1 ring-inset ring-[#1b1b1b]/10 dark:ring-white/10 placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:ring-2 focus:ring-inset focus:ring-[#1b1b1b] dark:focus:ring-white sm:text-sm sm:leading-6 transition-colors"
                  placeholder="Search by store name or category..."
                />
              </div>
              <div className="mx-auto mt-5 max-w-3xl" aria-label="Store filters">
                <div className="flex items-center gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <button
                    type="button"
                    aria-pressed={openNowOnly}
                    onClick={() => setOpenNowOnly((current) => !current)}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                      openNowOnly
                        ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-[#1b1b1b]"
                        : "border-gray-200 text-gray-600 hover:border-gray-400 dark:border-white/10 dark:text-gray-300 dark:hover:border-white/30"
                    }`}
                  >
                    <Clock3 className="h-4 w-4" />
                    Open now
                  </button>
                  <span className="mx-1 h-6 w-px shrink-0 bg-gray-200 dark:bg-white/10" aria-hidden="true" />
                  {categories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={selectedCategory === category}
                      onClick={() => setSelectedCategory(category)}
                      className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-colors ${
                        selectedCategory === category
                          ? "border-[#1b1b1b] bg-[#1b1b1b] text-white dark:border-white dark:bg-white dark:text-[#1b1b1b]"
                          : "border-gray-200 text-gray-600 hover:border-gray-400 dark:border-white/10 dark:text-gray-300 dark:hover:border-white/30"
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex min-h-8 items-center justify-center gap-3 text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
                  <span>{filteredStores.length} {filteredStores.length === 1 ? "store" : "stores"} found</span>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        setSelectedCategory("All");
                        setOpenNowOnly(false);
                      }}
                      className="inline-flex items-center gap-1 font-medium text-gray-700 hover:text-black dark:text-gray-300 dark:hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                      Clear filters
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] overflow-hidden border border-[#1b1b1b]/10 dark:border-white/10 shadow-sm h-[400px] sm:h-[600px] relative z-0 transition-colors">
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
                           {store.logoUrl && (
                             <div className="mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                               <img
                                 src={getDisplayImageUrl(store.logoUrl)}
                                 alt={`${store.name} logo`}
                                 className="h-full w-full object-cover"
                               />
                             </div>
                           )}
                           <h3 className="font-bold text-gray-900 text-lg mb-1">{store.name}</h3>
                           <div className={`mb-2 flex items-center gap-1.5 text-xs font-medium ${isStoreOpenNow(store.hours) ? "text-emerald-700" : "text-gray-500"}`}>
                             <span className={`h-2 w-2 rounded-full ${isStoreOpenNow(store.hours) ? "bg-emerald-500" : "bg-gray-400"}`} />
                             {isStoreOpenNow(store.hours) ? "Open now" : store.hours ? "Closed now" : "Hours unavailable"}
                           </div>
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
                             <Link
                               to={`/store/${store.id}`}
                               className="w-full text-center bg-gray-900 !text-white font-medium py-2 rounded-lg text-xs hover:bg-gray-800 transition-colors"
                             >
                               View Details
                             </Link>
                             <DirectionsButton
                               destination={{ lat: store.lat, lng: store.lng, name: store.name }}
                               className="w-full bg-gray-100 text-[#1b1b1b] font-medium py-2 rounded-lg text-xs hover:bg-gray-200 transition-colors"
                             />
                           </div>
                         </div>
                       </Popup>
                     </Marker>
                   ) : null)}
                 </MapContainer>
               ) : (
                 <SkeletonBlock className="h-full w-full" />
               )}
               {mapLoaded && stores.length > 0 && filteredStores.length === 0 && (
                 <div className="pointer-events-none absolute inset-x-4 top-4 z-[500] flex justify-center">
                   <div className="rounded-2xl border border-gray-200 bg-white/95 px-5 py-3 text-center shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-[#202020]/95">
                     <p className="font-semibold text-gray-900 dark:text-white">No stores match these filters</p>
                     <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Try another category or clear the filters.</p>
                   </div>
                 </div>
               )}
            </div>
            <div className="mt-8 flex justify-center">
              <Link
                to="/stores"
                className="inline-flex items-center gap-2 rounded-full border border-[#1b1b1b] px-6 py-3 text-sm font-semibold text-[#1b1b1b] transition-colors hover:bg-[#1b1b1b] hover:text-white dark:border-white dark:text-white dark:hover:bg-white dark:hover:text-[#1b1b1b]"
              >
                Show all affiliated stores
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* Affiliate Section */}
        {config.applicationsOpen && (
          <section className="bg-[#1b1b1b] text-white py-24 sm:py-32 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-white/20"></div>
            <div className="mx-auto max-w-7xl px-6 relative z-10 text-center">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">Become a Partner Store</h2>
              <p className="text-gray-400 text-lg max-w-2xl mx-auto mb-10">
                Join our growing network of local businesses. Drive more foot traffic, build customer loyalty, and get insights into your best customers.
              </p>
              <button
                onClick={() => setShowAppModal(true)}
                className="bg-white text-[#1b1b1b] px-8 py-4 rounded-full font-medium hover:bg-gray-100 transition-colors shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#1b1b1b] focus:ring-white"
              >
                Apply to be a Partner
              </button>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-[#1b1b1b] border-t border-[#1b1b1b]/10 dark:border-white/10 pt-16 pb-8 transition-colors">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <BrandMark compact />
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
                  <a href={config.footerInfo.socialLinks.facebook} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-[#1b1b1b] dark:hover:text-white transition-colors">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path fillRule="evenodd" d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" clipRule="evenodd" />
                    </svg>
                  </a>
                )}
                {config.footerInfo.socialLinks?.instagram && (
                  <a href={config.footerInfo.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-[#1b1b1b] dark:hover:text-white transition-colors">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd" />
                    </svg>
                  </a>
                )}
                {config.footerInfo.socialLinks?.twitter && (
                  <a href={config.footerInfo.socialLinks.twitter} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-[#1b1b1b] dark:hover:text-white transition-colors">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
            <div className="md:col-span-2">
              <div className="grid grid-cols-1 gap-10 sm:grid-cols-2">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-4 transition-colors">Product</h3>
                  <ul className="space-y-3 text-sm text-gray-500 dark:text-gray-400">
                    <li><Link to="/product" className="hover:text-[#1b1b1b] dark:hover:text-white transition-colors">The Product</Link></li>
                    <li><Link to="/customers" className="hover:text-[#1b1b1b] dark:hover:text-white transition-colors">For Customers</Link></li>
                    <li><Link to="/businesses" className="hover:text-[#1b1b1b] dark:hover:text-white transition-colors">For Businesses</Link></li>
                    <li><Link to="/pricing" className="hover:text-[#1b1b1b] dark:hover:text-white transition-colors">Pricing</Link></li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-4 transition-colors">Company</h3>
                  <ul className="space-y-3 text-sm text-gray-500 dark:text-gray-400">
                    <li><Link to="/privacy" className="hover:text-[#1b1b1b] dark:hover:text-white transition-colors">Privacy Policy</Link></li>
                    <li><Link to="/data-deletion" className="hover:text-[#1b1b1b] dark:hover:text-white transition-colors">Data Deletion</Link></li>
                    <li><Link to="/terms" className="hover:text-[#1b1b1b] dark:hover:text-white transition-colors">Terms of Service</Link></li>
                    <li><Link to="/feedback" className="hover:text-[#1b1b1b] dark:hover:text-white transition-colors">Feedback</Link></li>
                  </ul>
                </div>
              </div>
              <div className="mt-10 border-t border-gray-100 pt-8 dark:border-gray-800">
                <NewsletterForm />
              </div>
            </div>
          </div>
          <div className="border-t border-gray-100 dark:border-gray-800 pt-8 flex justify-center text-xs text-gray-400 dark:text-gray-500 transition-colors">
            <p>&copy; {new Date().getFullYear()} PerkUp. All rights reserved.</p>
          </div>
        </div>
      </footer>

      <AuthModal isOpen={showAuthModal} onClose={closeAuthModal} initialMode={authMode} />
      <PartnerApplicationModal isOpen={showAppModal} onClose={() => setShowAppModal(false)} />
    </div>
  );
}
