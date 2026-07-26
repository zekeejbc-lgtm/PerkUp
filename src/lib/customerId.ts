import { normalizePublicId } from "./publicId";

const CUSTOMER_CODE_PREFIX = "PKUP";

export function formatCustomerCode(customerId?: string | null, publicId?: string | null) {
  const normalizedPublicId = normalizePublicId(publicId);
  if (normalizedPublicId.startsWith("CUS-")) {
    return normalizedPublicId;
  }

  const compactId = String(customerId || "")
    .trim()
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();

  if (!compactId) return `${CUSTOMER_CODE_PREFIX}-UNKNOWN`;

  const firstGroup = compactId.slice(0, 4).padEnd(4, "0");
  const lastGroup = compactId.slice(-4).padStart(4, "0");

  return `${CUSTOMER_CODE_PREFIX}-${firstGroup}-${lastGroup}`;
}
