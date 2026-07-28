import {
  assertEquals,
  assertNotEquals,
  assertRejects,
  assertThrows,
} from "jsr:@std/assert@1";
import {
  buildSubscriptionUpgradeQuote,
  computeSubscriptionUpgradeFingerprint,
  listEligibleUpgradePlans,
  normalizePlanCatalog,
  resolveUpgradeTargetPeriod,
} from "./subscription-upgrade.ts";

const plan = (
  id: string,
  name: string,
  order: number,
  priceCentavos: number,
) => ({
  id,
  name,
  order,
  priceCentavos,
  interval: "month",
  intervalDays: 30,
  features: [],
  dependencies: {
    customerLimit: 1000,
    staffLimit: 1,
    branchLimit: 1,
    galleryPhotoLimit: 3,
  },
});

Deno.test("normalizes the ordered settings catalog into integer-centavo snapshots", () => {
  assertEquals(
    normalizePlanCatalog({
      plans: [{
        id: " premium ",
        name: " Premium ",
        price: 1999.5,
        interval: "month",
        features: [" Priority support ", "", "Priority support"],
        dependencies: {
          customerLimit: 10_000,
          staffLimit: 5,
          branchLimit: 3,
          galleryPhotoLimit: 6,
        },
      }],
    }),
    [{
      id: "premium",
      name: "Premium",
      order: 0,
      priceCentavos: 199_950,
      interval: "month",
      intervalDays: 30,
      features: ["Priority support"],
      dependencies: {
        customerLimit: 10_000,
        staffLimit: 5,
        branchLimit: 3,
        galleryPhotoLimit: 6,
      },
    }],
  );
});

Deno.test("targets upcoming renewal when no renewal invoice exists", () => {
  const target = resolveUpgradeTargetPeriod({
    currentPeriodEnd: "2026-07-31T00:00:00.000Z",
    intervalDays: 30,
    currentRenewalInvoice: null,
    now: "2026-07-20T00:00:00.000Z",
  });
  assertEquals(target.periodStart, "2026-07-31T00:00:00.000Z");
  assertEquals(target.periodEnd, "2026-08-30T00:00:00.000Z");
  assertEquals(target.alreadyIssued, false);
});

Deno.test("targets following renewal when an active invoice exists", () => {
  const target = resolveUpgradeTargetPeriod({
    currentPeriodEnd: "2026-07-31T00:00:00.000Z",
    intervalDays: 30,
    currentRenewalInvoice: {
      id: "invoice-current",
      status: "link_created",
      dueAt: "2026-07-31T00:00:00.000Z",
      periodStart: "2026-07-31T00:00:00.000Z",
      periodEnd: "2026-08-30T00:00:00.000Z",
      amountCentavos: 99_900,
    },
    now: "2026-07-20T00:00:00.000Z",
  });
  assertEquals(target.periodStart, "2026-08-30T00:00:00.000Z");
  assertEquals(target.periodEnd, "2026-09-29T00:00:00.000Z");
  assertEquals(target.alreadyIssued, true);
});

Deno.test("rejects equal, earlier, cheaper, and incompatible targets", () => {
  const plans = [
    plan("standard", "Standard", 0, 99_900),
    plan("premium", "Premium", 1, 199_900),
    plan("promo", "Promo", 2, 89_900),
    { ...plan("annual", "Annual", 3, 499_900), interval: "year", intervalDays: 365 },
  ];
  assertEquals(
    listEligibleUpgradePlans(plans, "premium").map((candidate) => candidate.id),
    [],
  );
  assertEquals(
    listEligibleUpgradePlans(plans, "standard").map((candidate) => candidate.id),
    ["premium"],
  );
});

Deno.test("fingerprint changes when authoritative state changes", async () => {
  const base = {
    subscriptionId: "subscription-a",
    fromPlanId: "standard",
    toPlanId: "premium",
    currentAmountCentavos: 99_900,
    targetPeriodStart: "2026-07-31T00:00:00.000Z",
    targetPeriodEnd: "2026-08-30T00:00:00.000Z",
    currentRenewalInvoiceId: null,
    currentRenewalInvoiceStatus: null,
    termsVersion: "subscription-upgrade-v1",
    planCatalogUpdatedAt: "2026-07-28T00:00:00.000Z",
  };
  const first = await computeSubscriptionUpgradeFingerprint({
    ...base,
    targetAmountCentavos: 199_900,
  });
  const second = await computeSubscriptionUpgradeFingerprint({
    ...base,
    targetAmountCentavos: 200_000,
  });
  assertNotEquals(first.quoteFingerprint, second.quoteFingerprint);
});

Deno.test("blocks an overdue renewal", () => {
  assertThrows(
    () => resolveUpgradeTargetPeriod({
      currentPeriodEnd: "2026-07-01T00:00:00.000Z",
      intervalDays: 30,
      currentRenewalInvoice: {
        id: "invoice-overdue",
        status: "link_created",
        dueAt: "2026-07-01T00:00:00.000Z",
        periodStart: "2026-07-01T00:00:00.000Z",
        periodEnd: "2026-07-31T00:00:00.000Z",
        amountCentavos: 99_900,
      },
      now: "2026-07-20T00:00:00.000Z",
    }),
    Error,
    "Resolve the overdue renewal before scheduling an upgrade.",
  );
});

Deno.test("builds a zero-due-today quote from authoritative subscription state", async () => {
  const quote = await buildSubscriptionUpgradeQuote({
    storeId: "store-a",
    subscription: {
      id: "subscription-a",
      planId: "standard",
      amountCentavos: 99_900,
      intervalDays: 30,
      currentPeriodEnd: "2026-07-31T00:00:00.000Z",
      renewalMode: "automatic",
    },
    plans: [
      plan("standard", "Standard", 0, 99_900),
      plan("premium", "Premium", 1, 199_900),
    ],
    targetPlanId: "premium",
    currentRenewalInvoice: null,
    planCatalogUpdatedAt: "2026-07-28T00:00:00.000Z",
    now: "2026-07-20T00:00:00.000Z",
  });

  assertEquals(quote.amountDueTodayCentavos, 0);
  assertEquals(quote.differenceCentavos, 100_000);
  assertEquals(quote.nextRenewal.amountCentavos, 199_900);
  assertEquals(quote.nextRenewal.alreadyIssued, false);
  assertEquals(quote.targetRenewal.periodStart, "2026-07-31T00:00:00.000Z");
});

Deno.test("refuses a target that is no longer an eligible upgrade", async () => {
  await assertRejects(
    () => buildSubscriptionUpgradeQuote({
      storeId: "store-a",
      subscription: {
        id: "subscription-a",
        planId: "premium",
        amountCentavos: 199_900,
        intervalDays: 30,
        currentPeriodEnd: "2026-07-31T00:00:00.000Z",
        renewalMode: "automatic",
      },
      plans: [
        plan("standard", "Standard", 0, 99_900),
        plan("premium", "Premium", 1, 199_900),
      ],
      targetPlanId: "standard",
      currentRenewalInvoice: null,
      planCatalogUpdatedAt: "2026-07-28T00:00:00.000Z",
      now: "2026-07-20T00:00:00.000Z",
    }),
    Error,
    "The selected plan is not an eligible upgrade.",
  );
});
