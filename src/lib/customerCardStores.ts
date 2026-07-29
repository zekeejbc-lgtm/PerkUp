import { getPhilippineDateTimeMillis } from "./dateTime";

export type RewardSection = "Ready to Claim" | "Ongoing" | "Archived / Expired";

export type CustomerCardStoreSummary = {
  id: string;
  name: string;
  logoUrl: string;
  loyaltyCredit: number;
  rewardCount: number;
  cards: any[];
  store: any;
};

export type RewardStoreLocation = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  hasCoordinates: boolean;
  canNavigate: boolean;
};

const rewardSectionOrder: RewardSection[] = ["Ready to Claim", "Ongoing", "Archived / Expired"];

export function buildCustomerCardStores(cards: any[], stores: any[], promotions: any[]): CustomerCardStoreSummary[] {
  const storesById = new Map(stores.map((store) => [String(store.id || ""), store]));
  const cardsByStore = new Map<string, any[]>();

  cards.forEach((card) => {
    const storeId = String(card.storeId || "");
    if (!storeId) return;
    cardsByStore.set(storeId, [...(cardsByStore.get(storeId) || []), card]);
  });

  return [...cardsByStore.entries()]
    .map(([storeId, storeCards]) => {
      const store = storesById.get(storeId) || {};
      return {
        id: storeId,
        name: String(store.name || store.storeName || store.businessName || storeCards[0]?.storeName || "Participating store"),
        logoUrl: String(store.logoUrl || ""),
        loyaltyCredit: storeCards.reduce((sum, card) => sum + Math.max(Number(card.stars || 0), 0), 0),
        rewardCount: promotions.filter((promo) => String(promo.storeId || "") === storeId).length,
        cards: storeCards,
        store,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function filterCustomerCardStores(stores: CustomerCardStoreSummary[], search: string) {
  const term = search.trim().toLocaleLowerCase();
  return term
    ? stores.filter((store) => store.name.toLocaleLowerCase().includes(term))
    : stores;
}

export function getRewardSection(promo: any, now = Date.now()): RewardSection {
  const claimStatus = String(promo.claim?.status || "").toLocaleLowerCase();
  const endsAt = promo.endDate ? getPhilippineDateTimeMillis(promo.endDate) : Number.NaN;
  if (
    claimStatus === "redeemed"
    || claimStatus === "expired"
    || promo.active === false
    || (Number.isFinite(endsAt) && endsAt <= now)
  ) {
    return "Archived / Expired";
  }

  const required = Math.max(Number(promo.requiredStamps || 10), 1);
  return Number(promo.progress || 0) >= required ? "Ready to Claim" : "Ongoing";
}

export function getStoreRewardGroups(promotions: any[], storeId: string, search: string, now = Date.now()) {
  const term = search.trim().toLocaleLowerCase();
  const matching = promotions.filter((promo) => (
    String(promo.storeId || "") === storeId
    && (!term || [
      promo.title,
      promo.description,
      promo.publicId,
      promo.card?.publicId,
      promo.linkedProductName,
    ].some((value) => String(value || "").toLocaleLowerCase().includes(term)))
  ));

  return rewardSectionOrder
    .map((status) => ({
      status,
      promotions: matching.filter((promo) => getRewardSection(promo, now) === status),
    }))
    .filter((group) => group.promotions.length);
}

export function getRewardStoreLocation(store: any): RewardStoreLocation {
  const lat = Number(store.lat ?? store.latitude);
  const lng = Number(store.lng ?? store.longitude);
  const address = String(store.address || "").trim();
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng);

  return {
    name: String(store.name || store.storeName || store.businessName || "Store"),
    address,
    lat,
    lng,
    hasCoordinates,
    canNavigate: hasCoordinates || Boolean(address),
  };
}
