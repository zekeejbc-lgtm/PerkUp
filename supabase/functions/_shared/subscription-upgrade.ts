export const SUBSCRIPTION_UPGRADE_TERMS_VERSION = "subscription-upgrade-v1";
export const SUBSCRIPTION_UPGRADE_QUOTE_TTL_MS = 15 * 60 * 1000;

export type PlanLimits = {
  customerLimit: number;
  staffLimit: number;
  branchLimit: number;
  galleryPhotoLimit: number;
};

export type PlanSnapshot = {
  id: string;
  name: string;
  order: number;
  priceCentavos: number;
  interval: string;
  intervalDays: number;
  features: string[];
  dependencies: PlanLimits;
};

export type RenewalInvoiceState = {
  id: string;
  status: string;
  dueAt: string;
  periodStart: string;
  periodEnd: string;
  amountCentavos: number;
};

export type BillingQuoteState = {
  currentPeriodEnd: string;
  intervalDays: number;
  currentRenewalInvoice: RenewalInvoiceState | null;
  now: string;
};

export type TargetRenewal = {
  periodStart: string;
  periodEnd: string;
  alreadyIssued: boolean;
  currentRenewalInvoiceId: string | null;
  currentRenewalInvoiceStatus: string | null;
};

export type UpgradeFingerprintInput = {
  subscriptionId: string;
  fromPlanId: string;
  toPlanId: string;
  currentAmountCentavos: number;
  targetAmountCentavos: number;
  targetPeriodStart: string;
  targetPeriodEnd: string;
  currentRenewalInvoiceId: string | null;
  currentRenewalInvoiceStatus: string | null;
  termsVersion: string;
  planCatalogUpdatedAt: string;
};

export type UpgradeQuoteInput = {
  storeId: string;
  subscription: {
    id: string;
    planId: string;
    amountCentavos: number;
    intervalDays: number;
    currentPeriodEnd: string;
    renewalMode: "automatic" | "manual";
  };
  plans: PlanSnapshot[];
  targetPlanId: string;
  currentRenewalInvoice: RenewalInvoiceState | null;
  planCatalogUpdatedAt: string;
  now?: string;
};

export type UpgradeQuote = {
  storeId: string;
  subscriptionId: string;
  currentPlan: PlanSnapshot;
  targetPlan: PlanSnapshot;
  amountDueTodayCentavos: 0;
  differenceCentavos: number;
  nextRenewal: {
    periodStart: string;
    periodEnd: string;
    amountCentavos: number;
    planId: string;
    alreadyIssued: boolean;
    invoiceId: string | null;
  };
  targetRenewal: {
    periodStart: string;
    periodEnd: string;
    amountCentavos: number;
    planId: string;
  };
  renewalMode: "automatic" | "manual";
  termsVersion: string;
  quotedAt: string;
  expiresAt: string;
  quoteFingerprint: string;
};

const cleanText = (value: unknown, maxLength: number) =>
  String(value ?? "").trim().slice(0, maxLength);

const normalizeLimit = (value: unknown, fallback: number, maximum = 1_000_000_000) => {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(maximum, parsed))
    : fallback;
};

const intervalDaysFor = (interval: string) => {
  if (interval === "year") return 365;
  if (interval === "one-time") return 0;
  return 30;
};

const normalizeFeatures = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    const feature = cleanText(entry, 300);
    const key = feature.toLocaleLowerCase();
    if (!feature || seen.has(key)) continue;
    seen.add(key);
    result.push(feature);
  }
  return result.slice(0, 100);
};

