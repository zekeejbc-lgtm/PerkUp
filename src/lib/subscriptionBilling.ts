export type SubscriptionPlan = {
  id?: string;
  name?: string;
  price?: number | string;
  interval?: string;
};

export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  { id: "standard", name: "Standard", price: 99, interval: "month" },
  { id: "premium", name: "Premium", price: 199, interval: "month" },
  { id: "enterprise", name: "Enterprise", price: 499, interval: "month" },
];

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
  return date ? date.toLocaleDateString() : "N/A";
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
