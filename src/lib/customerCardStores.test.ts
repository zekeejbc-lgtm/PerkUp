import assert from "node:assert/strict";
import { test } from "vitest";
import {
  buildCustomerCardStores,
  filterCustomerCardStores,
  getRewardStoreLocation,
  getRewardSection,
  getStoreRewardGroups,
} from "./customerCardStores.ts";

const NOW = Date.parse("2026-07-29T12:00:00+08:00");

test("groups duplicate card rows by store and sums loyalty credit", () => {
  const result = buildCustomerCardStores(
    [
      { id: "card-1", storeId: "store-1", storeName: "Fallback", stars: 3 },
      { id: "card-2", storeId: "store-1", storeName: "Fallback", stars: 4 },
    ],
    [{ id: "store-1", name: "Coffee House", logoUrl: "/coffee.png" }],
    [{ id: "promo-1", storeId: "store-1", progress: 2 }],
  );

  assert.equal(result.length, 1);
  assert.deepEqual(
    {
      id: result[0].id,
      name: result[0].name,
      logoUrl: result[0].logoUrl,
      loyaltyCredit: result[0].loyaltyCredit,
      rewardCount: result[0].rewardCount,
    },
    {
      id: "store-1",
      name: "Coffee House",
      logoUrl: "/coffee.png",
      loyaltyCredit: 7,
      rewardCount: 1,
    },
  );
});

test("filters the store directory by store name only", () => {
  const stores = buildCustomerCardStores(
    [
      { id: "card-1", storeId: "one", storeName: "Coffee House", stars: 1 },
      { id: "card-2", storeId: "two", storeName: "Bakery", stars: 2 },
    ],
    [],
    [
      { id: "promo-1", storeId: "one", title: "Reward title", progress: 1 },
      { id: "promo-2", storeId: "two", progress: 1 },
    ],
  );

  assert.deepEqual(filterCustomerCardStores(stores, "coffee").map((store) => store.id), ["one"]);
  assert.deepEqual(filterCustomerCardStores(stores, "reward title"), []);
});

test("classifies active rewards into ready and ongoing sections", () => {
  assert.equal(getRewardSection({ progress: 10, requiredStamps: 10 }, NOW), "Ready to Claim");
  assert.equal(getRewardSection({ progress: 3, requiredStamps: 10 }, NOW), "Ongoing");
  assert.equal(
    getRewardSection({ progress: 10, requiredStamps: 10, claim: { status: "claimed" } }, NOW),
    "Ready to Claim",
  );
});

test("archives redeemed, expired, inactive, and ended rewards", () => {
  assert.equal(getRewardSection({ claim: { status: "redeemed" } }, NOW), "Archived / Expired");
  assert.equal(getRewardSection({ claim: { status: "expired" } }, NOW), "Archived / Expired");
  assert.equal(getRewardSection({ active: false }, NOW), "Archived / Expired");
  assert.equal(getRewardSection({ endDate: "2026-01-01" }, NOW), "Archived / Expired");
});

test("returns only the selected store rewards in display order", () => {
  const groups = getStoreRewardGroups([
    { id: "other", storeId: "store-2", title: "Other", progress: 10, requiredStamps: 10 },
    { id: "archived", storeId: "store-1", title: "Archived", progress: 1, active: false },
    { id: "ongoing", storeId: "store-1", title: "Ongoing", progress: 2, requiredStamps: 10 },
    { id: "ready", storeId: "store-1", title: "Ready", progress: 10, requiredStamps: 10 },
  ], "store-1", "", NOW);

  assert.deepEqual(groups.map((group) => group.status), ["Ready to Claim", "Ongoing", "Archived / Expired"]);
  assert.deepEqual(
    groups.flatMap((group) => group.promotions.map((promo) => promo.id)),
    ["ready", "ongoing", "archived"],
  );
});

test("normalizes store coordinates and preserves address-only navigation", () => {
  assert.deepEqual(
    getRewardStoreLocation({ name: "Coffee House", latitude: "7.44", longitude: "125.8", address: "Tagum City" }),
    {
      name: "Coffee House",
      address: "Tagum City",
      lat: 7.44,
      lng: 125.8,
      hasCoordinates: true,
      canNavigate: true,
    },
  );
  assert.deepEqual(
    getRewardStoreLocation({ name: "Bakery", address: "Apokon Road" }),
    {
      name: "Bakery",
      address: "Apokon Road",
      lat: Number.NaN,
      lng: Number.NaN,
      hasCoordinates: false,
      canNavigate: true,
    },
  );
});