export function normalizePlanCatalog(settingsData: unknown): PlanSnapshot[] {
  const settings = settingsData && typeof settingsData === "object"
    ? settingsData as Record<string, unknown>
    : {};
  const plans = Array.isArray(settings.plans) ? settings.plans : [];
  const configuredTierRankCount = plans.filter((entry) => {
    const source = entry && typeof entry === "object"
      ? entry as Record<string, unknown>
      : {};
    return source.tierRank !== undefined
      && source.tierRank !== null
      && source.tierRank !== "";
  }).length;
  if (configuredTierRankCount > 0 && configuredTierRankCount !== plans.length) {
    throw new Error("Every subscription plan must declare a tier rank.");
  }

  const normalized = plans.map((entry, catalogIndex) => {
    const source = entry && typeof entry === "object"
      ? entry as Record<string, unknown>
      : {};
    const id = cleanText(source.id, 80).toLocaleLowerCase();
    const name = cleanText(source.name, 80);
    const price = Number(source.price);
    const priceCentavos = Math.round(price * 100);
    const rawInterval = cleanText(source.interval || "month", 20).toLocaleLowerCase();
    const interval = ["month", "year", "one-time"].includes(rawInterval)
      ? rawInterval
      : "month";
    const dependencies = source.dependencies && typeof source.dependencies === "object"
      ? source.dependencies as Record<string, unknown>
      : {};

    if (!id || !name || !Number.isFinite(price) || !Number.isInteger(priceCentavos) || priceCentavos < 100) {
      throw new Error(`Subscription plan ${catalogIndex + 1} has an invalid id, name, or price.`);
    }

    return {
      id,
      name,
      order: configuredTierRankCount === plans.length
        ? Number(source.tierRank)
        : 0,
      priceCentavos,
      interval,
      intervalDays: intervalDaysFor(interval),
      features: normalizeFeatures(source.features),
      dependencies: {
        customerLimit: normalizeLimit(dependencies.customerLimit, 0),
        staffLimit: normalizeLimit(dependencies.staffLimit, 0),
        branchLimit: normalizeLimit(dependencies.branchLimit, 1),
        galleryPhotoLimit: Math.max(
          3,
          Math.min(10, normalizeLimit(dependencies.galleryPhotoLimit, 3, 10)),
        ),
      },
      catalogIndex,
    };
  });

  if (configuredTierRankCount === plans.length) {
    if (normalized.some((plan) => !Number.isInteger(plan.order) || plan.order < 0)) {
      throw new Error("Tier ranks must be non-negative whole numbers.");
    }
    if (new Set(normalized.map((plan) => plan.order)).size !== normalized.length) {
      throw new Error("Tier ranks must be unique.");
    }
  } else {
    normalized.sort((left, right) =>
      left.priceCentavos - right.priceCentavos
      || left.catalogIndex - right.catalogIndex
    );
    normalized.forEach((plan, index) => {
      plan.order = index * 10;
    });
  }

  return normalized
    .sort((left, right) => left.order - right.order || left.catalogIndex - right.catalogIndex)
    .map(({ catalogIndex: _catalogIndex, ...plan }) => plan);
}

const matchesPlan = (plan: PlanSnapshot, idOrName: string) => {
  const target = cleanText(idOrName, 80).toLocaleLowerCase();
  return plan.id.toLocaleLowerCase() === target
    || plan.name.toLocaleLowerCase() === target;
};

export function findPlan(
  plans: PlanSnapshot[],
  idOrName: string,
): PlanSnapshot | null {
  return plans.find((plan) => matchesPlan(plan, idOrName)) || null;
}

export function listEligibleUpgradePlans(
  plans: PlanSnapshot[],
  currentPlanIdOrName: string,
): PlanSnapshot[] {
  const current = findPlan(plans, currentPlanIdOrName);
  if (!current || current.interval === "one-time") return [];
  return plans.filter((candidate) =>
    candidate.id !== current.id
    && candidate.order > current.order
    && candidate.priceCentavos > current.priceCentavos
    && candidate.interval === current.interval
  );
}

