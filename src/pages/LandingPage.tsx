import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { AUTH_REDIRECT_MESSAGE_KEY, GOOGLE_SIGNUP_PENDING_KEY, db } from "../lib/backend";
import { QrCode, Star, Coffee, ArrowRight, MapPin, Pizza, Scissors, BookOpen, Shirt, Dumbbell, Glasses, Anchor, Search, Store as StoreIcon, Mail, Phone, Clock3, X, UserRound } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { collection, query, where, getDocs } from "@/src/lib/dataCompat";
import { BrandMark } from "../components/BrandMark";
import { AuthModal } from "../components/AuthModal";
import { PublicSiteHeader } from "../components/PublicSiteHeader";
import { getDisplayImageUrl } from "../lib/imageStorage";
import { PageSkeleton, SkeletonBlock } from "../components/LoadingSkeleton";
import { DirectoryStore, getStoreCategories, isStoreOpenNow, isStorePubliclyVisible, storeMatchesCategorySearch } from "../lib/storeDirectory";
import { CategorySearchInput } from "../components/CategorySearchInput";

import { PartnerApplicationModal } from "../components/PartnerApplicationModal";
import { PartnerApplicationTrackingModal } from "../components/PartnerApplicationTrackingModal";
import { NewsletterForm } from "../components/NewsletterForm";
import { GetStartedModal } from "../components/GetStartedModal";
import { HomepageVideoPlayer } from "../components/HomepageVideoPlayer";
import { DEFAULT_HOW_IT_WORKS_CONFIG, isValidVideoLink, normalizeHowItWorksConfig } from "../lib/homepageVideos";

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

const LandingStoreMap = lazy(() => import("../components/LandingStoreMap"));

const DEFAULT_MAP_CENTER: [number, number] = [7.4478, 125.8078];
const DEFAULT_HERO_IMAGE_URL = "https://images.unsplash.com/photo-1554118811-1e0d58224f24?q=35&w=1280&auto=format&fit=crop";

const getResponsiveHeroImage = (value: string) => {
  const src = getDisplayImageUrl(value);

  try {
    const source = new URL(src);
    if (source.hostname !== "images.unsplash.com") return { src };

    const variant = (width: number) => {
      const url = new URL(source);
      url.searchParams.set("auto", "format");
      url.searchParams.set("fit", "crop");
      url.searchParams.set("q", "35");
      url.searchParams.set("w", String(width));
      return url.toString();
    };

    return {
      src: variant(1280),
      srcSet: [640, 768, 960, 1280, 1600].map((width) => `${variant(width)} ${width}w`).join(", "),
    };
  } catch {
    return { src };
  }
};

