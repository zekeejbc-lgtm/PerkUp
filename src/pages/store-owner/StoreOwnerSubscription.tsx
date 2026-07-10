import { AlertCircle, CalendarDays, CheckCircle2, CreditCard } from "lucide-react";
import {
  formatMoney,
  formatPaymentSchedule,
  formatPredictedPaymentDate,
  formatBillingDate,
  getSubscriptionBranchLimit,
  predictPaymentDates,
  resolveStoreBilling,
} from "../../lib/subscriptionBilling";

export default function StoreOwnerSubscription({ stores }: { stores: any[] }) {
  const subscriptionStore = stores.find((store) => store.isPrimaryBranch === true) ||
    stores.find((store) => store.subscriptionLevel || store.subscriptionDependencies) ||
    stores[0] || null;
  const branchLimit = getSubscriptionBranchLimit(subscriptionStore?.subscriptionDependencies);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Subscription Management</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Review your single owner subscription, branch allowance, and predicted payment dates.</p>
      </div>

      {!subscriptionStore ? (
        <div className="rounded-3xl border border-dashed border-gray-300 p-10 text-center dark:border-gray-700">
          <CreditCard className="mx-auto mb-3 h-9 w-9 text-gray-400" />
          <p className="font-semibold text-gray-900 dark:text-white">No subscription assigned</p>
          <p className="mt-1 text-sm text-gray-500">Payment forecasts appear after an admin assigns a store.</p>
        </div>
      ) : (
        <div>
          {(() => {
            const store = subscriptionStore;
            const dates = predictPaymentDates(
              store.paymentSchedule,
              store.subscriptionStart,
              store.subscriptionEnd,
              6,
            );
            const billing = resolveStoreBilling(store, []);
            return (
              <section key={store.id} className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="bg-gradient-to-br from-gray-900 to-gray-800 p-6 text-white">
                  <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                    <div>
                      <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-green-500/20 px-3 py-1 text-xs font-bold uppercase tracking-widest text-green-300">
                        <CheckCircle2 className="h-3.5 w-3.5" /> {store.status || "Active"}
                      </div>
                      <h3 className="text-2xl font-bold">{store.name || "Store"}</h3>
                      <p className="mt-1 text-sm text-gray-400">{store.subscriptionLevel || "Subscription plan"}</p>
                    </div>
                    <div className="sm:text-right">
                      <div className="text-3xl font-black">{formatMoney(Number(billing.amountDue || 0))}</div>
                      <div className="mt-1 text-xs uppercase tracking-widest text-gray-400">amount due</div>
                      {Number.isFinite(Number(store.pendingOwedAmount)) && Number(store.pendingOwedAmount) !== Number(billing.amountDue || 0) && (
                        <div className="mt-2 text-xs text-gray-300">
                          {formatMoney(Number(store.pendingOwedAmount))} starts on {formatBillingDate(store.pendingOwedAmountEffectiveAt)}.
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-5">
                    <CreditCard className="h-5 w-5 text-gray-300" />
                    <div>
                      <p className="text-xs text-gray-400">Payment schedule</p>
                      <p className="text-sm font-semibold">{formatPaymentSchedule(store.paymentSchedule)}</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl bg-white/10 px-4 py-3">
                    <p className="text-xs uppercase tracking-widest text-gray-400">Branch allowance</p>
                    <p className="mt-1 text-sm font-semibold">
                      {stores.length} of {branchLimit} branches used under this subscription
                    </p>
                  </div>
                </div>

                <div className="p-6">
                  <div className="mb-4 flex items-center gap-2">
                    <CalendarDays className="h-5 w-5 text-gray-500" />
                    <div>
                      <h4 className="font-bold text-gray-900 dark:text-white">Predicted payment dates</h4>
                      <p className="text-xs text-gray-500">The next dates within your active subscription period.</p>
                    </div>
                  </div>
                  {dates.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {dates.map((date, index) => (
                        <div key={date.toISOString()} className={`rounded-xl border px-4 py-3 ${index === 0 ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900" : "border-gray-200 bg-gray-50 text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"}`}>
                          <span className="block text-[10px] font-bold uppercase tracking-wider opacity-60">{index === 0 ? "Next payment" : `Payment ${index + 1}`}</span>
                          <span className="mt-1 block text-sm font-semibold">{formatPredictedPaymentDate(date)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 rounded-xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                      No upcoming payment dates are available. Ask an admin to check the payment schedule and subscription period.
                    </div>
                  )}
                </div>
              </section>
            );
          })()}
        </div>
      )}
    </div>
  );
}
