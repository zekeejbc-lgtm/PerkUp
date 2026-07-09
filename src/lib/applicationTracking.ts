const TRACKING_PREFIX = "PKUP";

const getBusinessSlug = (businessName?: string | null) => {
  const words = String(businessName || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);

  if (words.length === 0) return "SHOP";

  const compact = words.join("");
  return compact.padEnd(4, "X").slice(0, 6);
};

export function formatApplicationTrackingCode(applicationId?: string | null, businessName?: string | null) {
  const compactId = String(applicationId || "")
    .trim()
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();

  if (!compactId) return `${TRACKING_PREFIX}-${getBusinessSlug(businessName)}-PENDING`;

  return `${TRACKING_PREFIX}-${getBusinessSlug(businessName)}-${compactId.slice(0, 4)}-${compactId.slice(-4)}`;
}
