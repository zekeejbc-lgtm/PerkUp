import { MapPin } from "lucide-react";
import { MapContainer, Marker, Popup } from "react-leaflet";
import { getRewardStoreLocation } from "../lib/customerCardStores";
import { createCustomerStoreMapPin } from "./CustomerStoreMapPin";
import { DirectionsButton } from "./DirectionsButton";
import { MapBaseLayers } from "./MapBaseLayers";

export function CustomerRewardStoreLocation({ store }: { store: any }) {
  const location = getRewardStoreLocation(store);
  const mapStore = {
    ...store,
    name: location.name,
    lat: location.lat,
    lng: location.lng,
  };
  const markerGroup = {
    key: `${location.lat.toFixed(6)},${location.lng.toFixed(6)}`,
    position: [location.lat, location.lng] as [number, number],
    items: [mapStore],
  };

  return (
    <section
      aria-labelledby="store-location-heading"
      className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"
    >
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="store-location-heading" className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
            <MapPin className="h-4 w-4 text-gray-400" />
            Store location
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {location.address || "Location details are unavailable."}
          </p>
        </div>
        {location.canNavigate && (
          <DirectionsButton
            destination={{
              lat: location.hasCoordinates ? location.lat : undefined,
              lng: location.hasCoordinates ? location.lng : undefined,
              address: location.address,
              name: location.name,
            }}
            label="Navigate"
            className="min-h-11 rounded-xl bg-gray-900 px-4 text-sm font-bold text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
          />
        )}
      </div>

      {location.hasCoordinates ? (
        <MapContainer
          center={[location.lat, location.lng]}
          zoom={15}
          scrollWheelZoom
          className="h-72 w-full border-t border-gray-200 dark:border-gray-800"
          style={{ zIndex: 0 }}
        >
          <MapBaseLayers />
          <Marker
            position={[location.lat, location.lng]}
            icon={createCustomerStoreMapPin(markerGroup)}
            title={`${location.name} location`}
            alt={`${location.name} location`}
          >
            <Popup>
              <div className="min-w-40">
                <p className="font-bold">{location.name}</p>
                {location.address && <p className="mt-1 text-xs text-gray-600">{location.address}</p>}
              </div>
            </Popup>
          </Marker>
        </MapContainer>
      ) : (
        <div className="flex h-32 items-center justify-center border-t border-dashed border-gray-200 px-6 text-center text-sm text-gray-500 dark:border-gray-800">
          Map coordinates are unavailable for this store.
        </div>
      )}
    </section>
  );
}
