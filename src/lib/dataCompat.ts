import { supabase } from "./supabase";

type FilterOperator = "==" | "in";

interface CollectionRef {
  type: "collection";
  name: string;
}

interface DocumentRef {
  type: "document";
  collectionName: string;
  id: string;
}

interface QueryRef {
  type: "query";
  collectionName: string;
  filters: FilterClause[];
}

interface FilterClause {
  field: string;
  op: FilterOperator;
  value: unknown;
}

interface IncrementValue {
  __op: "increment";
  value: number;
}

interface DeleteFieldValue {
  __op: "deleteField";
}

interface ServerTimestampValue {
  seconds: number;
  nanoseconds: number;
}

const tableNames = new Set([
  "applications",
  "cards",
  "customer_qr_tokens",
  "customers",
  "feedback",
  "products",
  "promotions",
  "promotions_scanned",
  "settings",
  "stores",
  "test",
  "users",
]);

const READ_CACHE_TTL_MS = 45_000;
const readCache = new Map<string, { expiresAt: number; value: unknown }>();

const timestampNow = (): ServerTimestampValue => ({
  seconds: Math.floor(Date.now() / 1000),
  nanoseconds: 0,
});

const serializeValue = (value: unknown): unknown => {
  if (value instanceof Date) {
    return {
      seconds: Math.floor(value.getTime() / 1000),
      nanoseconds: value.getMilliseconds() * 1_000_000,
    };
  }
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry !== "function" && entry !== undefined) {
        result[key] = serializeValue(entry);
      }
    }
    return result;
  }
  return value;
};

const ensureKnownTable = (collectionName: string) => {
  if (!tableNames.has(collectionName)) {
    console.warn(`Supabase table "${collectionName}" is not listed in the generated migration.`);
  }
};

export const db = {};

export function collection(_db: unknown, name: string): CollectionRef {
  ensureKnownTable(name);
  return { type: "collection", name };
}

export function doc(dbOrCollection: unknown, collectionName?: string, id?: string): DocumentRef {
  if ((dbOrCollection as CollectionRef)?.type === "collection") {
    const col = dbOrCollection as CollectionRef;
    return {
      type: "document",
      collectionName: col.name,
      id: collectionName ?? crypto.randomUUID(),
    };
  }

  if (!collectionName) {
    throw new Error("A collection name is required.");
  }

  ensureKnownTable(collectionName);
  return {
    type: "document",
    collectionName,
    id: id ?? crypto.randomUUID(),
  };
}

export function where(field: string, op: FilterOperator, value: unknown): FilterClause {
  return { field, op, value };
}

export function query(collectionRef: CollectionRef, ...filters: FilterClause[]): QueryRef {
  return {
    type: "query",
    collectionName: collectionRef.name,
    filters,
  };
}

const dataApi = (collectionName: string) => supabase.from(collectionName);

const getCachedValue = <T>(key: string): T | null => {
  const cached = readCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    readCache.delete(key);
    return null;
  }
  return cached.value as T;
};

const setCachedValue = <T>(key: string, value: T) => {
  readCache.set(key, { value, expiresAt: Date.now() + READ_CACHE_TTL_MS });
};

const clearCollectionCache = (collectionName: string) => {
  for (const key of readCache.keys()) {
    if (key.startsWith(`${collectionName}:`)) readCache.delete(key);
  }
};

const applyFilters = (builder: any, filters: FilterClause[]) =>
  filters.reduce((current, filter) => {
    const column = `data->>${filter.field}`;
    if (filter.op === "in" && Array.isArray(filter.value)) {
      return current.in(column, filter.value);
    }
    return current.eq(column, String(filter.value));
  }, builder);

const docSnapshot = (id: string, data?: Record<string, unknown> | null): any => ({
  id,
  exists: () => Boolean(data),
  data: () => data ?? {},
});

const fetchDoc = async (ref: DocumentRef, useCache: boolean) => {
  const cacheKey = `${ref.collectionName}:doc:${ref.id}`;
  if (useCache) {
    const cached = getCachedValue<Record<string, unknown> | null>(cacheKey);
    if (cached !== null) return docSnapshot(ref.id, cached);
  }

  const { data, error } = await dataApi(ref.collectionName)
    .select("id,data")
    .eq("id", ref.id)
    .maybeSingle();

  if (error) throw error;
  const value = data?.data ?? null;
  setCachedValue(cacheKey, value);
  return docSnapshot(ref.id, value);
};

