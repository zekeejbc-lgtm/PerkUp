export interface CustomerMapLocation {
  lat: number;
  lng: number;
  logoUrl?: string;
}

export interface CustomerMapLocationGroup<T extends CustomerMapLocation> {
  key: string;
  position: [number, number];
  items: T[];
}

export type CustomerMapMarkerPresentation =
  | { kind: "store" }
  | { kind: "logo"; logoUrl: string }
  | { kind: "group"; count: number };

const coordinateKey = (lat: number, lng: number) =>
  `${lat.toFixed(6)},${lng.toFixed(6)}`;

export const groupCustomerMapLocations = <T extends CustomerMapLocation>(
  locations: T[],
): CustomerMapLocationGroup<T>[] => {
  const groups = new Map<string, CustomerMapLocationGroup<T>>();

  locations.forEach((location) => {
    const lat = Number(location.lat);
    const lng = Number(location.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const key = coordinateKey(lat, lng);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(location);
      return;
    }

    groups.set(key, {
      key,
      position: [lat, lng],
      items: [location],
    });
  });

  return Array.from(groups.values());
};

export const getCustomerMapMarkerPresentation = <T extends CustomerMapLocation>(
  group: CustomerMapLocationGroup<T>,
): CustomerMapMarkerPresentation => {
  if (group.items.length > 1) {
    return { kind: "group", count: group.items.length };
  }

  const logoUrl = group.items[0]?.logoUrl?.trim();
  return logoUrl ? { kind: "logo", logoUrl } : { kind: "store" };
};
