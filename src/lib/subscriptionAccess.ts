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
}

const DEFAULT_WARNING = "Your PerkUp subscription is almost ending. Please settle your balance to avoid an interruption.";
const DEFAULT_PAYMENT_INSTRUCTIONS = "Contact PerkUp support for payment instructions and send your proof of payment for verification.";

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
  };
};

export const getEffectiveSubscriptionStatus = (
  value: unknown,
  now = new Date(),
): SubscriptionAccessStatus => {
  const policy = normalizeSubscriptionAccess(value);
  if (policy.status !== "grace") return policy.status;
  const graceEndsAt = timestampToDate(policy.graceEndsAt);
  return graceEndsAt && graceEndsAt.getTime() <= now.getTime() ? "frozen" : "grace";
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
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
};

export const subscriptionNoticeDismissKey = (storeId: string, value: unknown) => {
  const policy = normalizeSubscriptionAccess(value);
  return `perkup:subscription-notice:${storeId}:${policy.updatedAt || policy.status}`;
};
