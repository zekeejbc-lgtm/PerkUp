import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "@/src/lib/dataCompat";
import { db, handleDataError, OperationType } from "../../lib/backend";
import { MapContainer, Marker, Popup } from "react-leaflet";
import * as ReactDOMServer from "react-dom/server";
import L from "leaflet";
import { Store as StoreIcon, Search, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { SkeletonBlock } from "../../components/LoadingSkeleton";
import { DirectionsButton } from "../../components/DirectionsButton";
import { MapBaseLayers } from "../../components/MapBaseLayers";

export default function CustomerStores() {
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function fetchStores() {
      try {
        const q = query(collection(db, "stores"), where("status", "==", "active"));
        const querySnapshot = await getDocs(q);
        const fetchedStores = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          name: doc.data().name || doc.data().storeName || "Store",
          lat: Number(doc.data().lat ?? doc.data().latitude),
          lng: Number(doc.data().lng ?? doc.data().longitude),
        }));
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
    return name.includes(term) || category.includes(term);
  });

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
            {mapLoaded && filteredStores.length > 0 ? (
              <MapContainer 
                center={[filteredStores[0].lat || 7.4478, filteredStores[0].lng || 125.8078]} 
                zoom={14} 
                style={{ height: "100%", width: "100%" }}
              >
                <MapBaseLayers />
                {filteredStores.map((store) => {
                  if (store.lat && store.lng) {
                    const iconHtml = ReactDOMServer.renderToString(
                      <div className="w-8 h-8 bg-[#1b1b1b] text-white rounded-full flex items-center justify-center shadow-lg border-2 border-white">
                        <StoreIcon className="w-4 h-4" />
                      </div>
                    );
                    const customIcon = L.divIcon({
                      html: iconHtml,
                      className: 'custom-leaflet-icon',
                      iconSize: [32, 32],
                      iconAnchor: [16, 32],
                      popupAnchor: [0, -32],
                    });
                    
                    return (
                      <Marker key={store.id} position={[store.lat, store.lng]} icon={customIcon}>
                        <Popup className="rounded-xl">
                          <div className="p-1">
                            <h3 className="font-semibold text-gray-900">{store.name}</h3>
                            <p className="text-xs text-gray-500">{store.category || "Retail"}</p>
                            <Link to={`/store/${store.id}`} className="text-[#1b1b1b] text-xs font-medium mt-2 inline-block hover:underline">
                              View Details
                            </Link>
                            <DirectionsButton
                              destination={{ lat: store.lat, lng: store.lng, address: store.address, name: store.name }}
                              className="w-full mt-2 rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-[#1b1b1b] hover:bg-gray-200"
                            />
                          </div>
                        </Popup>
                      </Marker>
                    );
                  }
                  return null;
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
            filteredStores.map((store) => (
              <div
                key={store.id} 
                className="flex items-center gap-4 bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 bg-gray-100 dark:bg-white/10 rounded-full flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5 text-[#1b1b1b] dark:text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <Link to={`/store/${store.id}`} className="font-semibold text-gray-900 dark:text-white truncate hover:underline block">{store.name}</Link>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-flex items-center gap-1 rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                      {store.category || "Retail"}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                      {store.address || "Tagum City"}
                    </span>
                  </div>
                </div>
                <DirectionsButton
                  destination={{ lat: store.lat, lng: store.lng, address: store.address, name: store.name }}
                  label="Navigate"
                  className="shrink-0 rounded-xl bg-[#1b1b1b] px-3 py-2 text-xs font-medium text-white hover:bg-black dark:bg-white dark:text-[#1b1b1b]"
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