const parseIso = (value: string, label: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} is invalid.`);
  return parsed;
};

export function resolveUpgradeTargetPeriod(input: BillingQuoteState): TargetRenewal {
  const now = parseIso(input.now, "Quote time");
  const currentPeriodEnd = parseIso(input.currentPeriodEnd, "Current period end");
  const intervalDays = Math.trunc(Number(input.intervalDays));
  if (!Number.isFinite(intervalDays) || intervalDays < 1 || intervalDays > 365) {
    throw new Error("The subscription billing interval is invalid.");
  }

  const invoice = input.currentRenewalInvoice;
  if (invoice && parseIso(invoice.dueAt, "Renewal due date").getTime() < now.getTime()) {
    throw new Error("Resolve the overdue renewal before scheduling an upgrade.");
  }

  const periodStart = invoice
    ? parseIso(invoice.periodEnd, "Renewal period end")
    : currentPeriodEnd;
  const periodEnd = new Date(periodStart.getTime() + intervalDays * 86_400_000);

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    alreadyIssued: Boolean(invoice),
    currentRenewalInvoiceId: invoice?.id || null,
    currentRenewalInvoiceStatus: invoice?.status || null,
  };
}

export async function computeSubscriptionUpgradeFingerprint(
  input: UpgradeFingerprintInput,
): Promise<{ quoteFingerprint: string }> {
  const canonicalJson = JSON.stringify({
    subscriptionId: input.subscriptionId,
    fromPlanId: input.fromPlanId,
    toPlanId: input.toPlanId,
    currentAmountCentavos: input.currentAmountCentavos,
    targetAmountCentavos: input.targetAmountCentavos,
    targetPeriodStart: input.targetPeriodStart,
    targetPeriodEnd: input.targetPeriodEnd,
    currentRenewalInvoiceId: input.currentRenewalInvoiceId,
    currentRenewalInvoiceStatus: input.currentRenewalInvoiceStatus,
    termsVersion: input.termsVersion,
    planCatalogUpdatedAt: input.planCatalogUpdatedAt,
  });
  const bytes = new TextEncoder().encode(canonicalJson);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const quoteFingerprint = Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return { quoteFingerprint };
}

export async function buildSubscriptionUpgradeQuote(
  input: UpgradeQuoteInput,
): Promise<UpgradeQuote> {
  const now = parseIso(input.now || new Date().toISOString(), "Quote time");
  const currentCatalogPlan = findPlan(input.plans, input.subscription.planId);
  const targetCatalogPlan = findPlan(input.plans, input.targetPlanId);
  if (!currentCatalogPlan) {
    throw new Error("The active subscription plan is not in the current plan catalog.");
  }
  const eligiblePlans = listEligibleUpgradePlans(input.plans, currentCatalogPlan.id)
    .filter((plan) => plan.priceCentavos > input.subscription.amountCentavos);
  if (!targetCatalogPlan || !eligiblePlans.some((plan) => plan.id === targetCatalogPlan.id)) {
    throw new Error("The selected plan is not an eligible upgrade.");
  }

  const target = resolveUpgradeTargetPeriod({
    currentPeriodEnd: input.subscription.currentPeriodEnd,
    intervalDays: input.subscription.intervalDays,
    currentRenewalInvoice: input.currentRenewalInvoice,
    now: now.toISOString(),
  });
  const currentPlan: PlanSnapshot = {
    ...currentCatalogPlan,
    priceCentavos: input.subscription.amountCentavos,
    intervalDays: input.subscription.intervalDays,
  };
  const targetPlan: PlanSnapshot = {
    ...targetCatalogPlan,
    intervalDays: input.subscription.intervalDays,
  };
  const { quoteFingerprint } = await computeSubscriptionUpgradeFingerprint({
    subscriptionId: input.subscription.id,
    fromPlanId: currentPlan.id,
    toPlanId: targetPlan.id,
    currentAmountCentavos: currentPlan.priceCentavos,
    targetAmountCentavos: targetPlan.priceCentavos,
    targetPeriodStart: target.periodStart,
    targetPeriodEnd: target.periodEnd,
    currentRenewalInvoiceId: target.currentRenewalInvoiceId,
    currentRenewalInvoiceStatus: target.currentRenewalInvoiceStatus,
    termsVersion: SUBSCRIPTION_UPGRADE_TERMS_VERSION,
    planCatalogUpdatedAt: input.planCatalogUpdatedAt,
  });

  const currentInvoice = input.currentRenewalInvoice;
  const nextRenewal = currentInvoice
    ? {
      periodStart: parseIso(currentInvoice.periodStart, "Renewal period start").toISOString(),
      periodEnd: parseIso(currentInvoice.periodEnd, "Renewal period end").toISOString(),
      amountCentavos: currentInvoice.amountCentavos,
      planId: currentPlan.id,
      alreadyIssued: true,
      invoiceId: currentInvoice.id,
    }
    : {
      periodStart: target.periodStart,
      periodEnd: target.periodEnd,
      amountCentavos: targetPlan.priceCentavos,
      planId: targetPlan.id,
      alreadyIssued: false,
      invoiceId: null,
    };

  return {
    storeId: input.storeId,
    subscriptionId: input.subscription.id,
    currentPlan,
    targetPlan,
    amountDueTodayCentavos: 0,
    differenceCentavos: targetPlan.priceCentavos - currentPlan.priceCentavos,
    nextRenewal,
    targetRenewal: {
      periodStart: target.periodStart,
      periodEnd: target.periodEnd,
      amountCentavos: targetPlan.priceCentavos,
      planId: targetPlan.id,
    },
    renewalMode: input.subscription.renewalMode,
    termsVersion: SUBSCRIPTION_UPGRADE_TERMS_VERSION,
    quotedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SUBSCRIPTION_UPGRADE_QUOTE_TTL_MS).toISOString(),
    quoteFingerprint,
  };
}
