export interface DirectoryStore {
  id: string;
  name: string;
  lat?: number;
  lng?: number;
  description?: string;
  contact?: string;
  logoUrl?: string;
  category?: string;
  hours?: string;
}

export const FEATURED_STORE_CATEGORIES = [
  "Coffee",
  "Pizza",
  "Formal Dinner",
  "Restaurant",
  "Fast Food",
  "Bakery",
  "Desserts",
  "Bar",
  "Retail",
  "Salon",
  "Fitness",
  "Bookstore",
];

const DAY_INDEX: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

export const normalizeStoreCategory = (category?: string) =>
  category?.trim().toLocaleLowerCase() || "";

const parseTimeInMinutes = (value: string) => {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const period = match[3]?.toLowerCase();
  if (hour > 24 || minute > 59 || (period && hour > 12)) return null;
  if (period === "am" && hour === 12) hour = 0;
  if (period === "pm" && hour !== 12) hour += 12;
  return hour * 60 + minute;
};

const dayIsInRange = (day: number, start: number, end: number) =>
  start <= end ? day >= start && day <= end : day >= start || day <= end;

export const isStoreOpenNow = (hours?: string, now = new Date()) => {
  if (!hours?.trim()) return false;
  const normalizedHours = hours.trim().toLowerCase();
  if (normalizedHours.includes("24/7") || normalizedHours.includes("open 24 hours")) return true;
  if (normalizedHours === "closed") return false;

  const day = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const pattern = /(?:^|[,;\n])\s*([a-z]{3,9})(?:\s*-\s*([a-z]{3,9}))?\s*:?\s*(closed|open 24 hours|(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))/gi;
  let foundSchedule = false;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(normalizedHours)) !== null) {
    const startDay = DAY_INDEX[match[1]];
    const endDay = DAY_INDEX[match[2] || match[1]];
    if (startDay === undefined || endDay === undefined || !dayIsInRange(day, startDay, endDay)) continue;
    foundSchedule = true;
    if (match[3] === "closed") return false;
    if (match[3] === "open 24 hours") return true;
    const opens = parseTimeInMinutes(match[4]);
    const closes = parseTimeInMinutes(match[5]);
    if (opens === null || closes === null) return false;
    return closes < opens
      ? currentMinutes >= opens || currentMinutes < closes
      : currentMinutes >= opens && currentMinutes < closes;
  }

  if (foundSchedule) return false;
  const genericRange = normalizedHours.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
  if (!genericRange) return false;
  const opens = parseTimeInMinutes(genericRange[1]);
  const closes = parseTimeInMinutes(genericRange[2]);
  if (opens === null || closes === null) return false;
  return closes < opens
    ? currentMinutes >= opens || currentMinutes < closes
    : currentMinutes >= opens && currentMinutes < closes;
};

export const getStoreCategories = (stores: DirectoryStore[]) => [
  "All",
  ...Array.from(
    new Map(
      [...FEATURED_STORE_CATEGORIES, ...stores.map((store) => store.category).filter(Boolean) as string[]]
        .map((category) => [normalizeStoreCategory(category), category.trim()])
    ).values()
  ),
];

export const getAvailableStoreCategories = (stores: DirectoryStore[]) => [
  "All",
  ...Array.from(
    new Map(
      (stores.map((store) => store.category).filter(Boolean) as string[])
        .map((category) => [normalizeStoreCategory(category), category.trim()])
    ).values()
  ).sort((a, b) => a.localeCompare(b)),
];

export const storeMatchesFilters = (
  store: DirectoryStore,
  searchQuery: string,
  selectedCategory: string,
  openNowOnly: boolean,
  availableAt?: Date | null,
) => {
  const query = searchQuery.trim().toLocaleLowerCase();
  return (
    (selectedCategory === "All" ||
      normalizeStoreCategory(store.category) === normalizeStoreCategory(selectedCategory)) &&
    ((!openNowOnly && !availableAt) || isStoreOpenNow(store.hours, availableAt || new Date())) &&
    (!query ||
      store.name.toLocaleLowerCase().includes(query) ||
      store.description?.toLocaleLowerCase().includes(query) ||
      store.category?.toLocaleLowerCase().includes(query))
  );
};
