export type SubscriptionPlan = {
  id?: string;
  name?: string;
  price?: number | string;
  interval?: string;
  features?: string[];
  dependencies?: SubscriptionDependencies;
};

export type SubscriptionDependencies = {
  customerLimit?: number | string;
  staffLimit?: number | string;
  branchLimit?: number | string;
};

export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: "standard",
    name: "Standard",
    price: 99,
    interval: "month",
    features: ["Up to 1,000 customers", "Basic analytics", "Standard support", "1 Staff Account"],
    dependencies: { customerLimit: 1000, staffLimit: 1, branchLimit: 1 },
  },
  {
    id: "premium",
    name: "Premium",
    price: 199,
    interval: "month",
    features: ["Up to 10,000 customers", "Advanced analytics", "Priority support", "5 Staff Accounts", "Custom promotions"],
    dependencies: { customerLimit: 10000, staffLimit: 5, branchLimit: 3 },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 499,
    interval: "month",
    features: ["Unlimited customers", "Custom reporting", "24/7 Dedicated support", "Unlimited Staff Accounts", "White-label options"],
    dependencies: { customerLimit: 0, staffLimit: 0, branchLimit: 0 },
  },
];

export const PAYMENT_SCHEDULE_OPTIONS = [
  { value: "every_30_days", label: "Every 30 days from subscription start" },
  { value: "first_week", label: "Every 1st week of the month" },
  { value: "second_week", label: "Every 2nd week of the month" },
  { value: "third_week", label: "Every 3rd week of the month" },
  { value: "fourth_week", label: "Every 4th week of the month" },
  { value: "day_1", label: "Every 1st day of the month" },
  { value: "day_15", label: "Every 15th day of the month" },
  { value: "day_20", label: "Every 20th day of the month" },
];

export function formatPaymentSchedule(value?: string) {
  return PAYMENT_SCHEDULE_OPTIONS.find((option) => option.value === value)?.label || "Not set";
}

export function predictPaymentDates(
  schedule?: string,
  subscriptionStart?: any,
  subscriptionEnd?: any,
  count = 6,
  today = new Date(),
) {
  if (!schedule || count <= 0) return [];

  const start = toDate(subscriptionStart);
  const end = toDate(subscriptionEnd);
  const lowerBound = new Date(Math.max(
    new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime(),
    start?.getTime() || 0,
  ));
  const results: Date[] = [];
  const fixedDay = schedule.startsWith("day_") ? Number(schedule.slice(4)) : 0;
  const weekNumber = {
    first_week: 1,
    second_week: 2,
    third_week: 3,
    fourth_week: 4,
  }[schedule] || 0;
  const targetWeekday = start?.getDay() ?? 1;

  if (schedule === "every_30_days") {
    if (!start) return [];
    const candidate = new Date(start);
    candidate.setDate(candidate.getDate() + 30);
    while (candidate < lowerBound) candidate.setDate(candidate.getDate() + 30);
    while (results.length < count && (!end || candidate <= end)) {
      results.push(new Date(candidate));
      candidate.setDate(candidate.getDate() + 30);
    }
    return results;
  }

  for (let monthOffset = 0; monthOffset < 36 && results.length < count; monthOffset++) {
    const month = new Date(lowerBound.getFullYear(), lowerBound.getMonth() + monthOffset, 1);
    let candidate: Date | null = null;

    if (fixedDay) {
      candidate = new Date(month.getFullYear(), month.getMonth(), fixedDay);
    } else if (weekNumber) {
      const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
      const firstTargetWeekday = 1 + ((targetWeekday - firstOfMonth.getDay() + 7) % 7);
      candidate = new Date(month.getFullYear(), month.getMonth(), firstTargetWeekday + ((weekNumber - 1) * 7));
    }

    if (!candidate || candidate.getMonth() !== month.getMonth()) continue;
    if (candidate < lowerBound || (start && candidate < start)) continue;
    if (end && candidate > end) break;
    results.push(candidate);
  }

  return results;
}

