import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { doc, updateDoc } from "@/src/lib/dataCompat";
import { db } from "@/src/lib/backend";
import { useAuth } from "./AuthContext";

export const BASE_CURRENCY = "PHP";

export const SUPPORTED_CURRENCIES = [
  "PHP", "USD", "EUR", "GBP", "JPY", "KRW", "AUD", "CAD", "CHF", "CNY",
  "HKD", "SGD", "NZD", "INR", "IDR", "MYR", "THB", "BRL", "MXN", "ZAR",
  "TRY", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON", "ILS", "ISK",
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

const CURRENCY_NAMES = new Intl.DisplayNames(["en"], { type: "currency" });
const CACHE_KEY = "perkup:php-exchange-rates:v1";
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

type RateCache = {
  fetchedAt: number;
  date: string;
  rates: Record<string, number>;
};

type CurrencyContextValue = {
  currency: CurrencyCode;
  currencies: readonly CurrencyCode[];
  rateDate: string;
  ratesLoading: boolean;
  setCurrency: (currency: CurrencyCode) => Promise<void>;
  convertFromPhp: (amount: number) => number;
  convertToPhp: (amount: number) => number;
  formatCurrency: (amountInPhp: number, options?: Intl.NumberFormatOptions) => string;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && SUPPORTED_CURRENCIES.includes(value as CurrencyCode);
}

function readCachedRates(): RateCache | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || "null") as RateCache | null;
    return parsed?.rates && Number(parsed.rates[BASE_CURRENCY]) === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function getCurrencyName(code: CurrencyCode) {
  return CURRENCY_NAMES.of(code) || code;
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [currency, setCurrencyState] = useState<CurrencyCode>(BASE_CURRENCY);
  const [rateCache, setRateCache] = useState<RateCache | null>(() => readCachedRates());
  const [ratesLoading, setRatesLoading] = useState(false);

  useEffect(() => {
    setCurrencyState(isCurrencyCode(user?.currency) ? user.currency : BASE_CURRENCY);
  }, [user?.id, user?.currency]);

  useEffect(() => {
    const cacheIsFresh = rateCache && Date.now() - rateCache.fetchedAt < CACHE_MAX_AGE_MS;
    if (cacheIsFresh) return;

    const controller = new AbortController();
    setRatesLoading(true);
    fetch("https://api.frankfurter.dev/v1/latest?base=PHP", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Exchange-rate request failed (${response.status}).`);
        const data = await response.json() as { date?: string; rates?: Record<string, number> };
        const next: RateCache = {
          fetchedAt: Date.now(),
          date: data.date || "",
          rates: { [BASE_CURRENCY]: 1, ...(data.rates || {}) },
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(next));
        setRateCache(next);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.warn("Using cached/default PHP exchange rates:", error);
      })
      .finally(() => setRatesLoading(false));

    return () => controller.abort();
  }, []);

  const rate = Number(rateCache?.rates[currency]) || 1;
  const convertFromPhp = useCallback((amount: number) => Number(amount) * rate, [rate]);
  const convertToPhp = useCallback((amount: number) => Number(amount) / rate, [rate]);
  const formatCurrency = useCallback((amountInPhp: number, options?: Intl.NumberFormatOptions) => {
    const amount = convertFromPhp(Number(amountInPhp) || 0);
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      ...options,
    }).format(amount);
  }, [convertFromPhp, currency]);

  const setCurrency = useCallback(async (nextCurrency: CurrencyCode) => {
    if (!isCurrencyCode(nextCurrency)) return;
    const previous = currency;
    setCurrencyState(nextCurrency);
    if (!user?.id) return;
    try {
      await updateDoc(doc(db, "users", user.id), { currency: nextCurrency });
    } catch (error) {
      setCurrencyState(previous);
      throw error;
    }
  }, [currency, user?.id]);

  const value = useMemo<CurrencyContextValue>(() => ({
    currency,
    currencies: SUPPORTED_CURRENCIES,
    rateDate: rateCache?.date || "",
    ratesLoading,
    setCurrency,
    convertFromPhp,
    convertToPhp,
    formatCurrency,
  }), [currency, rateCache?.date, ratesLoading, setCurrency, convertFromPhp, convertToPhp, formatCurrency]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error("useCurrency must be used within CurrencyProvider.");
  return context;
}
