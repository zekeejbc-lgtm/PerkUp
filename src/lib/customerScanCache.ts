import type { CustomerScanCard, RedeemedCustomerScan } from "./secureQr";

export type CustomerScanCacheScope = {
  staffId: string;
  storeId: string;
};

type CachedCustomerScan = {
  customer: {
    id: string;
    publicId?: string | null;
    username: string;
    maskedName: string;
    profilePic: string | null;
    existingStars: number;
    cards: CustomerScanCard[];
  };
  cachedAt: number;
  qrExpiresAt?: number;
};

type EncryptedCache = {
  version: 1;
  iv: number[];
  ciphertext: ArrayBuffer;
};

const LEGACY_CACHE_PREFIX = "perkup:customerScanCache";
const DB_NAME = "perkup-secure-scan-cache";
const DB_VERSION = 1;
const KEY_STORE = "keys";
const CACHE_STORE = "customer-rosters";
const DEVICE_KEY_ID = "customer-cache-aes-key";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ITEMS = 200;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const digest = async (value: string) => {
  const buffer = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const removeLegacyPlaintextCaches = () => {
  if (typeof localStorage === "undefined") return;
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(LEGACY_CACHE_PREFIX)) localStorage.removeItem(key);
  }
};

const openCacheDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (typeof indexedDB === "undefined") {
    reject(new Error("Secure browser storage is unavailable."));
    return;
  }

  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE);
    if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error("Could not open the secure customer cache."));
});

const idbGet = <T>(db: IDBDatabase, storeName: string, key: string) => new Promise<T | undefined>((resolve, reject) => {
  const request = db.transaction(storeName, "readonly").objectStore(storeName).get(key);
  request.onsuccess = () => resolve(request.result as T | undefined);
  request.onerror = () => reject(request.error);
});

const idbPut = (db: IDBDatabase, storeName: string, key: string, value: unknown) => new Promise<void>((resolve, reject) => {
  const request = db.transaction(storeName, "readwrite").objectStore(storeName).put(value, key);
  request.onsuccess = () => resolve();
  request.onerror = () => reject(request.error);
});

const idbDelete = (db: IDBDatabase, storeName: string, key: string) => new Promise<void>((resolve, reject) => {
  const request = db.transaction(storeName, "readwrite").objectStore(storeName).delete(key);
  request.onsuccess = () => resolve();
  request.onerror = () => reject(request.error);
});

const getDeviceKey = async (db: IDBDatabase) => {
  const existing = await idbGet<CryptoKey>(db, KEY_STORE, DEVICE_KEY_ID);
  if (existing) return existing;

  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await idbPut(db, KEY_STORE, DEVICE_KEY_ID, key);
  return key;
};

const getScopeId = async (scope: CustomerScanCacheScope) =>
  digest(`staff:${scope.staffId}:store:${scope.storeId}`);

const validScope = (scope: CustomerScanCacheScope) => Boolean(scope.staffId && scope.storeId);

const normalizeCache = (value: unknown): Record<string, CachedCustomerScan> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const cutoff = Date.now() - CACHE_TTL_MS;
  return Object.fromEntries(
    Object.entries(value as Record<string, CachedCustomerScan>)
      .filter(([, item]) => (
        item?.cachedAt >= cutoff
        && item?.customer?.id
        && (!item.qrExpiresAt || item.qrExpiresAt > Date.now())
      ))
      .sort((left, right) => right[1].cachedAt - left[1].cachedAt)
      .slice(0, MAX_CACHE_ITEMS),
  );
};

const readEncryptedCache = async (scope: CustomerScanCacheScope) => {
  removeLegacyPlaintextCaches();
  if (!validScope(scope) || !globalThis.crypto?.subtle) return {};

  const db = await openCacheDb();
  const scopeId = await getScopeId(scope);
  const envelope = await idbGet<EncryptedCache>(db, CACHE_STORE, scopeId);
  if (!envelope) return {};

  try {
    const key = await getDeviceKey(db);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(envelope.iv), additionalData: textEncoder.encode(scopeId) },
      key,
      envelope.ciphertext,
    );
    return normalizeCache(JSON.parse(textDecoder.decode(plaintext)));
  } catch (error) {
    await idbDelete(db, CACHE_STORE, scopeId).catch(() => undefined);
    console.warn("Discarded an unreadable customer scan cache.", error);
    return {};
  }
};

const writeEncryptedCache = async (
  scope: CustomerScanCacheScope,
  cache: Record<string, CachedCustomerScan>,
) => {
  if (!validScope(scope) || !globalThis.crypto?.subtle) return;

  const db = await openCacheDb();
  const scopeId = await getScopeId(scope);
  const key = await getDeviceKey(db);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: textEncoder.encode(scopeId) },
    key,
    textEncoder.encode(JSON.stringify(normalizeCache(cache))),
  );
  await idbPut(db, CACHE_STORE, scopeId, { version: 1, iv: Array.from(iv), ciphertext } satisfies EncryptedCache);
};

const getQrExpiry = (scanToken: string) => {
  if (!scanToken.startsWith("perkup:v3:")) return undefined;
  try {
    const encodedPayload = scanToken.slice("perkup:v3:".length).split(".")[0];
    const normalized = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, "=");
    const payload = atob(padded);
    const expiresAtSeconds = Number(payload.split(".")[2]);
    return Number.isFinite(expiresAtSeconds) ? expiresAtSeconds * 1000 : undefined;
  } catch {
    return undefined;
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
  scope: CustomerScanCacheScope,
  input: { scanToken?: string; manualUsername?: string },
) => {
  const lookupKey = await getCustomerScanCacheKey(input);
  if (!validScope(scope) || !lookupKey) return null;
  return (await readEncryptedCache(scope))[lookupKey] || null;
};

export const writeCustomerScanCache = async (
  scope: CustomerScanCacheScope,
  input: { scanToken?: string; manualUsername?: string },
  result: RedeemedCustomerScan,
) => {
  const lookupKey = await getCustomerScanCacheKey(input);
  if (!validScope(scope) || !lookupKey || !result.customer?.id) return;

  const customer = {
    id: result.customer.id,
    publicId: result.customer.publicId,
    username: result.customer.username,
    maskedName: result.customer.maskedName,
    profilePic: result.customer.profilePic,
    existingStars: Number(result.customer.existingStars || 0),
    cards: result.customer.cards || [],
  };
  const cachedAt = Date.now();
  const cachedEntry = { customer, cachedAt, qrExpiresAt: getQrExpiry(String(input.scanToken || "")) };
  const nextCache = {
    ...await readEncryptedCache(scope),
    [lookupKey]: cachedEntry,
  };

  if (customer.username) {
    nextCache[`username:${customer.username.toLowerCase()}`] = { customer, cachedAt };
  }

  await writeEncryptedCache(scope, nextCache);
};
