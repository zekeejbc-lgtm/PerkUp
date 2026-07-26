export const PUBLIC_ID_PATTERN = /^[A-Z]{3}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;

export function normalizePublicId(value?: string | null) {
  const normalized = String(value || "").trim().toUpperCase();
  return PUBLIC_ID_PATTERN.test(normalized) ? normalized : "";
}

export function displayPublicId(
  publicId?: string | null,
  legacyId?: string | null,
  fallback = "Pending",
) {
  return normalizePublicId(publicId) || String(legacyId || "").trim() || fallback;
}
