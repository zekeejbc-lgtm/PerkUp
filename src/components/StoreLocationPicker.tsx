import { useEffect, useMemo } from "react";
import * as ReactDOMServer from "react-dom/server";
import L from "leaflet";
import { MapContainer, Marker, useMap, useMapEvents } from "react-leaflet";
import { Store } from "lucide-react";
import { MapBaseLayers } from "./MapBaseLayers";
import { getDisplayImageUrl } from "../lib/imageStorage";

type Coordinates = [number, number];

function LocationMarker({
  position,
  onChange,
  logoUrl,
}: {
  position: Coordinates;
  onChange: (position: Coordinates) => void;
  logoUrl?: string;
}) {
  useMapEvents({
    click(event) {
      onChange([event.latlng.lat, event.latlng.lng]);
    },
  });

  const markerIcon = useMemo(() => {
    const displayLogoUrl = logoUrl?.trim() ? getDisplayImageUrl(logoUrl) : "";
    const content = (
      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {displayLogoUrl ? (
          <img
            src={displayLogoUrl}
            alt=""
            aria-hidden="true"
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <Store size={20} strokeWidth={2.5} color="#1b1b1b" />
        )}
      </div>
    );

    return L.divIcon({
      className: "custom-pin",
      html: `<div style="background:white;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 6px -1px rgba(0,0,0,.1),0 2px 4px -1px rgba(0,0,0,.06);border:2px solid #1b1b1b;position:relative">${ReactDOMServer.renderToString(content)}<div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid #1b1b1b"></div></div>`,
      iconSize: [40, 46],
      iconAnchor: [20, 46],
    });
  }, [logoUrl]);

  return <Marker position={position} icon={markerIcon} />;
}

function MapViewport({ position }: { position: Coordinates }) {
  const map = useMap();

  useEffect(() => {
    map.flyTo(position, Math.max(map.getZoom(), 15), { duration: 0.5 });
  }, [map, position]);

  return null;
}

export function StoreLocationPicker({
  latitude,
  longitude,
  onChange,
  logoUrl,
  className = "h-72",
}: {
  latitude: number;
  longitude: number;
  onChange: (latitude: number, longitude: number) => void;
  logoUrl?: string;
  className?: string;
}) {
  const position: Coordinates = [
    Number.isFinite(latitude) ? latitude : 7.4478,
    Number.isFinite(longitude) ? longitude : 125.8078,
  ];

  return (
    <div className={`${className} relative z-0 overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700`}>
      <MapContainer center={position} zoom={13} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <MapBaseLayers />
        <MapViewport position={position} />
        <LocationMarker position={position} logoUrl={logoUrl} onChange={([lat, lng]) => onChange(lat, lng)} />
      </MapContainer>
    </div>
  );
}
