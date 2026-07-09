export const PHILIPPINE_TIME_ZONE = "Asia/Manila";
export const PHILIPPINE_LOCALE = "en-PH";
export const PHILIPPINE_UTC_OFFSET = "+08:00";

type DateValue = Date | string | number | { seconds?: number; toDate?: () => Date } | null | undefined;
const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;

export function parsePhilippineDateTime(value: DateValue): Date | null {
  if (typeof value === "string" && LOCAL_DATE_TIME_PATTERN.test(value.trim())) {
    return toDate(`${value.trim()}${PHILIPPINE_UTC_OFFSET}`);
  }

  return toDate(value);
}

export function getPhilippineDateTimeMillis(value: DateValue) {
  return parsePhilippineDateTime(value)?.getTime() ?? Number.NaN;
}

export function toDate(value: DateValue): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "object") {
    if (typeof value.toDate === "function") return toDate(value.toDate());
    if (typeof value.seconds === "number") return toDate(value.seconds * 1000);
  }
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatPhilippineDateTime(value: DateValue, fallback = "Unknown") {
  const date = parsePhilippineDateTime(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(PHILIPPINE_LOCALE, {
    timeZone: PHILIPPINE_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatPhilippineDate(value: DateValue, fallback = "Unknown") {
  const date = parsePhilippineDateTime(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(PHILIPPINE_LOCALE, {
    timeZone: PHILIPPINE_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatTime12Hour(value?: string) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return String(value || "");
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return String(value || "");
  const period = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${period}`;
}

export function parseTime12Hour(value: string) {
  const normalized = value.trim().toUpperCase();
  const twelveHour = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (twelveHour) {
    const hour = Number(twelveHour[1]);
    const minute = Number(twelveHour[2] || 0);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    const hour24 = (hour % 12) + (twelveHour[3] === "PM" ? 12 : 0);
    return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  const twentyFourHour = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!twentyFourHour) return null;
  const hour = Number(twentyFourHour[1]);
  const minute = Number(twentyFourHour[2]);
  return hour <= 23 && minute <= 59
    ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
    : null;
}

export function formatStoreHours(openingTime?: string, closingTime?: string) {
  return `Mon-Sun: ${formatTime12Hour(openingTime)} - ${formatTime12Hour(closingTime)} (PHT)`;
}
