import { useEffect } from "react";
import { MapContainer, Marker, useMap, useMapEvents } from "react-leaflet";
import { MapBaseLayers } from "./MapBaseLayers";

type Coordinates = [number, number];

function LocationMarker({
  position,
  onChange,
}: {
  position: Coordinates;
  onChange: (position: Coordinates) => void;
}) {
  useMapEvents({
    click(event) {
      onChange([event.latlng.lat, event.latlng.lng]);
    },
  });

  return <Marker position={position} />;
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
  className = "h-72",
}: {
  latitude: number;
  longitude: number;
  onChange: (latitude: number, longitude: number) => void;
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
        <LocationMarker position={position} onChange={([lat, lng]) => onChange(lat, lng)} />
      </MapContainer>
    </div>
  );
}
