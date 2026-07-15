import { useState } from "react";
import { BadgeDollarSign, RefreshCw } from "lucide-react";
import { CustomDropdown } from "./CustomDropdown";
import { CurrencyCode, getCurrencyName, useCurrency } from "@/src/contexts/CurrencyContext";

export default function CurrencyPreference() {
  const { currency, currencies, rateDate, ratesLoading, setCurrency } = useCurrency();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleChange = async (value: string) => {
    setSaving(true);
    setError("");
    try {
      await setCurrency(value as CurrencyCode);
    } catch {
      setError("Could not save your currency preference. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-[2rem] border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900 sm:p-8" aria-labelledby="currency-heading">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-gray-100 p-2.5 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
            <BadgeDollarSign className="h-5 w-5" />
          </div>
          <div>
            <h3 id="currency-heading" className="font-bold text-gray-900 dark:text-white">Display currency</h3>
            <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">
              Prices are stored in PHP and converted using the latest available reference rate.
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
              {ratesLoading && <RefreshCw className="h-3 w-3 animate-spin" />}
              {ratesLoading ? "Refreshing exchange rates…" : rateDate ? `Rates updated ${rateDate}` : "PHP base rate"}
            </p>
          </div>
        </div>
        <div className="w-full sm:w-72">
          <CustomDropdown
            value={currency}
            onChange={handleChange}
            options={currencies.map((code) => ({ value: code, label: `${code} — ${getCurrencyName(code)}` }))}
            disabled={saving}
            ariaLabel="Display currency"
          />
          {error && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
        </div>
      </div>
    </section>
  );
}
