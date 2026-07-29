import { getPhilippineDateTimeMillis } from "./dateTime";
import { getRemainingPromotionClaims } from "./promotionProgress";

export type CustomerPromotionSection = "Active promotions" | "Archived & unavailable";

export type CustomerPromotionStoreSummary = {
  id: string;
  name: string;
  category: string;
  address: string;
  logoUrl: string;
  promotionCount: number;
  activeCount: number;
  archivedCount: number;
  store: any;
};

export type CustomerPromotionGroup = {
  section: CustomerPromotionSection;
  promotions: any[];
};

const sectionOrder: CustomerPromotionSection[] = [
  "Active promotions",
  "Archived & unavailable",
];

const getPromotionStoreId = (promotion: any) =>
  String(promotion?.storeId || promotion?.store?.id || "");

export function getCustomerPromotionSection(
  promotion: any,
  now = Date.now(),
): CustomerPromotionSection {
  const storeStatus = String(promotion?.store?.status || "").toLowerCase();
  const startsAt = promotion?.startDate
    ? getPhilippineDateTimeMillis(promotion.startDate)
    : Number.NaN;
  const endsAt = promotion?.endDate
    ? getPhilippineDateTimeMillis(promotion.endDate)
    : Number.NaN;

  const active =
    Boolean(promotion?.store) &&
    (!storeStatus || storeStatus === "active") &&
    promotion?.active !== false &&
    (!Number.isFinite(startsAt) || startsAt <= now) &&
    (!Number.isFinite(endsAt) || endsAt > now) &&
    getRemainingPromotionClaims(promotion) !== 0;

  return active ? "Active promotions" : "Archived & unavailable";
}

export function buildCustomerPromotionStores(
  promotions: any[],
  now = Date.now(),
): CustomerPromotionStoreSummary[] {
  const summaries = new Map<string, CustomerPromotionStoreSummary>();

  promotions.forEach((promotion) => {
    const storeId = getPromotionStoreId(promotion);
    const store = promotion?.store;
    if (!storeId || !store) return;

    const existing = summaries.get(storeId) || {
      id: storeId,
      name: String(store.name || store.storeName || "Affiliated store"),
      category: String(store.category || "Partner store"),
      address: String(store.address || store.location || ""),
      logoUrl: String(store.logoUrl || store.imageUrl || ""),
      promotionCount: 0,
      activeCount: 0,
      archivedCount: 0,
      store,
    };

    existing.promotionCount += 1;
    if (getCustomerPromotionSection(promotion, now) === "Active promotions") {
      existing.activeCount += 1;
    } else {
      existing.archivedCount += 1;
    }
    summaries.set(storeId, existing);
  });

  return [...summaries.values()].sort((first, second) =>
    first.name.localeCompare(second.name));
}

export function filterCustomerPromotionStores(
  stores: CustomerPromotionStoreSummary[],
  search: string,
) {
  const term = search.trim().toLocaleLowerCase();
  if (!term) return stores;

  return stores.filter((store) =>
    [store.name, store.category, store.address]
      .some((value) => value.toLocaleLowerCase().includes(term)));
}

export function getStorePromotionGroups(
  promotions: any[],
  storeId: string,
  search: string,
  now = Date.now(),
): CustomerPromotionGroup[] {
  const term = search.trim().toLocaleLowerCase();
  const matchingPromotions = promotions
    .filter((promotion) => getPromotionStoreId(promotion) === storeId)
    .filter((promotion) => {
      if (!term) return true;
      return [
        promotion.title,
        promotion.description,
        promotion.linkedProductName,
      ].some((value) => String(value || "").toLocaleLowerCase().includes(term));
    })
    .sort((first, second) =>
      String(first.title || "").localeCompare(String(second.title || "")));

  return sectionOrder
    .map((section) => ({
      section,
      promotions: matchingPromotions.filter((promotion) =>
        getCustomerPromotionSection(promotion, now) === section),
    }))
    .filter((group) => group.promotions.length > 0);
}