export async function getDoc(ref: DocumentRef) {
  return fetchDoc(ref, true);
}

export async function getDocFromServer(ref: DocumentRef) {
  return fetchDoc(ref, false);
}

export async function getDocs(ref: CollectionRef | QueryRef) {
  const collectionName = ref.type === "collection" ? ref.name : ref.collectionName;
  const filters = ref.type === "query" ? ref.filters : [];
  const cacheKey = `${collectionName}:query:${JSON.stringify(filters)}`;
  const cached = getCachedValue<{ id: string; data: Record<string, unknown> }[]>(cacheKey);
  if (cached) {
    const docs = cached.map((row) => docSnapshot(row.id, row.data));
    return {
      docs,
      empty: docs.length === 0,
      size: docs.length,
    };
  }

  const { data, error } = await applyFilters(dataApi(collectionName).select("id,data"), filters);

  if (error) throw error;

  const rows = (data ?? []) as { id: string; data: Record<string, unknown> }[];
  setCachedValue(cacheKey, rows);

  const docs = rows.map((row) => docSnapshot(row.id, row.data));

  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
  };
}

const resolveUpdate = (current: Record<string, unknown>, update: Record<string, unknown>) => {
  const next = { ...current };
  const setNestedValue = (path: string, value: unknown, remove = false) => {
    const segments = path.split(".");
    if (segments.length === 1) {
      if (remove) delete next[path];
      else next[path] = value;
      return;
    }
    let target = next;
    for (const segment of segments.slice(0, -1)) {
      const existing = target[segment];
      target[segment] = existing && typeof existing === "object" && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
      target = target[segment] as Record<string, unknown>;
    }
    const leaf = segments.at(-1)!;
    if (remove) delete target[leaf];
    else target[leaf] = value;
  };
  const getNestedValue = (path: string) =>
    path.split(".").reduce<unknown>((value, segment) => (
      value && typeof value === "object"
        ? (value as Record<string, unknown>)[segment]
        : undefined
    ), next);

  for (const [key, rawValue] of Object.entries(update)) {
    const value = serializeValue(rawValue) as unknown;
    if ((value as DeleteFieldValue)?.__op === "deleteField") {
      setNestedValue(key, undefined, true);
    } else if ((value as IncrementValue)?.__op === "increment") {
      setNestedValue(key, Number(getNestedValue(key) ?? 0) + (value as IncrementValue).value);
    } else {
      setNestedValue(key, value);
    }
  }
  return next;
};

export async function setDoc(
  ref: DocumentRef,
  value: Record<string, unknown>,
  options?: { merge?: boolean },
) {
  const incoming = serializeValue(value) as Record<string, unknown>;
  let data = incoming;

  if (options?.merge) {
    const existing = await getDoc(ref);
    data = resolveUpdate(existing.data(), incoming);
  }

  const { error } = await dataApi(ref.collectionName).upsert({
    id: ref.id,
    data,
  });

  if (error) throw error;
  clearCollectionCache(ref.collectionName);
}

export async function updateDoc(ref: DocumentRef, value: Record<string, unknown>) {
  const existing = await getDoc(ref);
  if (!existing.exists()) {
    throw new Error(`Document ${ref.collectionName}/${ref.id} does not exist.`);
  }

  const next = resolveUpdate(existing.data(), value);
  const { error } = await dataApi(ref.collectionName)
    .update({ data: next })
    .eq("id", ref.id);

  if (error) throw error;
  clearCollectionCache(ref.collectionName);
}

export async function deleteDoc(ref: DocumentRef) {
  const { error } = await dataApi(ref.collectionName).delete().eq("id", ref.id);
  if (error) throw error;
  clearCollectionCache(ref.collectionName);
}

export async function addDoc(collectionRef: CollectionRef, value: Record<string, unknown>) {
  const ref = doc(collectionRef);
  await setDoc(ref, value);
  return ref;
}

export function serverTimestamp() {
  return timestampNow();
}

export function increment(value: number): IncrementValue {
  return { __op: "increment", value };
}

export function deleteField(): DeleteFieldValue {
  return { __op: "deleteField" };
}

export async function getCountFromServer(ref: CollectionRef | QueryRef) {
  const snapshot = await getDocs(ref);
  return {
    data: () => ({ count: snapshot.size }),
  };
}
