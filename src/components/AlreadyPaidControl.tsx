import { BadgeCheck } from "lucide-react";

export function AlreadyPaidControl({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
      <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
      <span className={`mt-0.5 flex h-6 w-11 shrink-0 rounded-full p-0.5 transition ${value ? "bg-emerald-600" : "bg-gray-300 dark:bg-gray-700"}`}>
        <span className={`h-5 w-5 rounded-full bg-white shadow-sm transition ${value ? "translate-x-5" : "translate-x-0"}`} />
      </span>
      <span className="flex min-w-0 gap-3">
        <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
        <span>
          <span className="block text-sm font-bold text-gray-900 dark:text-white">Already paid</span>
          <span className="mt-1 block text-xs leading-5 text-gray-600 dark:text-gray-300">Skip the initial PayMongo payment gate because the first subscription charge was already settled. If automatic billing is enabled, future invoices still follow the saved schedule.</span>
        </span>
      </span>
    </label>
  );
}
