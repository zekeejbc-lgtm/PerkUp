import { useMemo } from "react";
import { Link } from "react-router-dom";
import { MapPin, Store as StoreIcon } from "lucide-react";
import { MapContainer, Marker, Popup } from "react-leaflet";
import { DirectionsButton } from "./DirectionsButton";
import { MapBaseLayers } from "./MapBaseLayers";
import { createCustomerStoreMapPin } from "./CustomerStoreMapPin";
import { getLandingMapInteractionOptions } from "./landingMapInteractions";
import { getDisplayImageUrl } from "../lib/imageStorage";
import { groupCustomerMapLocations } from "../lib/customerMapMarkers";
import { DirectoryStore, isStoreOpenNow } from "../lib/storeDirectory";

interface LandingStoreMapProps {
  stores: DirectoryStore[];
  center: [number, number];
}

export default function LandingStoreMap({ stores, center }: LandingStoreMapProps) {
  const usesCoarsePointer =
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches;
  const storeGroups = useMemo(
    () => groupCustomerMapLocations(
      stores.filter(
        (store): store is DirectoryStore & { lat: number; lng: number } =>
          Number.isFinite(store.lat) && Number.isFinite(store.lng),
      ),
    ),
    [stores],
  );

  return (
    <MapContainer
      center={center}
      zoom={14}
      {...getLandingMapInteractionOptions(usesCoarsePointer)}
      style={{ height: "100%", width: "100%", zIndex: 1 }}
    >
      <MapBaseLayers />
      {storeGroups.map((group) => {
        const store = group.items[0];
        const isGroup = group.items.length > 1;
        return (
        <Marker
          key={group.key}
          position={group.position}
          icon={createCustomerStoreMapPin(group)}
          title={isGroup ? `${group.items.length} shops at this location` : `${store.name} location`}
          alt={isGroup ? `${group.items.length} shops at this location` : `${store.name} location`}
        >
          <Popup className="rounded-xl overflow-hidden shadow-md">
            {isGroup ? (
              <div className="w-64 p-1 -m-1">
                <p className="mb-3 font-bold text-gray-900">{group.items.length} shops at this location</p>
                <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                  {group.items.map((groupedStore) => (
                    <div key={groupedStore.id} className="rounded-xl border border-gray-200 p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
                          {groupedStore.logoUrl ? (
                            <img
                              src={getDisplayImageUrl(groupedStore.logoUrl)}
                              alt={`${groupedStore.name} logo`}
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <StoreIcon className="h-5 w-5 text-gray-700" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-gray-900">{groupedStore.name}</p>
                          <p className="truncate text-xs text-gray-500">{groupedStore.category || "Shop"}</p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Link to={`/store/${groupedStore.id}`} className="rounded-lg bg-gray-900 px-2 py-2 text-center text-xs font-medium !text-white">View details</Link>
                        <DirectionsButton destination={{ lat: groupedStore.lat, lng: groupedStore.lng, name: groupedStore.name }} className="rounded-lg bg-gray-100 px-2 py-2 text-xs font-medium text-[#1b1b1b]" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
            <div className="p-1 -m-1">
              {store.logoUrl && (
                <div className="mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <img src={getDisplayImageUrl(store.logoUrl)} alt={`${store.name} logo`} referrerPolicy="no-referrer" className="h-full w-full object-contain" />
                </div>
              )}
              <h3 className="font-bold text-gray-900 text-lg mb-1">{store.name}</h3>
              <div className={`mb-2 flex items-center gap-1.5 text-xs font-medium ${isStoreOpenNow(store.hours) ? "text-emerald-700" : "text-gray-500"}`}>
                <span className={`h-2 w-2 rounded-full ${isStoreOpenNow(store.hours) ? "bg-emerald-500" : "bg-gray-400"}`} />
                {isStoreOpenNow(store.hours) ? "Open now" : store.hours ? "Closed now" : "Hours unavailable"}
              </div>
              {store.description && <p className="text-sm text-gray-600 mb-2 leading-tight">{store.description}</p>}
              {store.contact && <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2"><MapPin className="w-3 h-3" />{store.contact}</div>}
              <div className="flex flex-col gap-2 mt-3">
                <Link to={`/store/${store.id}`} className="w-full text-center bg-gray-900 !text-white font-medium py-2 rounded-lg text-xs hover:bg-gray-800 transition-colors">View Details</Link>
                <DirectionsButton destination={{ lat: store.lat, lng: store.lng, name: store.name }} className="w-full bg-gray-100 text-[#1b1b1b] font-medium py-2 rounded-lg text-xs hover:bg-gray-200 transition-colors" />
              </div>
            </div>
            )}
          </Popup>
        </Marker>
      )})}
    </MapContainer>
  );
}
