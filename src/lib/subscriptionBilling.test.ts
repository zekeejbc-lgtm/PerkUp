import { describe, expect, it } from "vitest";
import {
  getPreferredSubscriptionPlan,
  getPreferredSubscriptionPlanIndex,
  normalizePreferredSubscriptionPlans,
  setPreferredSubscriptionPlan,
  type SubscriptionPlan,
} from "./subscriptionBilling";

const createPlans = (preferredIndexes: number[] = []): SubscriptionPlan[] =>
  ["Standard", "Premium", "Enterprise"].map((name, index) => ({
    id: name.toLowerCase(),
    name,
    preferred: preferredIndexes.includes(index),
  }));

describe("preferred subscription plans", () => {
  it("resolves an explicit preferred plan", () => {
    expect(getPreferredSubscriptionPlanIndex(createPlans([1]))).toBe(1);
    expect(getPreferredSubscriptionPlan(createPlans([1]))?.name).toBe("Premium");
  });

  it("uses the last plan for legacy data without a preference", () => {
    expect(getPreferredSubscriptionPlanIndex(createPlans())).toBe(2);
    expect(getPreferredSubscriptionPlan(createPlans())?.name).toBe("Enterprise");
  });

  it("normalizes multiple flags to the first explicit preference", () => {
    expect(
      normalizePreferredSubscriptionPlans(createPlans([0, 2])).map((plan) => plan.preferred),
    ).toEqual([true, false, false]);
  });

  it("marks only the selected plan as preferred", () => {
    expect(
      setPreferredSubscriptionPlan(createPlans([0]), 2).map((plan) => plan.preferred),
    ).toEqual([false, false, true]);
  });

  it("falls back to the new last plan after the preferred plan is removed", () => {
    const remaining = createPlans([2]).slice(0, 2);

    expect(
      normalizePreferredSubscriptionPlans(remaining).map((plan) => plan.preferred),
    ).toEqual([false, true]);
  });

  it("returns no preference for an empty list", () => {
    expect(getPreferredSubscriptionPlanIndex([])).toBe(-1);
    expect(getPreferredSubscriptionPlan([])).toBeUndefined();
    expect(normalizePreferredSubscriptionPlans([])).toEqual([]);
  });
});