export default function LandingPage() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigationState = location.state as AuthNavigationState | null;
  const [stores, setStores] = useState<DirectoryStore[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapInViewport, setMapInViewport] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showGetStartedModal, setShowGetStartedModal] = useState(false);
  const [showAppModal, setShowAppModal] = useState(false);
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [config, setConfig] = useState<any>({
    heroHeadline: "Reward your \nbest customers.",
    heroSubheadline: "Ditch the paper punch cards. Perk is a minimal, fast, and secure digital loyalty system that runs right in your browser. No apps to install.",
    heroImageUrl: DEFAULT_HERO_IMAGE_URL,
    trustedBusinesses: [],
    usePartnerStores: false,
    animateTrustedBusinesses: true,
    applicationsOpen: true,
    howItWorks: DEFAULT_HOW_IT_WORKS_CONFIG,
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
    const pendingSignup = window.sessionStorage.getItem(GOOGLE_SIGNUP_PENDING_KEY);
    const pendingGoogleSignup = pendingSignup?.includes('"provider":"google"');
    if (!loading && !user && (redirectMessage || pendingGoogleSignup || navigationState?.authRequired)) {
      setAuthMode(pendingGoogleSignup ? "signup" : "signin");
      setShowAuthModal(true);
    }
  }, [loading, navigationState?.authRequired, user]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("partner") === "true") setShowAppModal(true);
    if (params.get("track") === "true") setShowTrackingModal(true);
  }, [location.search]);

  const closeAuthModal = () => {
    setShowAuthModal(false);
  };

  useEffect(() => {
    async function fetchStores() {
      try {
        const q = query(collection(db, "stores"), where("status", "==", "active"));
        const snap = await getDocs(q);

        const loadedStores = snap.docs.filter((doc) => isStorePubliclyVisible(doc.data())).map(doc => ({
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
            howItWorks: normalizeHowItWorksConfig(data.howItWorks),
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

  useEffect(() => {
    if (loading || mapInViewport) return;
    const container = mapContainerRef.current;
    if (!container || typeof IntersectionObserver === "undefined") {
      setMapInViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setMapInViewport(true);
        observer.disconnect();
      },
      { rootMargin: "100px 0px" },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [loading, mapInViewport]);

  if (loading) return <PageSkeleton variant="landing" />;

  if (user) {
    return <Navigate to={navigationState?.returnTo || "/dashboard"} replace />;
  }

  const categories = getStoreCategories(stores);
  const filteredStores = stores.filter((store) =>
    storeMatchesCategorySearch(store, searchQuery, categories, [store.contact]) &&
    (!openNowOnly || isStoreOpenNow(store.hours))
  );
  const mapCenter: [number, number] = stores[0]?.lat !== undefined && stores[0]?.lng !== undefined
    ? [stores[0].lat, stores[0].lng]
    : DEFAULT_MAP_CENTER;
  const hasActiveFilters = openNowOnly || Boolean(searchQuery.trim());
  const heroImage = getResponsiveHeroImage(config.heroImageUrl);
  const trustedBusinesses = config.usePartnerStores && stores.length > 0
    ? stores
    : config.trustedBusinesses?.length > 0
      ? config.trustedBusinesses
      : LOGOS;
  const shouldAnimateTrustedBusinesses = config.animateTrustedBusinesses !== false && trustedBusinesses.length > 0;
  const homepageVideos = normalizeHowItWorksConfig(config.howItWorks);
  const publishedHomepageVideos = homepageVideos.videos.filter((video) => video.enabled && isValidVideoLink(video.url));
  // Keep each half of the marquee wider than the page so a small set of
  // businesses can loop continuously without leaving an empty gap.
  const marqueeBusinesses = shouldAnimateTrustedBusinesses
    ? Array.from(
        { length: Math.max(6, trustedBusinesses.length) },
        (_, index) => trustedBusinesses[index % trustedBusinesses.length],
      )
    : trustedBusinesses;

  return (
    <div className="min-h-screen bg-white dark:bg-[#1b1b1b] selection:bg-[#1b1b1b] selection:text-white dark:selection:bg-white dark:selection:text-[#1b1b1b] flex flex-col">
      <PublicSiteHeader
        onSignIn={() => openAuthModal("signin")}
        onSignUp={() => openAuthModal("signup")}
        onTrack={() => setShowTrackingModal(true)}
      />

      <main className="flex-1">
        <section className="relative pt-12 sm:pt-20 pb-20 sm:pb-32 overflow-hidden">
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/85 dark:via-[#1b1b1b]/85 to-white dark:to-[#1b1b1b] z-10 transition-colors" />
            <img
              src={heroImage.src}
              srcSet={heroImage.srcSet}
              sizes="100vw"
              alt=""
              aria-hidden="true"
              data-image-viewer-ignore="true"
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
                onClick={() => setShowGetStartedModal(true)}
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
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Coffee Card</span>
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
          <p className="text-center text-xs sm:text-sm font-bold text-gray-600 dark:text-gray-300 mb-8 sm:mb-12 uppercase tracking-widest px-6">
            Trusted by local businesses
          </p>

          <div className={`relative flex w-full ${shouldAnimateTrustedBusinesses ? "overflow-hidden" : "overflow-x-auto px-6"}`}>
            {/* gradient fades for the edges */}
            {shouldAnimateTrustedBusinesses && (
              <>
                <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-white dark:from-[#1b1b1b] to-transparent z-10 pointer-events-none transition-colors"></div>
                <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-white dark:from-[#1b1b1b] to-transparent z-10 pointer-events-none transition-colors"></div>
              </>
            )}

            <div className={`flex w-max min-w-full transition-opacity duration-500 ${shouldAnimateTrustedBusinesses ? "animate-scroll" : "justify-center"}`}>
              {(shouldAnimateTrustedBusinesses ? [0, 1] : [0]).map((groupIndex) => (
                <div key={groupIndex} className="flex shrink-0" aria-hidden={groupIndex === 1 ? "true" : undefined}>
                  {marqueeBusinesses.map((business: any, idx: number) => {
                    const FallbackIcon = business.icon || StoreIcon;
                    return (
                      <div key={`${business.id || business.name}-${idx}`} className="flex w-64 shrink-0 flex-col items-center justify-center gap-4 opacity-90 transition-opacity duration-300 hover:opacity-100">
                        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-3xl border border-gray-200 bg-gray-100 text-gray-600 shadow-sm transition-all duration-300 hover:-rotate-3 hover:scale-105 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                          {business.logoUrl ? (
                            <img
                              src={getDisplayImageUrl(business.logoUrl)}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                              alt={`${business.name} logo`}
                            />
                          ) : (
                            <FallbackIcon className="w-8 h-8" />
                          )}
                        </div>
                        <span className="font-semibold tracking-tight text-gray-600 dark:text-gray-300">{business.name}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>

        {homepageVideos.enabled && publishedHomepageVideos.length > 0 && (
          <section className="border-t border-[#1b1b1b]/10 bg-gray-50 py-20 transition-colors dark:border-white/10 dark:bg-[#181818] sm:py-28" aria-labelledby="how-it-works-heading">
            <div className="mx-auto max-w-7xl px-4 sm:px-6">
              <div className="mx-auto max-w-3xl text-center">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Demo accounts</p>
                <h2 id="how-it-works-heading" className="mt-3 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
                  {homepageVideos.heading}
                </h2>
                <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-gray-500 dark:text-gray-400 sm:text-lg">
                  {homepageVideos.subheading}
                </p>
              </div>

              <div className={`mx-auto mt-12 grid gap-6 ${publishedHomepageVideos.length > 1 ? "max-w-6xl lg:grid-cols-2" : "max-w-3xl"}`}>
                {publishedHomepageVideos.map((video) => {
                  const isBusiness = video.audience === "business";
                  const AudienceIcon = isBusiness ? StoreIcon : UserRound;
                  return (
                    <article key={video.id} className="min-w-0 overflow-hidden rounded-[2rem] border border-gray-200 bg-white p-3 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:border-gray-800 dark:bg-[#202020] sm:p-5">
                      <HomepageVideoPlayer url={video.url} title={video.title} />
                      <div className="px-1 pb-2 pt-5 sm:px-2">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                            <AudienceIcon className="h-4 w-4" />
                          </span>
                          {isBusiness ? "Owner / business demo" : "Customer demo"}
                        </div>
                        <h3 className="mt-4 text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">{video.title}</h3>
                        {video.description && <p className="mt-2 leading-6 text-gray-500 dark:text-gray-400">{video.description}</p>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        )}

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

              <CategorySearchInput
                  value={searchQuery}
                  onChange={setSearchQuery}
                  categories={categories}
                  resultsId="landing-store-search-results"
                  wrapperClassName="mx-auto max-w-md"
                  className="block w-full rounded-full border-0 py-4 pl-12 pr-12 text-gray-900 dark:text-white bg-white dark:bg-[#202020] shadow-sm ring-1 ring-inset ring-[#1b1b1b]/10 dark:ring-white/10 placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:ring-2 focus:ring-inset focus:ring-[#1b1b1b] dark:focus:ring-white sm:text-sm sm:leading-6 transition-colors"
              />
              <div className="mx-auto mt-5 max-w-3xl" aria-label="Store filters">
                <div className="flex items-center justify-center gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                </div>
                <div className="mt-2 flex min-h-8 items-center justify-center gap-3 text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
                  <span>{filteredStores.length} {filteredStores.length === 1 ? "store" : "stores"} found</span>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
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

            <div ref={mapContainerRef} id="landing-store-search-results" className="scroll-mt-6 rounded-[2rem] overflow-hidden border border-[#1b1b1b]/10 dark:border-white/10 shadow-sm h-[400px] sm:h-[600px] relative z-0 transition-colors">
               {mapLoaded && mapInViewport ? (
                 <Suspense fallback={<SkeletonBlock className="h-full w-full" />}>
                   <LandingStoreMap stores={filteredStores} center={mapCenter} />
                 </Suspense>
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
              <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
                <button
                  onClick={() => setShowAppModal(true)}
                  className="inline-flex items-center justify-center rounded-full bg-white px-8 py-4 font-medium text-[#1b1b1b] shadow-lg transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#1b1b1b]"
                >
                  Apply to be a Partner
                </button>
                <button
                  onClick={() => setShowTrackingModal(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/30 px-8 py-4 font-medium text-white transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#1b1b1b]"
                >
                  <Search className="h-4 w-4" />
                  Track Application
                </button>
              </div>
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
          <div className="border-t border-gray-100 dark:border-gray-800 pt-8 flex justify-center text-xs text-gray-500 dark:text-gray-400 transition-colors">
            <p>&copy; {new Date().getFullYear()} Perk. All rights reserved.</p>
          </div>
        </div>
      </footer>

      <GetStartedModal
        isOpen={showGetStartedModal}
        onClose={() => setShowGetStartedModal(false)}
        onCustomerSelect={() => {
          setShowGetStartedModal(false);
          openAuthModal("signup");
        }}
        onBusinessSelect={() => {
          setShowGetStartedModal(false);
          setShowAppModal(true);
        }}
      />
      <AuthModal isOpen={showAuthModal} onClose={closeAuthModal} initialMode={authMode} />
      <PartnerApplicationModal isOpen={showAppModal} onClose={() => setShowAppModal(false)} />
      <PartnerApplicationTrackingModal isOpen={showTrackingModal} onClose={() => setShowTrackingModal(false)} />
    </div>
  );
}
