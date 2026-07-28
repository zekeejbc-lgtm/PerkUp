export type SubscriptionPlanLimits = {
  customerLimit: number;
  staffLimit: number;
  branchLimit: number;
  galleryPhotoLimit: number;
};

export type SubscriptionPlanSnapshot = {
  id: string;
  name: string;
  order: number;
  priceCentavos: number;
  interval: string;
  intervalDays: number;
  features: string[];
  dependencies: SubscriptionPlanLimits;
};

export type SubscriptionUpgradeQuote = {
  storeId: string;
  subscriptionId: string;
  currentPlan: SubscriptionPlanSnapshot;
  targetPlan: SubscriptionPlanSnapshot;
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

export type SubscriptionPlanChangeSummary = {
  id: string;
  status: "scheduled" | "locked" | "applied" | "cancelled" | "failed";
  fromPlan: SubscriptionPlanSnapshot;
  toPlan: SubscriptionPlanSnapshot;
  targetPeriodStart: string;
  targetAmountCentavos: number;
  renewalInvoiceId: string | null;
  requestedAt: string;
  lockedAt: string | null;
  appliedAt: string | null;
};

export type UpgradeLimitRow = {
  key: keyof SubscriptionPlanLimits;
  label: string;
  current: string;
  target: string;
};

const formatLimit = (value: number) =>
  value <= 0 ? "Unlimited" : Math.trunc(value).toLocaleString("en-PH");

export function formatPhpCentavos(amountCentavos: number) {
  const normalized = Math.max(0, Math.trunc(Number(amountCentavos) || 0));
  const wholePesos = Math.trunc(normalized / 100);
  const centavos = normalized % 100;
  const suffix = centavos === 0 ? "" : `.${String(centavos).padStart(2, "0")}`;
  return `PHP ${wholePesos.toLocaleString("en-PH")}${suffix}`;
}

export function getUpgradeFeatureGains(
  current: SubscriptionPlanSnapshot,
  target: SubscriptionPlanSnapshot,
) {
  const currentFeatures = new Set(
    current.features.map((feature) => feature.trim().toLocaleLowerCase()),
  );
  return target.features
    .map((feature) => feature.trim())
    .filter(Boolean)
    .filter((feature) => !currentFeatures.has(feature.toLocaleLowerCase()));
}

export function getUpgradeLimitRows(
  current: SubscriptionPlanSnapshot,
  target: SubscriptionPlanSnapshot,
): UpgradeLimitRow[] {
  const labels: Record<keyof SubscriptionPlanLimits, string> = {
    customerLimit: "Customers",
    staffLimit: "Staff accounts",
    branchLimit: "Branches",
    galleryPhotoLimit: "Gallery photos",
  };

  return (Object.keys(labels) as Array<keyof SubscriptionPlanLimits>).map((key) => ({
    key,
    label: labels[key],
    current: formatLimit(current.dependencies[key]),
    target: formatLimit(target.dependencies[key]),
  }));
}

export function canConfirmUpgrade(input: {
  reachedTermsEnd: boolean;
  accepted: boolean;
  expiresAt: string;
  now: Date;
  submitting: boolean;
}) {
  const expiresAt = new Date(input.expiresAt).getTime();
  return input.reachedTermsEnd
    && input.accepted
    && !input.submitting
    && Number.isFinite(expiresAt)
    && input.now.getTime() < expiresAt;
}