export function formatPredictedPaymentDate(date: Date) {
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    weekday: "short",
  });
}

export function findSubscriptionPlan(plans: SubscriptionPlan[], level?: string) {
  const target = (level || "").trim().toLowerCase();
  return plans.find((plan) => {
    const name = (plan.name || "").trim().toLowerCase();
    const id = (plan.id || "").trim().toLowerCase();
    return name === target || id === target;
  });
}

export function getSubscriptionOwedAmount(
  plans: SubscriptionPlan[],
  level?: string,
  fallback = 0,
) {
  const plan = findSubscriptionPlan(plans, level);
  const price = Number(plan?.price);
  return Number.isFinite(price) ? price : fallback;
}

export function normalizeSubscriptionDependencies(value?: SubscriptionDependencies) {
  const toLimit = (entry: unknown, fallback = 0) => {
    const parsed = Number(entry);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback;
  };

  return {
    customerLimit: toLimit(value?.customerLimit),
    staffLimit: toLimit(value?.staffLimit),
    branchLimit: toLimit(value?.branchLimit, 1),
  };
}

export function getSubscriptionDependencies(plans: SubscriptionPlan[], level?: string) {
  return normalizeSubscriptionDependencies(findSubscriptionPlan(plans, level)?.dependencies);
}

export function formatSubscriptionLimit(value?: number | string, label = "items") {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) return `Unlimited ${label}`;
  return `${limit.toLocaleString("en-PH")} ${label}`;
}

export function getNextPaymentDate(
  schedule?: string,
  subscriptionStart?: any,
  subscriptionEnd?: any,
  today = new Date(),
) {
  return predictPaymentDates(schedule, subscriptionStart, subscriptionEnd, 1, today)[0] || null;
}

export function resolveStoreBilling(store: any, plans: SubscriptionPlan[], today = new Date()) {
  const currentAmount = Number(store?.owedAmount);
  const fallbackAmount = Number.isFinite(currentAmount)
    ? currentAmount
    : getSubscriptionOwedAmount(plans, store?.subscriptionLevel);
  const nextPlanAmount = getSubscriptionOwedAmount(plans, store?.subscriptionLevel, fallbackAmount);
  const nextPaymentDate = getNextPaymentDate(store?.paymentSchedule, store?.subscriptionStart, store?.subscriptionEnd, today);
  const pendingAmount = Number(store?.pendingOwedAmount);
  const effectiveAt = toDate(store?.pendingOwedAmountEffectiveAt);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const pendingCanApply = Number.isFinite(pendingAmount) && effectiveAt && effectiveAt <= startOfToday;

  if (pendingCanApply && pendingAmount !== fallbackAmount) {
    return {
      amountDue: pendingAmount,
      nextPlanAmount,
      pendingAmount: null,
      nextPaymentDate,
      shouldPersistAppliedAmount: true,
    };
  }

  if (Number.isFinite(pendingAmount) && pendingAmount !== fallbackAmount) {
    return {
      amountDue: fallbackAmount,
      nextPlanAmount,
      pendingAmount,
      nextPaymentDate: effectiveAt || nextPaymentDate,
      shouldPersistAppliedAmount: false,
    };
  }

  if (nextPlanAmount !== fallbackAmount && nextPaymentDate) {
    return {
      amountDue: fallbackAmount,
      nextPlanAmount,
      pendingAmount: nextPlanAmount,
      nextPaymentDate,
      shouldPersistAppliedAmount: false,
    };
  }

  return {
    amountDue: fallbackAmount,
    nextPlanAmount,
    pendingAmount: null,
    nextPaymentDate,
    shouldPersistAppliedAmount: false,
  };
}

export function formatMoney(amount: number) {
  return `PHP ${Number(amount || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function toDateInputValue(value: any) {
  const date = toDate(value);
  if (!date) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateInputToDate(value?: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function formatBillingDate(value: any) {
  const date = toDate(value);
  return date ? date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila" }) : "N/A";
}

function toDate(value: any) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.seconds === "number") {
    const date = new Date(value.seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
