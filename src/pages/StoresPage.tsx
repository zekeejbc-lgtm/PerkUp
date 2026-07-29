import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarDays, Clock3, MapPin, SlidersHorizontal, Store, X } from "lucide-react";
import { AuthModal } from "../components/AuthModal";
import { DirectionsButton } from "../components/DirectionsButton";
import { PublicSiteHeader } from "../components/PublicSiteHeader";
import { PublicSiteFooter } from "../components/PublicPageShell";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/backend";
import { collection, getDocs, query, where } from "../lib/dataCompat";
import { getDisplayImageUrl } from "../lib/imageStorage";
import {
  DirectoryStore,
  getAvailableStoreCategories,
  isStoreOpenNow,
  isStorePubliclyVisible,
  storeMatchesCategorySearch,
} from "../lib/storeDirectory";
import { CategorySearchInput } from "../components/CategorySearchInput";
import { SkeletonBlock } from "../components/LoadingSkeleton";
import { ScrollableRegion } from "../components/ScrollableRegion";
import { Pagination } from "../components/Pagination";
import { useCollectionPagination } from "../hooks/useCollectionPagination";

export default function StoresPage() {
  const { user, loading: authLoading } = useAuth();
  const [stores, setStores] = useState<DirectoryStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [availabilityDate, setAvailabilityDate] = useState("");
  const [availabilityTime, setAvailabilityTime] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    let active = true;

    const loadStores = async () => {
      try {
        const snapshot = await getDocs(query(collection(db, "stores"), where("status", "==", "active")));
        if (!active) return;
        setStores(snapshot.docs.filter((storeDocument) => isStorePubliclyVisible(storeDocument.data())).map((storeDocument) => {
          const data = storeDocument.data();
          return {
            id: storeDocument.id,
            name: String(data.name || "Affiliated store"),
            lat: Number.isFinite(Number(data.lat ?? data.latitude)) ? Number(data.lat ?? data.latitude) : undefined,
            lng: Number.isFinite(Number(data.lng ?? data.longitude)) ? Number(data.lng ?? data.longitude) : undefined,
            description: data.description ? String(data.description) : undefined,
            contact: data.contact ? String(data.contact) : undefined,
            logoUrl: data.logoUrl ? String(data.logoUrl) : undefined,
            category: data.category ? String(data.category) : undefined,
            hours: data.hours || data.openingHours || data.operatingHours
              ? String(data.hours || data.openingHours || data.operatingHours)
              : undefined,
          };
        }));
      } catch (loadError) {
        console.error("Failed to fetch affiliated stores", loadError);
        if (active) setError("The store directory could not be loaded. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadStores();
    return () => {
      active = false;
    };
  }, []);

  const availableAt = useMemo(() => {
    if (!availabilityDate || !availabilityTime) return null;
    const [year, month, day] = availabilityDate.split("-").map(Number);
    const [hour, minute] = availabilityTime.split(":").map(Number);
    const value = new Date(year, month - 1, day, hour, minute);
    return Number.isNaN(value.getTime()) ? null : value;
  }, [availabilityDate, availabilityTime]);

  const categories = useMemo(() => getAvailableStoreCategories(stores), [stores]);
  const filteredStores = useMemo(
    () => stores.filter((store) =>
      storeMatchesCategorySearch(store, searchQuery, categories) &&
      ((!openNowOnly && !availableAt) || isStoreOpenNow(store.hours, availableAt || new Date()))
    ),
    [availableAt, categories, openNowOnly, searchQuery, stores],
  );
  const hasActiveFilters = Boolean(searchQuery.trim()) || openNowOnly || Boolean(availabilityDate) || Boolean(availabilityTime);
  const storePagination = useCollectionPagination(filteredStores, 12);

  const openAuthModal = (mode: "signin" | "signup") => {
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setOpenNowOnly(false);
    setAvailabilityDate("");
    setAvailabilityTime("");
  };

  return (
    <div className="flex min-h-screen flex-col bg-white text-[#1b1b1b] transition-colors dark:bg-[#1b1b1b] dark:text-white">
      <PublicSiteHeader
        onSignIn={() => openAuthModal("signin")}
        onSignUp={() => openAuthModal("signup")}
      />

      <main className="flex-1">
        <section className="border-b border-[#1b1b1b]/10 px-6 pb-12 pt-7 dark:border-white/10 sm:pb-16 sm:pt-9">
          <div className="mx-auto max-w-6xl">
            {authLoading ? <SkeletonBlock className="h-5 w-36 rounded-lg" /> : <Link
              to={user ? "/dashboard" : "/"}
              className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-[#1b1b1b] dark:text-gray-400 dark:hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              {user ? "Back to dashboard" : "Back to homepage"}
            </Link>}
            <div className="mx-auto mt-10 max-w-3xl text-center sm:mt-12">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
                Perk partners
              </p>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">All affiliated stores</h1>
              <p className="mx-auto mt-3 max-w-2xl text-base text-gray-500 dark:text-gray-400 sm:text-lg">
                Browse every business using Perk and find where to earn and redeem your rewards.
              </p>
            </div>

            <div className="mx-auto mt-8 max-w-4xl">
              <CategorySearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                categories={categories}
                resultsId="public-store-search-results"
                className="w-full rounded-full border-0 bg-white py-4 pl-13 pr-12 text-gray-900 shadow-sm ring-1 ring-inset ring-[#1b1b1b]/10 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-[#1b1b1b] dark:bg-[#202020] dark:text-white dark:ring-white/10 dark:placeholder:text-gray-600 dark:focus:ring-white"
              />

              <div className="mt-5 rounded-3xl border border-gray-200 bg-gray-50/70 p-4 text-left dark:border-white/10 dark:bg-[#202020] sm:p-5">
                <div className="mb-4 flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-gray-400" />
                  <h2 className="text-sm font-semibold">Filter stores</h2>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
                  <button
                    type="button"
                    aria-pressed={openNowOnly}
                    onClick={() => {
                      setOpenNowOnly((current) => !current);
                      setAvailabilityDate("");
                      setAvailabilityTime("");
                    }}
                    className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors ${
                      openNowOnly
                        ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-[#1b1b1b]"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-400 dark:border-white/10 dark:bg-[#252525] dark:text-gray-300"
                    }`}
                  >
                    <Clock3 className="h-4 w-4" />
                    Open now
                  </button>

                  <label className="relative">
                    <span className="sr-only">Availability date</span>
                    <CalendarDays className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="date"
                      value={availabilityDate}
                      onChange={(event) => {
                        setAvailabilityDate(event.target.value);
                        setOpenNowOnly(false);
                      }}
                      className="min-h-12 w-full rounded-xl border border-gray-200 bg-white pl-11 pr-3 text-sm text-gray-700 outline-none focus:border-gray-400 dark:border-white/10 dark:bg-[#252525] dark:text-gray-200 dark:[color-scheme:dark]"
                    />
                  </label>

                  <label className="relative">
                    <span className="sr-only">Availability time</span>
                    <Clock3 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="time"
                      value={availabilityTime}
                      onChange={(event) => {
                        setAvailabilityTime(event.target.value);
                        setOpenNowOnly(false);
                      }}
                      className="min-h-12 w-full rounded-xl border border-gray-200 bg-white pl-11 pr-3 text-sm text-gray-700 outline-none focus:border-gray-400 dark:border-white/10 dark:bg-[#252525] dark:text-gray-200 dark:[color-scheme:dark]"
                    />
                  </label>
                </div>

                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  Select both a date and time to find stores available then.
                </p>

              </div>

              <div className="mt-2 flex min-h-8 items-center justify-center gap-3 text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
                {!loading && <span>{filteredStores.length} {filteredStores.length === 1 ? "store" : "stores"} found</span>}
                {hasActiveFilters && (
                  <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 font-medium text-gray-700 hover:text-black dark:text-gray-300 dark:hover:text-white">
                    <X className="h-3.5 w-3.5" />
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        <section id="public-store-search-results" className="scroll-mt-6 px-6 py-12 sm:py-16">
          <div className="mx-auto max-w-7xl">
            {loading ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((item) => (
                  <div key={item} className="overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#202020]">
                    <div className="flex items-start gap-4">
                      <SkeletonBlock className="h-16 w-16 shrink-0 rounded-2xl" />
                      <div className="min-w-0 flex-1 space-y-3"><SkeletonBlock className="h-5 w-3/4 rounded-lg" /><SkeletonBlock className="h-4 w-1/2 rounded-lg" /></div>
                    </div>
                    <div className="mt-6 space-y-3"><SkeletonBlock className="h-4 w-full rounded-lg" /><SkeletonBlock className="h-4 w-5/6 rounded-lg" /></div>
                    <div className="mt-6 flex gap-3"><SkeletonBlock className="h-10 flex-1 rounded-xl" /><SkeletonBlock className="h-10 w-10 rounded-xl" /></div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="rounded-[1.75rem] border border-red-200 bg-red-50 px-6 py-12 text-center text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </div>
            ) : filteredStores.length === 0 ? (
              <div className="rounded-[1.75rem] border border-gray-200 px-6 py-16 text-center dark:border-white/10">
                <Store className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
                <h2 className="mt-4 text-lg font-semibold">No stores match these filters</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Try another category or clear your filters.</p>
                <button type="button" onClick={clearFilters} className="mt-5 rounded-full bg-[#1b1b1b] px-5 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-[#1b1b1b]">
                  Clear filters
                </button>
              </div>
            ) : (
              <>
              <ScrollableRegion label="Store directory results" className="grid gap-5 pr-1 sm:grid-cols-2 lg:grid-cols-3">
                {storePagination.pageItems.map((store) => {
                  const openNow = isStoreOpenNow(store.hours, availableAt || new Date());
                  return (
                    <article key={store.id} className="flex flex-col overflow-hidden rounded-[1.75rem] border border-[#1b1b1b]/10 bg-white p-5 shadow-sm transition-transform hover:-translate-y-1 dark:border-white/10 dark:bg-[#202020]">
                      <div className="flex items-start gap-4">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 dark:border-white/10 dark:bg-[#282828]">
                          {store.logoUrl ? (
                            <img src={getDisplayImageUrl(store.logoUrl)} alt={`${store.name} logo`} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                          ) : (
                            <Store className="h-7 w-7 text-gray-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{store.category || "Partner store"}</p>
                          {store.publicId && <p className="mt-1 font-mono text-[10px] font-semibold text-gray-400">{store.publicId}</p>}
                          <h2 className="mt-1 truncate text-xl font-bold">{store.name}</h2>
                          <div className={`mt-1 flex items-center gap-1.5 text-xs font-medium ${openNow ? "text-emerald-600 dark:text-emerald-400" : "text-gray-500"}`}>
                            <span className={`h-2 w-2 rounded-full ${openNow ? "bg-emerald-500" : "bg-gray-400"}`} />
                            {availableAt
                              ? openNow ? "Available then" : "Unavailable then"
                              : openNow ? "Open now" : store.hours ? "Closed now" : "Hours unavailable"}
                          </div>
                        </div>
                      </div>

                      <p className="mt-5 line-clamp-3 min-h-15 text-sm leading-6 text-gray-500 dark:text-gray-400">
                        {store.description || "Earn and redeem Perk rewards at this affiliated store."}
                      </p>

                      {store.contact && (
                        <div className="mt-4 flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span className="line-clamp-2">{store.contact}</span>
                        </div>
                      )}

                      <div className="mt-auto flex gap-2 pt-6">
                        <Link
                          to={`/store/${store.id}`}
                          state={{ storesPath: "/stores" }}
                          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1b1b1b] px-4 py-2.5 text-sm font-medium text-white hover:bg-black dark:bg-white dark:text-[#1b1b1b] dark:hover:bg-gray-100"
                        >
                          View details
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                        {store.lat !== undefined && store.lng !== undefined && (
                          <DirectionsButton
                            destination={{ lat: store.lat, lng: store.lng, name: store.name }}
                            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/5"
                          />
                        )}
                      </div>
                    </article>
                  );
                })}
              </ScrollableRegion>
              <Pagination {...storePagination} onPageChange={storePagination.setPage} itemLabel="stores" />
              </>
            )}
          </div>
        </section>
      </main>

      <PublicSiteFooter />
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} initialMode={authMode} />
    </div>
  );
}
