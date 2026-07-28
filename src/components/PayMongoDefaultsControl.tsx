import { useState } from "react";
import { CreditCard } from "lucide-react";
import { ConfirmationModal } from "./ConfirmationModal";

export function PayMongoDefaultsControl({
  enabled,
  hasExistingValues,
  onApply,
  onDisable,
}: {
  enabled: boolean;
  hasExistingValues: boolean;
  onApply: () => void;
  onDisable: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const enableDefaults = () => {
    if (hasExistingValues) {
      setConfirmOpen(true);
      return;
    }
    onApply();
  };

  return (
    <>
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/60 dark:bg-blue-950/20">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => event.target.checked ? enableDefaults() : onDisable()}
          className="peer sr-only"
        />
        <span className={`mt-0.5 flex h-6 w-11 shrink-0 rounded-full p-0.5 transition ${enabled ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-700"}`}>
          <span className={`h-5 w-5 rounded-full bg-white shadow-sm transition ${enabled ? "translate-x-5" : "translate-x-0"}`} />
        </span>
        <span className="flex min-w-0 gap-3">
          <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
          <span>
            <span className="block text-sm font-bold text-gray-900 dark:text-white">Use PayMongo standard defaults</span>
            <span className="mt-1 block text-xs leading-5 text-gray-600 dark:text-gray-300">Enables automatic billing with a 30-day interval, 7-day warning, 3-day grace period, and Perk billing contact.</span>
          </span>
        </span>
      </label>

      <ConfirmationModal
        isOpen={confirmOpen}
        title="Replace the existing billing setup?"
        description="This store already has subscription dates or payment settings. Applying the PayMongo standard will replace the dates with a new 30-day period and reset the billing schedule, warning, grace period, and payment instructions. The selected plan and price will not change."
        confirmLabel="Apply standard"
        cancelLabel="Keep existing setup"
        tone="default"
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onApply();
        }}
      />
    </>
  );
}
