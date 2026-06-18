import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "@/src/lib/dataCompat";
import { db, handleDataError, OperationType } from "../../lib/backend";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import * as ReactDOMServer from "react-dom/server";
import L from "leaflet";
import { Store as StoreIcon, Search, Star, MapPin } from "lucide-react";
import { Link } from "react-router-dom";

export default function CustomerStores() {
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function fetchStores() {
      try {
        const q = query(collection(db, "users"), where("role", "==", "store_owner"));
        const querySnapshot = await getDocs(q);
        const fetchedStores = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setStores(fetchedStores);
      } catch (error) {
        handleDataError(error, OperationType.GET, "users");
      } finally {
        setLoading(false);
      }
    }
    fetchStores();
    setMapLoaded(true);
  }, []);

  const filteredStores = stores.filter((store) => {
    const term = searchQuery.toLowerCase();
    const name = store.storeName?.toLowerCase() || "";
    const category = store.category?.toLowerCase() || "";
    return name.includes(term) || category.includes(term);
  });

  if (loading) return <div className="animate-pulse text-gray-500 dark:text-gray-400">Loading affiliated stores...</div>;

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
            className="block w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm transition-colors"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-[2rem] overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm h-[400px] lg:h-auto min-h-[400px] relative z-0 transition-colors">
            {mapLoaded && filteredStores.length > 0 ? (
              <MapContainer 
                center={[filteredStores[0].lat || 7.4475, filteredStores[0].lng || 125.8093]} 
                zoom={14} 
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                />
                {filteredStores.map((store) => {
                  if (store.lat && store.lng) {
                    const iconHtml = ReactDOMServer.renderToString(
                      <div className="w-8 h-8 bg-orange-600 text-white rounded-full flex items-center justify-center shadow-lg border-2 border-white">
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
                            <h3 className="font-semibold text-gray-900">{store.storeName}</h3>
                            <p className="text-xs text-gray-500">{store.category || "Retail"}</p>
                            <Link to={`/store/${store.id}`} className="text-orange-600 text-xs font-medium mt-2 inline-block hover:underline">
                              View Details
                            </Link>
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
              <Link 
                key={store.id} 
                to={`/store/${store.id}`}
                className="flex items-center gap-4 bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 bg-orange-50 dark:bg-orange-950/30 rounded-full flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">{store.storeName}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-flex items-center gap-1 rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                      {store.category || "Retail"}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                      {store.address || "Tagum City"}
                    </span>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
