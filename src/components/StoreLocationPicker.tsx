import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

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
    Number.isFinite(latitude) ? latitude : 14.5995,
    Number.isFinite(longitude) ? longitude : 120.9842,
  ];

  return (
    <div className={`${className} relative z-0 overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700`}>
      <MapContainer center={position} zoom={13} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapViewport position={position} />
        <LocationMarker position={position} onChange={([lat, lng]) => onChange(lat, lng)} />
      </MapContainer>
    </div>
  );
}
