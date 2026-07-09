import type { CustomerScanCard, RedeemedCustomerScan } from "./secureQr";

type CachedCustomerScan = {
  customer: {
    id: string;
    username: string;
    maskedName: string;
    profilePic: string | null;
    existingStars: number;
    cards: CustomerScanCard[];
  };
  cachedAt: number;
};

const CACHE_PREFIX = "perkup:customerScanCache";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ITEMS = 200;

const safeJsonParse = (value: string | null): Record<string, CachedCustomerScan> => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const cacheKey = (storeId: string) => `${CACHE_PREFIX}:${storeId}`;

const digest = async (value: string) => {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const normalizeCache = (cache: Record<string, CachedCustomerScan>) => {
  const cutoff = Date.now() - CACHE_TTL_MS;
  return Object.fromEntries(
    Object.entries(cache)
      .filter(([, value]) => value?.cachedAt >= cutoff && value?.customer?.id)
      .sort((left, right) => right[1].cachedAt - left[1].cachedAt)
      .slice(0, MAX_CACHE_ITEMS),
  );
};

const readCache = (storeId: string) => {
  if (typeof localStorage === "undefined") return {};
  const key = cacheKey(storeId);
  const cache = normalizeCache(safeJsonParse(localStorage.getItem(key)));
  try {
    localStorage.setItem(key, JSON.stringify(cache));
  } catch {
    // Best-effort cache only.
  }
  return cache;
};

const writeCache = (storeId: string, cache: Record<string, CachedCustomerScan>) => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(cacheKey(storeId), JSON.stringify(normalizeCache(cache)));
  } catch (error) {
    console.warn("Failed to persist customer scan cache.", error);
  }
};

export const getCustomerScanCacheKey = async (input: { scanToken?: string; manualUsername?: string }) => {
  const scanToken = String(input.scanToken || "").trim();
  const manualUsername = String(input.manualUsername || "").trim().toLowerCase();
  if (scanToken) return `qr:${await digest(scanToken)}`;
  if (manualUsername) return `username:${manualUsername}`;
  return "";
};

export const readCustomerScanCache = async (
  storeId: string,
  input: { scanToken?: string; manualUsername?: string },
) => {
  const lookupKey = await getCustomerScanCacheKey(input);
  if (!storeId || !lookupKey) return null;
  return readCache(storeId)[lookupKey] || null;
};

export const writeCustomerScanCache = async (
  storeId: string,
  input: { scanToken?: string; manualUsername?: string },
  result: RedeemedCustomerScan,
) => {
  const lookupKey = await getCustomerScanCacheKey(input);
  if (!storeId || !lookupKey || !result.customer?.id) return;

  const customer = {
    id: result.customer.id,
    username: result.customer.username,
    maskedName: result.customer.maskedName,
    profilePic: result.customer.profilePic,
    existingStars: Number(result.customer.existingStars || 0),
    cards: result.customer.cards || [],
  };
  const nextCache = {
    ...readCache(storeId),
    [lookupKey]: { customer, cachedAt: Date.now() },
  };

  if (customer.username) {
    nextCache[`username:${customer.username.toLowerCase()}`] = { customer, cachedAt: Date.now() };
  }

  writeCache(storeId, nextCache);
};
