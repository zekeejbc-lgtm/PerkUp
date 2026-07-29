import { describe, expect, test } from "vitest";
import {
  buildCustomerPromotionStores,
  filterCustomerPromotionStores,
  getCustomerPromotionSection,
  getStorePromotionGroups,
} from "./customerPromotionStores";

const NOW = Date.parse("2026-07-29T04:00:00.000Z");

const store = {
  id: "store-1",
  name: "Coffee House",
  category: "Cafe",
  address: "Tagum City",
  status: "active",
  logoUrl: "/coffee.png",
};

const activePromotion = {
  id: "active",
  storeId: "store-1",
  title: "Morning Coffee",
  active: true,
  startDate: "2026-07-01",
  endDate: "2026-08-01",
  maxRedemptions: 10,
  claimedCount: 2,
  store,
};

describe("customer promotion store directory", () => {
  test("groups each store once and reports literal active and archived counts", () => {
    const result = buildCustomerPromotionStores([
      activePromotion,
      {
        ...activePromotion,
        id: "ended",
        title: "June Coffee",
        endDate: "2026-07-01",
      },
    ], NOW);

    expect(result).toEqual([
      expect.objectContaining({
        id: "store-1",
        name: "Coffee House",
        category: "Cafe",
        logoUrl: "/coffee.png",
        promotionCount: 2,
        activeCount: 1,
        archivedCount: 1,
      }),
    ]);
  });

  test("filters stores by store identity without matching promotion titles", () => {
    const stores = buildCustomerPromotionStores([
      activePromotion,
      {
        ...activePromotion,
        id: "bakery-promo",
        storeId: "store-2",
        title: "Coffee-Flavored Bread",
        store: { id: "store-2", name: "Daily Bakery", category: "Bakery", status: "active" },
      },
    ], NOW);

    expect(filterCustomerPromotionStores(stores, "coffee").map((item) => item.id)).toEqual(["store-1"]);
    expect(filterCustomerPromotionStores(stores, "bakery").map((item) => item.id)).toEqual(["store-2"]);
    expect(filterCustomerPromotionStores(stores, "flavored")).toEqual([]);
  });
});

describe("customer promotion lifecycle", () => {
  test("archives ended, discontinued, fully claimed, upcoming, and inactive-store promotions", () => {
    expect(getCustomerPromotionSection(activePromotion, NOW)).toBe("Active promotions");
    expect(getCustomerPromotionSection({ ...activePromotion, endDate: "2026-07-01" }, NOW)).toBe("Archived & unavailable");
    expect(getCustomerPromotionSection({ ...activePromotion, active: false }, NOW)).toBe("Archived & unavailable");
    expect(getCustomerPromotionSection({ ...activePromotion, claimedCount: 10 }, NOW)).toBe("Archived & unavailable");
    expect(getCustomerPromotionSection({ ...activePromotion, startDate: "2026-08-01" }, NOW)).toBe("Archived & unavailable");
    expect(getCustomerPromotionSection({
      ...activePromotion,
      store: { ...store, status: "inactive" },
    }, NOW)).toBe("Archived & unavailable");
  });

  test("isolates the selected store and returns active before archived while honoring promotion search", () => {
    const groups = getStorePromotionGroups([
      {
        ...activePromotion,
        id: "other-store",
        storeId: "store-2",
        title: "Leaked Promotion",
        store: { id: "store-2", name: "Other Store", status: "active" },
      },
      { ...activePromotion, id: "ended", title: "Past Latte", endDate: "2026-07-01" },
      activePromotion,
    ], "store-1", "coffee", NOW);

    expect(groups.map((group) => group.section)).toEqual(["Active promotions"]);
    expect(groups.flatMap((group) => group.promotions.map((promotion) => promotion.id))).toEqual(["active"]);

    const allGroups = getStorePromotionGroups([
      { ...activePromotion, id: "ended", title: "Past Latte", endDate: "2026-07-01" },
      activePromotion,
    ], "store-1", "", NOW);

    expect(allGroups.map((group) => group.section)).toEqual(["Active promotions", "Archived & unavailable"]);
    expect(allGroups.flatMap((group) => group.promotions.map((promotion) => promotion.id))).toEqual(["active", "ended"]);
  });
});
