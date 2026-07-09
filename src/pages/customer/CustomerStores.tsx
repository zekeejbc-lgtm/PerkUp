import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, query, where, getDocs } from "@/src/lib/dataCompat";
import { db, handleDataError, OperationType } from "../../lib/backend";
import { MapContainer, Marker, Popup } from "react-leaflet";
import * as ReactDOMServer from "react-dom/server";
import L from "leaflet";
import { Clock, Mail, MapPin, Phone, Search, Store as StoreIcon } from "lucide-react";
import { SkeletonBlock } from "../../components/LoadingSkeleton";
import { DirectionsButton } from "../../components/DirectionsButton";
import { MapBaseLayers } from "../../components/MapBaseLayers";
import { getDisplayImageUrl } from "../../lib/imageStorage";
import { Pagination } from "../../components/Pagination";

const STORES_PER_PAGE = 8;

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
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    async function fetchStores() {
      try {
        const q = query(collection(db, "stores"), where("status", "==", "active"));
        const querySnapshot = await getDocs(q);
        const fetchedStores = querySnapshot.docs.map((doc) => {
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
            hours: data.hours ? String(data.hours) : "",
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

  const filteredStores = stores.filter((store) => {
    const term = searchQuery.toLowerCase();
    const name = store.name?.toLowerCase() || "";
    const category = store.category?.toLowerCase() || "";
    const address = store.address?.toLowerCase() || "";
    return name.includes(term) || category.includes(term) || address.includes(term);
  });
  const mappedStores = filteredStores.filter((store) => Number.isFinite(store.lat) && Number.isFinite(store.lng));
  const totalPages = Math.max(1, Math.ceil(filteredStores.length / STORES_PER_PAGE));
  const paginatedStores = filteredStores.slice((currentPage - 1) * STORES_PER_PAGE, currentPage * STORES_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Affiliated Stores</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Discover places where you can earn and redeem rewards.</p>
        </div>
        <div className="relative w-full sm:w-64 shrink-0">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search stores..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-[#1b1b1b] dark:focus:ring-[#1b1b1b] sm:text-sm transition-colors"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-[2rem] overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm h-[400px] lg:h-auto min-h-[400px] relative z-0 transition-colors">
            {mapLoaded && mappedStores.length > 0 ? (
              <MapContainer 
                center={[mappedStores[0].lat, mappedStores[0].lng]} 
                zoom={14} 
                style={{ height: "100%", width: "100%" }}
              >
                <MapBaseLayers />
                {mappedStores.map((store) => {
                    const logoUrl = getDisplayImageUrl(store.logoUrl || "");
                    const iconHtml = ReactDOMServer.renderToString(
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#1b1b1b] text-white shadow-lg">
                        {logoUrl ? (
                          <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <StoreIcon className="h-5 w-5" />
                        )}
                      </div>
                    );
                    const customIcon = L.divIcon({
                      html: iconHtml,
                      className: 'custom-leaflet-icon',
                      iconSize: [40, 40],
                      iconAnchor: [20, 40],
                      popupAnchor: [0, -40],
                    });
                    
                    return (
                      <Marker key={store.id} position={[store.lat, store.lng]} icon={customIcon}>
                        <Popup className="rounded-xl">
                          <div className="w-56 p-1">
                            <div className="flex items-center gap-3">
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100 text-gray-700">
                                {logoUrl ? (
                                  <img src={logoUrl} alt={`${store.name} logo`} className="h-full w-full object-cover" />
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
        </div>

        <div className="space-y-4">
          {filteredStores.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl border border-dashed border-gray-300 dark:border-gray-700 text-center">
              <p className="text-gray-500 dark:text-gray-400">No stores found matching your search.</p>
            </div>
          ) : (
            paginatedStores.map((store) => {
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
          <Pagination
            page={currentPage}
            pageSize={STORES_PER_PAGE}
            totalItems={filteredStores.length}
            itemLabel="stores"
            onPageChange={setCurrentPage}
          />
        </div>
      </div>
    </div>
  );
}
