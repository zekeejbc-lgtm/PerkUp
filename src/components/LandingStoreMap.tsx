import * as ReactDOMServer from "react-dom/server";
import { Link } from "react-router-dom";
import { MapPin, Store as StoreIcon } from "lucide-react";
import { MapContainer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { DirectionsButton } from "./DirectionsButton";
import { MapBaseLayers } from "./MapBaseLayers";
import { getDisplayImageUrl } from "../lib/imageStorage";
import { DirectoryStore, isStoreOpenNow } from "../lib/storeDirectory";

interface LandingStoreMapProps {
  stores: DirectoryStore[];
  center: [number, number];
}

const createCustomPin = (store: DirectoryStore) => {
  const markerContent = (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <StoreIcon size={20} strokeWidth={2.5} color="#1b1b1b" />
      {store.logoUrl && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            backgroundImage: `url(${JSON.stringify(getDisplayImageUrl(store.logoUrl))})`,
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
          }}
        />
      )}
    </div>
  );

  return L.divIcon({
    className: "custom-pin",
    html: `<div style="background-color:white;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 6px -1px rgba(0,0,0,.1),0 2px 4px -1px rgba(0,0,0,.06);border:2px solid #1b1b1b;position:relative">${ReactDOMServer.renderToString(markerContent)}<div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid #1b1b1b"></div></div>`,
    iconSize: [40, 46],
    iconAnchor: [20, 46],
    popupAnchor: [0, -46],
  });
};

export default function LandingStoreMap({ stores, center }: LandingStoreMapProps) {
  return (
    <MapContainer center={center} zoom={14} scrollWheelZoom={false} style={{ height: "100%", width: "100%", zIndex: 1 }}>
      <MapBaseLayers />
      {stores.map((store) => store.lat && store.lng ? (
        <Marker
          key={store.id}
          position={[store.lat, store.lng]}
          icon={createCustomPin(store)}
          title={`${store.name} location`}
          alt={`${store.name} location`}
        >
          <Popup className="rounded-xl overflow-hidden shadow-md">
            <div className="p-1 -m-1">
              {store.logoUrl && (
                <div className="mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <img src={getDisplayImageUrl(store.logoUrl)} alt={`${store.name} logo`} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
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
          </Popup>
        </Marker>
      ) : null)}
    </MapContainer>
  );
}
