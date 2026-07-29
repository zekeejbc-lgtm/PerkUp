import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowUpCircle,
  ChevronDown,
  Loader2,
  LockKeyhole,
  RotateCcw,
  X,
} from "lucide-react";
import { formatPhpCentavos } from "../lib/subscriptionUpgrade";
import { ScrollableRegion } from "./ScrollableRegion";
import { Pagination } from "./Pagination";
import { useCollectionPagination } from "../hooks/useCollectionPagination";

type PlanSnapshot = {
  id?: string;
  name?: string;
};

export type AdminSubscriptionPlanChange = {
  id: string;
  status: "scheduled" | "locked" | "applied" | "cancelled" | "failed";
  from_plan_snapshot: PlanSnapshot | null;
  to_plan_snapshot: PlanSnapshot | null;
  current_amount_centavos: number;
  target_amount_centavos: number;
  difference_centavos: number;
  amount_due_today_centavos: number;
  target_period_start: string;
  target_period_end: string;
  renewal_invoice_id: string | null;
  terms_version: string;
  terms_accepted_at: string;
  terms_accepted_by: string;
  requested_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  failure_reason: string | null;
};

type Props = {
  changes: AdminSubscriptionPlanChange[];
  loading: boolean;
  error: string;
  message: string;
  busy: boolean;
  onRefresh: () => void;
  onRequestCancel: (change: AdminSubscriptionPlanChange) => void;
};

const formatDate = (value: string | null) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
};

const statusClasses: Record<AdminSubscriptionPlanChange["status"], string> = {
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  locked: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  applied: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  cancelled: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
  failed: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

export function AdminSubscriptionPlanChanges({
  changes,
  loading,
  error,
  message,
  busy,
  onRefresh,
  onRequestCancel,
}: Props) {
  const [showCancelled, setShowCancelled] = useState(false);
  const cancelledCount = changes.filter((change) => change.status === "cancelled").length;
  const visibleChanges = useMemo(
    () => changes.filter((change) => showCancelled || change.status !== "cancelled"),
    [changes, showCancelled],
  );
  const changePagination = useCollectionPagination(visibleChanges, 6);

  return (
    <section className="rounded-2xl border border-gray-100 bg-gray-50 p-6 shadow-sm dark:border-gray-800 dark:bg-gray-800/50 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold uppercase tracking-widest text-gray-600 dark:text-gray-200">
            Subscription plan change history
          </h4>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Store-owner self-service requests, accepted terms, renewal attachment, and fulfillment.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading || busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
        >
          <RotateCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {message && (
        <p role="status" className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700 dark:border-green-900/60 dark:bg-green-950/20 dark:text-green-300">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading plan changes…
        </div>
      ) : changes.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-5 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
          No subscription plan changes have been requested.
        </p>
      ) : (
        <>
        {cancelledCount > 0 && (
          <button
            type="button"
            aria-expanded={showCancelled}
            onClick={() => setShowCancelled((current) => !current)}
            className="mt-5 flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <span className="flex items-center gap-2">
              <Archive className="h-4 w-4 text-gray-500" />
              Archived cancelled upgrades
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {cancelledCount}
              </span>
            </span>
            <ChevronDown
              className={`h-4 w-4 text-gray-500 transition-transform ${showCancelled ? "rotate-180" : ""}`}
            />
          </button>
        )}

        {visibleChanges.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            No active plan changes.
          </p>
        ) : (
          <>
        <ScrollableRegion label="Subscription plan change history" className={`${cancelledCount > 0 ? "mt-4" : "mt-5"} space-y-4 pr-1`}>
          {changePagination.pageItems.map((change) => {
            const fromName = change.from_plan_snapshot?.name || change.from_plan_snapshot?.id || "Previous plan";
            const toName = change.to_plan_snapshot?.name || change.to_plan_snapshot?.id || "Target plan";
            const cancellable = change.status === "scheduled" && !change.renewal_invoice_id;

            return (
              <article key={change.id} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ArrowUpCircle className="h-4 w-4 text-blue-600" />
                      <h5 className="font-semibold text-gray-900 dark:text-white">
                        {fromName} to {toName}
                      </h5>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusClasses[change.status]}`}>
                        {change.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Store-owner self-service · Requested {formatDate(change.requested_at)}
                    </p>
                  </div>
                  {cancellable && (
                    <button
                      type="button"
                      onClick={() => onRequestCancel(change)}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancel scheduled upgrade
                    </button>
                  )}
                </div>

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-xs font-semibold text-gray-500">Charged today</dt>
                    <dd className="mt-1 font-semibold text-green-700 dark:text-green-300">{formatPhpCentavos(change.amount_due_today_centavos)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-gray-500">Current renewal</dt>
                    <dd className="mt-1 font-medium text-gray-900 dark:text-white">{formatPhpCentavos(change.current_amount_centavos)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-gray-500">Target renewal</dt>
                    <dd className="mt-1 font-medium text-gray-900 dark:text-white">{formatPhpCentavos(change.target_amount_centavos)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-gray-500">Difference</dt>
                    <dd className="mt-1 font-medium text-gray-900 dark:text-white">+{formatPhpCentavos(change.difference_centavos)}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold text-gray-500">Target renewal period</dt>
                    <dd className="mt-1 text-gray-800 dark:text-gray-200">
                      {formatDate(change.target_period_start)} to {formatDate(change.target_period_end)}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold text-gray-500">Terms acceptance</dt>
                    <dd className="mt-1 text-gray-800 dark:text-gray-200">
                      {change.terms_version} · {formatDate(change.terms_accepted_at)} · User {change.terms_accepted_by}
                    </dd>
                  </div>
                </dl>

                {change.renewal_invoice_id && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">
                    <p className="flex items-center gap-2 font-semibold">
                      <LockKeyhole className="h-4 w-4" />
                      Locked to renewal invoice {change.renewal_invoice_id}
                    </p>
                    <p className="mt-1 text-xs">
                      The plan change cannot be cancelled here. Resolve the attached invoice through billing controls.
                    </p>
                  </div>
                )}

                {change.cancellation_reason && (
                  <p className="mt-4 rounded-xl bg-gray-100 px-4 py-3 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                    <strong>Cancellation reason:</strong> {change.cancellation_reason}
                  </p>
                )}
                {change.failure_reason && (
                  <p className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span><strong>Failure reason:</strong> {change.failure_reason}</span>
                  </p>
                )}
              </article>
            );
          })}
        </ScrollableRegion>
        <Pagination page={changePagination.page} pageSize={changePagination.pageSize} totalItems={changePagination.totalItems} onPageChange={changePagination.setPage} itemLabel="plan changes" />
          </>
        )}
        </>
      )}
    </section>
  );
}
