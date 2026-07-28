export type PartnerApplicationStoreSource = {
  businessName?: string;
  category?: string;
  description?: string;
  address?: string;
  coordinates?: unknown;
  logoUrl?: string;
  businessWebsiteUrl?: string;
  businessFacebookUrl?: string;
};

export type PartnerApplicationStoreOverrides = {
  name?: string;
  category?: string;
  address?: string;
  coordinates?: [number, number] | null;
  logoUrl?: string;
};

const getCoordinates = (value: unknown): [number, number] | null => {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const coordinates = value.map(Number);
  return coordinates.every(Number.isFinite)
    ? [coordinates[0], coordinates[1]]
    : null;
};

export const getPartnerApplicationStoreDefaults = (
  source: PartnerApplicationStoreSource,
  overrides: PartnerApplicationStoreOverrides = {},
) => {
  const name = String(overrides.name ?? source.businessName ?? "").trim();
  const address = String(overrides.address ?? source.address ?? "").trim();
  const category = String(overrides.category ?? source.category ?? "").trim();
  const coordinates = overrides.coordinates === undefined
    ? getCoordinates(source.coordinates)
    : overrides.coordinates;

  return {
    name,
    businessName: name,
    category,
    description: String(source.description ?? "").trim(),
    location: address,
    address,
    ...(coordinates ? { lat: coordinates[0], lng: coordinates[1] } : {}),
    logoUrl: String(overrides.logoUrl ?? source.logoUrl ?? "").trim(),
    website: String(source.businessWebsiteUrl ?? "").trim(),
    businessFacebookUrl: String(source.businessFacebookUrl ?? "").trim(),
  };
};
