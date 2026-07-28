import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, query, where, getDocs } from "@/src/lib/dataCompat";
import { db, handleDataError, OperationType } from "../../lib/backend";
import { MapContainer, Marker, Popup } from "react-leaflet";
import {
  CalendarDays,
  ChevronDown,
  Clock,
  Clock3,
  Eye,
  EyeOff,
  Mail,
  MapPin,
  Phone,
  SlidersHorizontal,
  Store as StoreIcon,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { SkeletonBlock } from "../../components/LoadingSkeleton";
import { DirectionsButton } from "../../components/DirectionsButton";
import { MapBaseLayers } from "../../components/MapBaseLayers";
import { createCustomerStoreMapPin } from "../../components/CustomerStoreMapPin";
import { getDisplayImageUrl } from "../../lib/imageStorage";
import { groupCustomerMapLocations } from "../../lib/customerMapMarkers";
import { getAvailableStoreCategories, isStoreOpenNow, isStorePubliclyVisible, storeMatchesCategorySearch } from "../../lib/storeDirectory";
import { CategorySearchInput } from "../../components/CategorySearchInput";

type CustomerStore = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  logoUrl?: string;
  category?: string;
  address?: string;
  contact?: string;
  email?: string;
  hours?: string;
  description?: string;
};

export default function CustomerStores() {
  const navigate = useNavigate();
  const [stores, setStores] = useState<CustomerStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showMap, setShowMap] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [availabilityDate, setAvailabilityDate] = useState("");
  const [availabilityTime, setAvailabilityTime] = useState("");

  useEffect(() => {
    async function fetchStores() {
      try {
        const q = query(collection(db, "stores"), where("status", "==", "active"));
        const querySnapshot = await getDocs(q);
        const fetchedStores = querySnapshot.docs.filter((doc) => isStorePubliclyVisible(doc.data())).map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            name: String(data.name || data.storeName || data.businessName || "Store"),
            lat: Number(data.lat ?? data.latitude),
            lng: Number(data.lng ?? data.longitude),
            logoUrl: data.logoUrl ? String(data.logoUrl) : "",
            category: data.category ? String(data.category) : "",
            address: data.address ? String(data.address) : "",
            contact: data.contact ? String(data.contact) : "",
            email: data.email ? String(data.email) : "",
            hours: data.hours || data.openingHours || data.operatingHours
              ? String(data.hours || data.openingHours || data.operatingHours)
              : "",
            description: data.description ? String(data.description) : "",
          };
        });
        setStores(fetchedStores);
      } catch (error) {
        handleDataError(error, OperationType.GET, "stores");
      } finally {
        setLoading(false);
      }
    }
    fetchStores();
    setMapLoaded(true);
  }, []);

  const availableAt = useMemo(() => {
    if (!availabilityDate || !availabilityTime) return null;
    const [year, month, day] = availabilityDate.split("-").map(Number);
    const [hour, minute] = availabilityTime.split(":").map(Number);
    const value = new Date(year, month - 1, day, hour, minute);
    return Number.isNaN(value.getTime()) ? null : value;
  }, [availabilityDate, availabilityTime]);

  const categories = useMemo(() => getAvailableStoreCategories(stores), [stores]);
  const filteredStores = useMemo(() => {
    return stores.filter((store) =>
      storeMatchesCategorySearch(store, searchQuery, categories, [store.address, store.contact, store.email]) &&
      ((!openNowOnly && !availableAt) || isStoreOpenNow(store.hours, availableAt || new Date()))
    );
  }, [availableAt, categories, openNowOnly, searchQuery, stores]);
  const mappedStores = useMemo(
    () => filteredStores.filter((store) => Number.isFinite(store.lat) && Number.isFinite(store.lng)),
    [filteredStores],
  );
  const storeGroups = useMemo(() => groupCustomerMapLocations(mappedStores), [mappedStores]);
  const hasActiveFilters = openNowOnly || Boolean(availabilityDate) || Boolean(availabilityTime);

  const clearFilters = () => {
    setOpenNowOnly(false);
    setAvailabilityDate("");
    setAvailabilityTime("");
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="space-y-3">
            <SkeletonBlock className="h-8 w-56 rounded-xl" />
            <SkeletonBlock className="h-4 w-96 max-w-full rounded-lg" />
          </div>
          <SkeletonBlock className="h-10 w-full rounded-xl sm:w-64" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SkeletonBlock className="h-[400px] rounded-[2rem]" />
          <div className="space-y-4">
            <SkeletonBlock className="h-20 rounded-2xl" />
            <SkeletonBlock className="h-20 rounded-2xl" />
            <SkeletonBlock className="h-20 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Affiliated Stores</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Discover places where you can earn and redeem rewards.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <CategorySearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              categories={categories}
              resultsId="customer-store-search-results"
              placeholder="Search stores, locations, or categories (use commas)..."
              wrapperClassName="min-w-0 flex-1"
              searchIconClassName="h-4 w-4"
              className="block min-h-11 w-full rounded-xl border border-gray-200 bg-white py-2 pl-10 pr-12 text-gray-900 transition-colors placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1b1b1b]/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:focus:border-gray-500 dark:focus:ring-white/10 sm:text-sm"
          />
          <button
            type="button"
            aria-expanded={showFilters}
            aria-controls="customer-store-filters"
            onClick={() => setShowFilters((current) => !current)}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors ${
              showFilters || hasActiveFilters
                ? "border-[#1b1b1b] bg-[#1b1b1b] text-white dark:border-white dark:bg-white dark:text-[#1b1b1b]"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {hasActiveFilters && <span className="h-2 w-2 rounded-full bg-emerald-400" aria-label="Filters active" />}
            <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${showFilters ? "rotate-180" : ""}`} />
          </button>
          <button
            type="button"
            aria-pressed={showMap}
            onClick={() => setShowMap((current) => !current)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            {showMap ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showMap ? "Hide map" : "Show map"}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {showFilters && (
          <motion.section
            id="customer-store-filters"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: { duration: 0.3, ease: "easeInOut" }, opacity: { duration: 0.2 } }}
            className="overflow-hidden"
          >
            <div className="rounded-3xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-900/70 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Filter stores</h3>
                </div>
                {hasActiveFilters && (
                  <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-black dark:text-gray-300 dark:hover:text-white">
                    <X className="h-3.5 w-3.5" />
                    Clear filters
                  </button>
                )}
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
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
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
                    className="min-h-12 w-full rounded-xl border border-gray-200 bg-white pl-11 pr-3 text-sm text-gray-700 outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:[color-scheme:dark]"
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
                    className="min-h-12 w-full rounded-xl border border-gray-200 bg-white pl-11 pr-3 text-sm text-gray-700 outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:[color-scheme:dark]"
                  />
                </label>
              </div>
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Select both a date and time to find stores available then.</p>

            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <motion.div id="customer-store-search-results" layout className={`scroll-mt-6 grid grid-cols-1 gap-6 ${showMap ? "lg:grid-cols-2" : ""}`}>
        <AnimatePresence initial={false}>
          {showMap && (
          <motion.div
            key="stores-map"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="relative z-0 h-[min(70vh,44rem)] min-h-[400px] overflow-hidden rounded-[2rem] border border-gray-200 shadow-sm transition-colors dark:border-gray-800"
          >
            {mapLoaded && mappedStores.length > 0 ? (
              <MapContainer 
                center={[mappedStores[0].lat, mappedStores[0].lng]} 
                zoom={14} 
                style={{ height: "100%", width: "100%" }}
              >
                <MapBaseLayers />
                {storeGroups.map((group) => {
                    const store = group.items[0];
                    const isGroup = group.items.length > 1;
                    const logoUrl = getDisplayImageUrl(store.logoUrl || "");
                    
                    return (
                      <Marker
                        key={group.key}
                        position={group.position}
                        icon={createCustomerStoreMapPin(group)}
                        title={isGroup ? `${group.items.length} shops at this location` : `${store.name} location`}
                        alt={isGroup ? `${group.items.length} shops at this location` : `${store.name} location`}
                      >
                        <Popup className="rounded-xl">
                          {isGroup ? (
                            <div className="w-64 p-1">
                              <p className="mb-3 font-bold text-gray-900">{group.items.length} shops at this location</p>
                              <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                                {group.items.map((groupedStore) => {
                                  const groupedLogoUrl = getDisplayImageUrl(groupedStore.logoUrl || "");
                                  return (
                                    <div key={groupedStore.id} className="rounded-xl border border-gray-200 p-3">
                                      <div className="flex items-center gap-3">
                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 text-gray-700">
                                          {groupedLogoUrl ? (
                                            <img src={groupedLogoUrl} alt={`${groupedStore.name} logo`} className="h-full w-full object-contain" />
                                          ) : (
                                            <StoreIcon className="h-5 w-5" />
                                          )}
                                        </div>
                                        <div className="min-w-0">
                                          <p className="truncate font-semibold text-gray-900">{groupedStore.name}</p>
                                          <p className="truncate text-xs text-gray-500">{groupedStore.category || "Retail"}</p>
                                        </div>
                                      </div>
                                      <div className="mt-3 grid grid-cols-2 gap-2">
                                        <Link
                                          to={`/store/${groupedStore.id}`}
                                          state={{ storesPath: "/customer/stores" }}
                                          className="rounded-lg bg-gray-900 px-2 py-2 text-center text-xs font-medium text-white"
                                        >
                                          View details
                                        </Link>
                                        <DirectionsButton
                                          destination={{ lat: groupedStore.lat, lng: groupedStore.lng, address: groupedStore.address, name: groupedStore.name }}
                                          className="rounded-lg bg-gray-100 px-2 py-2 text-xs font-medium text-[#1b1b1b]"
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                          <div className="w-56 p-1">
                            <div className="flex items-center gap-3">
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100 text-gray-700">
                                {logoUrl ? (
                                  <img src={logoUrl} alt={`${store.name} logo`} className="h-full w-full object-contain" />
                                ) : (
                                  <StoreIcon className="h-5 w-5" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <h3 className="truncate font-semibold text-gray-900">{store.name}</h3>
                                <p className="text-xs text-gray-500">{store.category || "Retail"}</p>
                              </div>
                            </div>
                            {store.address && <p className="mt-3 text-xs leading-relaxed text-gray-600">{store.address}</p>}
                            {store.hours && <p className="mt-1 text-xs text-gray-500">{store.hours}</p>}
                            <div className="mt-3 flex flex-col gap-2">
                              <Link
                                to={`/store/${store.id}`}
                                state={{ storesPath: "/customer/stores" }}
                                className="w-full rounded-lg bg-gray-900 px-3 py-2 text-center text-xs font-medium text-white transition-colors hover:bg-gray-800"
                              >
                                View Details
                              </Link>
                              <DirectionsButton
                                destination={{ lat: store.lat, lng: store.lng, address: store.address, name: store.name }}
                                className="w-full rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-[#1b1b1b] hover:bg-gray-200"
                              />
                            </div>
                          </div>
                          )}
                        </Popup>
                      </Marker>
                    );
                })}
              </MapContainer>
            ) : (
              <div className="h-full w-full bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <p className="text-gray-400">Map unavailable</p>
              </div>
            )}
          </motion.div>
          )}
        </AnimatePresence>

        <motion.div layout className="min-h-0">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300" aria-live="polite">
              {filteredStores.length} {filteredStores.length === 1 ? "store" : "stores"} found
            </p>
            <p className="text-xs text-gray-400">Scroll to browse</p>
          </div>
          <div className="h-[min(70vh,41.75rem)] min-h-[350px] space-y-4 overflow-y-auto overscroll-contain pr-2 [scrollbar-gutter:stable]">
          {filteredStores.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl border border-dashed border-gray-300 dark:border-gray-700 text-center">
              <p className="text-gray-500 dark:text-gray-400">No stores found matching your search.</p>
            </div>
          ) : (
            filteredStores.map((store) => {
              const logoUrl = getDisplayImageUrl(store.logoUrl || "");
              const hasCoordinates = Number.isFinite(store.lat) && Number.isFinite(store.lng);
              const openStoreDetails = () => navigate(`/store/${store.id}`, {
                state: { storesPath: "/customer/stores" },
              });
              return (
              <div
                key={store.id} 
                role="link"
                tabIndex={0}
                onClick={openStoreDetails}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openStoreDetails();
                  }
                }}
                className="flex cursor-pointer flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#1b1b1b]/30 dark:border-gray-800 dark:bg-gray-900 dark:focus:ring-white/40 sm:flex-row sm:items-start"
                aria-label={`Open ${store.name} details`}
              >
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gray-100 text-[#1b1b1b] dark:bg-white/10 dark:text-white">
                  {logoUrl ? (
                    <img src={logoUrl} alt={`${store.name} logo`} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <StoreIcon className="h-7 w-7" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="truncate font-semibold text-gray-900 dark:text-white">{store.name}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                      {store.category || "Retail"}
                    </span>
                  </div>
                  {store.description && (
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">{store.description}</p>
                  )}
                  <div className="mt-3 grid gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex min-w-0 items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{store.address || "Address not listed"}</span>
                    </span>
                    {store.hours && (
                      <span className="flex min-w-0 items-center gap-2">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{store.hours}</span>
                      </span>
                    )}
                    {store.contact && (
                      <span className="flex min-w-0 items-center gap-2">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{store.contact}</span>
                      </span>
                    )}
                    {store.email && (
                      <span className="flex min-w-0 items-center gap-2">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{store.email}</span>
                      </span>
                    )}
                  </div>
                </div>
                {hasCoordinates && (
                  <div
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <DirectionsButton
                      destination={{ lat: store.lat, lng: store.lng, address: store.address, name: store.name }}
                      label="Navigate"
                      className="w-full shrink-0 rounded-xl bg-[#1b1b1b] px-3 py-2 text-xs font-medium text-white hover:bg-black dark:bg-white dark:text-[#1b1b1b] sm:w-auto"
                    />
                  </div>
                )}
              </div>
              );
            })
          )}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
