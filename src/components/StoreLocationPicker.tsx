import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, useMap, useMapEvents } from "react-leaflet";
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

  const logoIcon = useMemo(() => {
    if (!logoUrl) return undefined;

    const imageUrl = getDisplayImageUrl(logoUrl);
    if (!imageUrl) return undefined;

    const escapedImageUrl = imageUrl
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

    return L.divIcon({
      className: "store-logo-map-marker",
      html: `<div style="position:relative;z-index:0;width:44px;height:50px">
        <div style="position:relative;z-index:1;width:40px;height:40px;overflow:hidden;border-radius:9999px;border:3px solid white;background:white;box-shadow:0 4px 10px rgba(0,0,0,.35)">
          <img src="${escapedImageUrl}" alt="" style="display:block;width:100%;height:100%;object-fit:cover" />
        </div>
        <div style="position:absolute;left:14px;bottom:1px;z-index:0;width:12px;height:12px;transform:rotate(45deg);background:white;box-shadow:3px 3px 5px rgba(0,0,0,.18)"></div>
      </div>`,
      iconSize: [44, 50],
      iconAnchor: [20, 49],
    });
  }, [logoUrl]);

  return logoIcon
    ? <Marker position={position} icon={logoIcon} />
    : <Marker position={position} />;
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
