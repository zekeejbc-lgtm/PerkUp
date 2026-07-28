import { describe, expect, it } from "vitest";
import {
  canConfirmUpgrade,
  formatPhpCentavos,
  getUpgradeFeatureGains,
  getUpgradeLimitRows,
  type SubscriptionPlanSnapshot,
} from "./subscriptionUpgrade";

const plan = (
  overrides: Partial<SubscriptionPlanSnapshot> = {},
): SubscriptionPlanSnapshot => ({
  id: "standard",
  name: "Standard",
  order: 0,
  priceCentavos: 99_900,
  interval: "month",
  intervalDays: 30,
  features: ["Basic analytics", "Standard support"],
  dependencies: {
    customerLimit: 1_000,
    staffLimit: 1,
    branchLimit: 1,
    galleryPhotoLimit: 3,
  },
  ...overrides,
});

describe("subscription upgrade presentation", () => {
  it("formats integer centavos without floating-point drift", () => {
    expect(formatPhpCentavos(199_900)).toBe("PHP 1,999");
    expect(formatPhpCentavos(199_950)).toBe("PHP 1,999.50");
  });

  it("returns only features newly gained by the target plan", () => {
    const current = plan();
    const target = plan({
      id: "premium",
      name: "Premium",
      features: [" basic analytics ", "Standard support", "Priority support"],
    });

    expect(getUpgradeFeatureGains(current, target)).toEqual(["Priority support"]);
  });

  it("shows literal before-and-after values for every enforced limit", () => {
    const current = plan();
    const target = plan({
      id: "premium",
      name: "Premium",
      dependencies: {
        customerLimit: 10_000,
        staffLimit: 5,
        branchLimit: 3,
        galleryPhotoLimit: 6,
      },
    });

    expect(getUpgradeLimitRows(current, target)).toEqual([
      { key: "customerLimit", label: "Customers", current: "1,000", target: "10,000" },
      { key: "staffLimit", label: "Staff accounts", current: "1", target: "5" },
      { key: "branchLimit", label: "Branches", current: "1", target: "3" },
      { key: "galleryPhotoLimit", label: "Gallery photos", current: "3", target: "6" },
    ]);
  });

  it("labels zero limits as unlimited", () => {
    const rows = getUpgradeLimitRows(plan(), plan({
      dependencies: {
        customerLimit: 0,
        staffLimit: 0,
        branchLimit: 0,
        galleryPhotoLimit: 10,
      },
    }));

    expect(rows[0].target).toBe("Unlimited");
    expect(rows[1].target).toBe("Unlimited");
    expect(rows[2].target).toBe("Unlimited");
  });
});

describe("subscription upgrade confirmation gate", () => {
  const expiresAt = "2026-07-28T12:15:00.000Z";
  const now = new Date("2026-07-28T12:10:00.000Z");

  it("allows confirmation only after reading and accepting unexpired terms", () => {
    expect(canConfirmUpgrade({
      reachedTermsEnd: true,
      accepted: true,
      expiresAt,
      now,
      submitting: false,
    })).toBe(true);
  });

  it.each([
    ["terms were not read", false, true, false, now],
    ["terms were not accepted", true, false, false, now],
    ["submission is running", true, true, true, now],
    ["the quote expired", true, true, false, new Date("2026-07-28T12:15:00.000Z")],
  ])("blocks confirmation when %s", (_label, reachedTermsEnd, accepted, submitting, at) => {
    expect(canConfirmUpgrade({
      reachedTermsEnd,
      accepted,
      expiresAt,
      now: at,
      submitting,
    })).toBe(false);
  });
});
