import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock3,
  Loader2,
  RotateCcw,
  Snowflake,
} from "lucide-react";

export type SubscriptionAccessAction = "active" | "warning" | "grace" | "frozen";

export type SubscriptionAccessAssessment = {
  valid: boolean;
  forced: boolean;
  code: string;
  reason: string;
  facts: {
    assessedAt: string;
    currentStatus: SubscriptionAccessAction;
    invoiceId: string | null;
    invoiceStatus: string | null;
    dueAt: string | null;
    graceEndsAt: string | null;
    subscriptionEnd: string | null;
    initialPaymentRequired: boolean;
  };
};

type Props = {
  action: SubscriptionAccessAction;
  storeName: string;
  title: string;
  description: string;
  confirmLabel: string;
  assessment: SubscriptionAccessAssessment | null;
  assessmentLoading: boolean;
  assessmentError: string;
  mutationError: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const actionName = (action: SubscriptionAccessAction) =>
  action === "active" ? "restore" :
  action === "frozen" ? "freeze" :
  action;

const iconStyle = (action: SubscriptionAccessAction) =>
  action === "frozen" ? "bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400" :
  action === "grace" ? "bg-orange-100 text-orange-600 dark:bg-orange-950/60 dark:text-orange-400" :
  action === "warning" ? "bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400" :
  "bg-green-100 text-green-600 dark:bg-green-950/60 dark:text-green-400";

const buttonStyle = (action: SubscriptionAccessAction) =>
  action === "frozen" ? "bg-red-600 hover:bg-red-700" :
  action === "grace" ? "bg-orange-500 hover:bg-orange-600" :
  action === "warning" ? "bg-amber-500 text-amber-950 hover:bg-amber-400" :
  "bg-green-600 hover:bg-green-700";

const ActionIcon = ({ action }: { action: SubscriptionAccessAction }) =>
  action === "frozen" ? <Snowflake className="h-6 w-6" /> :
  action === "grace" ? <Clock3 className="h-6 w-6" /> :
  action === "warning" ? <BellRing className="h-6 w-6" /> :
  <RotateCcw className="h-6 w-6" />;

const formatFactDate = (value: string | null) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export function SubscriptionAccessActionModal({
  action,
  storeName,
  title,
  description,
  confirmLabel,
  assessment,
  assessmentLoading,
  assessmentError,
  mutationError,
  busy,
  onCancel,
  onConfirm,
}: Props) {
  const forced = Boolean(assessmentError) || assessment?.valid === false;
  const facts = assessment?.facts;
  const factRows = facts
    ? [
      ["Current access", facts.currentStatus.replace("_", " ")],
      ["Invoice", facts.invoiceId],
      ["Invoice status", facts.invoiceStatus?.replaceAll("_", " ") || null],
      ["Due", facts.dueAt ? formatFactDate(facts.dueAt) : null],
      ["Grace deadline", facts.graceEndsAt ? formatFactDate(facts.graceEndsAt) : null],
    ].filter((row): row is [string, string] => Boolean(row[1]))
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm animate-in fade-in duration-200 dark:bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="subscription-action-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900">
        <div className="p-6 sm:p-7">
          <div className="flex items-start gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconStyle(action)}`}>
              <ActionIcon action={action} />
            </div>
            <div>
              <h3 id="subscription-action-title" className="text-xl font-bold text-gray-900 dark:text-white">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{description}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Store: {storeName}</p>
            </div>
          </div>

          <div className="mt-5">
            {assessmentLoading ? (
              <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                Checking current billing facts…
              </div>
            ) : assessmentError ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                <div className="flex items-center gap-2 text-sm font-bold"><AlertTriangle className="h-4 w-4" /> Policy validation unavailable</div>
                <p className="mt-1 text-sm leading-5">{assessmentError}</p>
              </div>
            ) : assessment?.valid ? (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200">
                <div className="flex items-center gap-2 text-sm font-bold"><CheckCircle2 className="h-4 w-4" /> Valid under billing policy</div>
                <p className="mt-1 text-sm leading-5">{assessment.reason}</p>
              </div>
            ) : assessment ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                <div className="flex items-center gap-2 text-sm font-bold"><AlertTriangle className="h-4 w-4" /> Outside expected billing policy</div>
                <p className="mt-1 text-sm leading-5">{assessment.reason}</p>
              </div>
            ) : null}
          </div>

          {factRows.length > 0 && (
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-gray-50 px-4 py-3 text-xs dark:bg-gray-800/70">
              {factRows.map(([label, value]) => (
                <div className="contents" key={label}>
                  <dt className="font-semibold text-gray-500 dark:text-gray-400">{label}</dt>
                  <dd className="text-right font-medium text-gray-800 dark:text-gray-200">{value}</dd>
                </div>
              ))}
            </dl>
          )}

          {mutationError && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{mutationError}</p>}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="rounded-lg bg-gray-100 px-3.5 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || assessmentLoading}
              onClick={onConfirm}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${buttonStyle(action)}`}
            >
              {(busy || assessmentLoading) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {busy ? "Wait..." : assessmentLoading ? "Checking policy..." : forced ? `Force ${actionName(action)}` : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
