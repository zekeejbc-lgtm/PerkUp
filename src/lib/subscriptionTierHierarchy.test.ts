import { describe, expect, it } from "vitest";
import {
  moveSubscriptionPlanTier,
  normalizeSubscriptionTierHierarchy,
  validateSubscriptionTierHierarchy,
} from "./subscriptionBilling";

describe("subscription tier hierarchy", () => {
  it("infers legacy hierarchy by price instead of insertion order", () => {
    expect(normalizeSubscriptionTierHierarchy([
      { id: "enterprise", name: "Enterprise", price: 2999 },
      { id: "testing", name: "Testing Plan", price: 1 },
      { id: "standard", name: "Standard", price: 999 },
    ])).toMatchObject([
      { id: "testing", tierRank: 0 },
      { id: "standard", tierRank: 10 },
      { id: "enterprise", tierRank: 20 },
    ]);
  });

  it("uses explicit ranks even when catalog insertion order differs", () => {
    expect(normalizeSubscriptionTierHierarchy([
      { id: "enterprise", name: "Enterprise", price: 2999, tierRank: 30 },
      { id: "testing", name: "Testing Plan", price: 1, tierRank: 0 },
      { id: "standard", name: "Standard", price: 999, tierRank: 10 },
    ])).toMatchObject([
      { id: "testing", tierRank: 0 },
      { id: "standard", tierRank: 10 },
      { id: "enterprise", tierRank: 30 },
    ]);
  });

  it("reports duplicate and malformed tier configuration", () => {
    expect(validateSubscriptionTierHierarchy([
      { id: "standard", name: "Standard", price: 999, tierRank: 10 },
      { id: "premium", name: "Premium", price: 1999, tierRank: 10 },
      { id: "premium", name: "", price: 0, tierRank: -1 },
    ])).toEqual([
      "Every plan must have a unique ID.",
      "Every plan must have a name.",
      "Every plan price must be greater than zero.",
      "Tier ranks must be non-negative whole numbers.",
      "Tier ranks must be unique.",
    ]);
  });

  it("moves a plan lower and rewrites deterministic rank gaps", () => {
    expect(moveSubscriptionPlanTier([
      { id: "standard", name: "Standard", price: 999, tierRank: 0 },
      { id: "premium", name: "Premium", price: 1999, tierRank: 10 },
      { id: "testing", name: "Testing Plan", price: 1, tierRank: 30 },
    ], "testing", "lower")).toMatchObject([
      { id: "standard", tierRank: 0 },
      { id: "testing", tierRank: 10 },
      { id: "premium", tierRank: 20 },
    ]);
  });

  it("does not move beyond the lowest or highest boundary", () => {
    const plans = [
      { id: "standard", name: "Standard", price: 999, tierRank: 0 },
      { id: "premium", name: "Premium", price: 1999, tierRank: 10 },
    ];

    expect(moveSubscriptionPlanTier(plans, "standard", "lower")).toEqual(plans);
    expect(moveSubscriptionPlanTier(plans, "premium", "higher")).toEqual(plans);
  });
});
