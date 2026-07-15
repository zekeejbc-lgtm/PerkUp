import L from "leaflet";
import ReactDOMServer from "react-dom/server";
import { MapContainer, Marker, Popup, useMap } from "react-leaflet";
import { useEffect, useMemo } from "react";
import { Building2 } from "lucide-react";
import { getDisplayImageUrl } from "../lib/imageStorage";
import { MapBaseLayers } from "./MapBaseLayers";

const logoPin = (branch: any) => {
  const content = branch.logoUrl
    ? <img src={getDisplayImageUrl(branch.logoUrl)} alt="" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
    : <Building2 size={20} strokeWidth={2.5} color="#1b1b1b" />;

  return L.divIcon({
    className: "custom-pin",
    html: `<div style="background:#fff;width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 5px 14px rgba(0,0,0,.24);border:2px solid #1b1b1b;position:relative;overflow:visible">${ReactDOMServer.renderToString(content)}<div style="position:absolute;bottom:-7px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:8px solid #1b1b1b"></div></div>`,
    iconSize: [42, 50],
    iconAnchor: [21, 50],
    popupAnchor: [0, -48],
  });
};

function FitAllBranches({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 1) map.setView(positions[0], 14);
    else if (positions.length > 1) map.fitBounds(L.latLngBounds(positions), { padding: [40, 40], maxZoom: 14 });
  }, [map, positions]);
  return null;
}

export function StoreBranchesMap({ branches, onOpenBranch }: { branches: any[]; onOpenBranch: (branchId: string) => void }) {
  const mappedBranches = useMemo(() => branches.filter((branch) => Number.isFinite(Number(branch.lat)) && Number.isFinite(Number(branch.lng))), [branches]);
  const positions = useMemo<[number, number][]>(() => mappedBranches.map((branch) => [Number(branch.lat), Number(branch.lng)]), [mappedBranches]);
  const center = positions[0] || [7.4478, 125.8078];

  if (!mappedBranches.length) {
    return <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900">Add coordinates to a branch to display it on the store map.</div>;
  }

  return (
    <div className="h-80 overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700 sm:h-96">
      <MapContainer center={center} zoom={13} scrollWheelZoom className="h-full w-full" style={{ zIndex: 0 }}>
        <MapBaseLayers />
        <FitAllBranches positions={positions} />
        {mappedBranches.map((branch) => (
          <Marker key={branch.id} position={[Number(branch.lat), Number(branch.lng)]} icon={logoPin(branch)}>
            <Popup>
              <div className="min-w-44">
                <p className="font-bold">{branch.branchName || branch.name || "Branch"}</p>
                <p className="mt-1 text-xs text-gray-600">{branch.address || branch.location || "No address"}</p>
                <button type="button" onClick={() => onOpenBranch(branch.id)} className="mt-3 rounded-lg bg-[#1b1b1b] px-3 py-2 text-xs font-bold text-white">Open branch</button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
