export type SubscriptionAccessStatus = "active" | "warning" | "grace" | "frozen";

export interface SubscriptionAccessPolicy {
  status: SubscriptionAccessStatus;
  warningMessage: string;
  gracePeriodDays: number;
  graceStartedAt: string;
  graceEndsAt: string;
  paymentInstructions: string;
  paymentLink: string;
  paymentContact: string;
  updatedAt: string;
  automationEnabled: boolean;
  warningLeadDays: number;
}

export interface AccountRestriction {
  status: "active" | "suspended";
  reason: string;
  internalNote: string;
  suspendedAt: string;
  suspendedBy: string;
  updatedAt: string;
  updatedBy: string;
}

const DEFAULT_WARNING = "Your PerkUp subscription is almost ending. Please settle your balance to avoid an interruption.";
const DEFAULT_PAYMENT_INSTRUCTIONS = "Contact PerkUp support for payment instructions and send your proof of payment for verification.";
export const DEFAULT_POLICY_SUSPENSION_MESSAGE = "Access has been suspended because this store requires an administrative review. Contact PerkUp Support if you believe this was a mistake.";

export const PAYMONGO_STANDARD_ACCESS: SubscriptionAccessPolicy = {
  status: "active",
  warningMessage: DEFAULT_WARNING,
  gracePeriodDays: 3,
  graceStartedAt: "",
  graceEndsAt: "",
  paymentInstructions: "Pay through the secure PayMongo payment page. Access updates automatically after PayMongo confirms the exact invoice amount.",
  paymentLink: "",
  paymentContact: "perkup.shop@youthserviceph.org",
  updatedAt: "",
  automationEnabled: true,
  warningLeadDays: 7,
};

const text = (value: unknown) => String(value || "").trim();

export const timestampToDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && value && "seconds" in value) {
    const seconds = Number((value as { seconds?: unknown }).seconds);
    return Number.isFinite(seconds) ? new Date(seconds * 1000) : null;
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

export const normalizeSubscriptionAccess = (value: unknown): SubscriptionAccessPolicy => {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawStatus = text(source.status).toLowerCase();
  const status: SubscriptionAccessStatus = rawStatus === "warning" || rawStatus === "grace" || rawStatus === "frozen"
    ? rawStatus
    : "active";
  const days = Math.trunc(Number(source.gracePeriodDays || 0));

  return {
    status,
    warningMessage: text(source.warningMessage) || DEFAULT_WARNING,
    gracePeriodDays: Number.isFinite(days) ? Math.max(0, Math.min(365, days)) : 0,
    graceStartedAt: timestampToDate(source.graceStartedAt)?.toISOString() || "",
    graceEndsAt: timestampToDate(source.graceEndsAt)?.toISOString() || "",
    paymentInstructions: text(source.paymentInstructions) || DEFAULT_PAYMENT_INSTRUCTIONS,
    paymentLink: text(source.paymentLink),
    paymentContact: text(source.paymentContact) || "perkup.shop@youthserviceph.org",
    updatedAt: timestampToDate(source.updatedAt)?.toISOString() || "",
    automationEnabled: source.automationEnabled === true,
    warningLeadDays: Math.max(0, Math.min(365, Math.trunc(Number(source.warningLeadDays ?? 7) || 0))),
  };
};

export const normalizeAccountRestriction = (value: unknown): AccountRestriction => {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    status: text(source.status).toLowerCase() === "suspended" ? "suspended" : "active",
    reason: text(source.reason) || DEFAULT_POLICY_SUSPENSION_MESSAGE,
    internalNote: text(source.internalNote),
    suspendedAt: timestampToDate(source.suspendedAt)?.toISOString() || "",
    suspendedBy: text(source.suspendedBy),
    updatedAt: timestampToDate(source.updatedAt)?.toISOString() || "",
    updatedBy: text(source.updatedBy),
  };
};

export const isAccountSuspended = (value: unknown) => normalizeAccountRestriction(value).status === "suspended";

export const resolveSubscriptionAccess = (
  value: unknown,
  subscriptionEnd?: unknown,
  now = new Date(),
): SubscriptionAccessPolicy => {
  const policy = normalizeSubscriptionAccess(value);
  if (policy.status === "grace") {
    const graceEndsAt = timestampToDate(policy.graceEndsAt);
    return { ...policy, status: graceEndsAt && graceEndsAt.getTime() <= now.getTime() ? "frozen" : "grace" };
  }
  if (policy.status !== "active" || !policy.automationEnabled) return policy;

  const end = timestampToDate(subscriptionEnd);
  if (!end) return policy;
  const warningStartsAt = new Date(end.getTime() - policy.warningLeadDays * 86_400_000);
  const graceEndsAt = new Date(end.getTime() + policy.gracePeriodDays * 86_400_000);
  if (now.getTime() < warningStartsAt.getTime()) return policy;
  if (now.getTime() < end.getTime()) return { ...policy, status: "warning" };
  if (policy.gracePeriodDays > 0 && now.getTime() < graceEndsAt.getTime()) {
    return { ...policy, status: "grace", graceStartedAt: end.toISOString(), graceEndsAt: graceEndsAt.toISOString() };
  }
  return { ...policy, status: "frozen", graceStartedAt: end.toISOString(), graceEndsAt: graceEndsAt.toISOString() };
};

export const getEffectiveSubscriptionStatus = (
  value: unknown,
  now = new Date(),
  subscriptionEnd?: unknown,
): SubscriptionAccessStatus => {
  return resolveSubscriptionAccess(value, subscriptionEnd, now).status;
};

export const getGraceTimeLabel = (value: unknown, now = new Date()) => {
  const policy = normalizeSubscriptionAccess(value);
  const end = timestampToDate(policy.graceEndsAt);
  if (!end) return "Grace period active";
  const remainingMs = Math.max(0, end.getTime() - now.getTime());
  const totalHours = Math.ceil(remainingMs / 3_600_000);
  if (totalHours < 24) return `${totalHours} hour${totalHours === 1 ? "" : "s"} remaining`;
  const days = Math.ceil(totalHours / 24);
  return `${days} day${days === 1 ? "" : "s"} remaining`;
};

export const safePaymentLink = (value: unknown) => {
  const link = text(value);
  if (!link) return "";
  try {
    const url = new URL(link);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    const isPayMongoHost = hostname === "pm.link"
      || hostname.endsWith(".pm.link")
      || hostname === "paymongo.page"
      || hostname.endsWith(".paymongo.page")
      || hostname === "paymongo.com"
      || hostname.endsWith(".paymongo.com");
    return url.protocol === "https:" && isPayMongoHost ? url.toString() : "";
  } catch {
    return "";
  }
};

export const subscriptionNoticeDismissKey = (storeId: string, value: unknown) => {
  const policy = normalizeSubscriptionAccess(value);
  return `perkup:subscription-notice:${storeId}:${policy.updatedAt}:${policy.status}`;
};
