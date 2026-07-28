import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Clock3,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  canConfirmUpgrade,
  formatPhpCentavos,
  getUpgradeFeatureGains,
  getUpgradeLimitRows,
  type SubscriptionUpgradeQuote,
} from "../lib/subscriptionUpgrade";

type SubscriptionUpgradeTermsModalProps = {
  isOpen: boolean;
  quote: SubscriptionUpgradeQuote | null;
  isSubmitting: boolean;
  error: string;
  onConfirm: (acceptance: {
    termsVersion: string;
    termsAccepted: true;
    quoteFingerprint: string;
  }) => Promise<void>;
  onClose: () => void;
  onRefreshQuote: () => Promise<void>;
};

const TERMS = [
  "This self-service action is an upgrade only. Downgrades are not available in this flow.",
  "Nothing is charged today. Your current paid plan and access remain unchanged until the target renewal is paid.",
  "The target plan becomes active only after PerkUp verifies full payment of the matching renewal invoice.",
  "If the next renewal invoice is already issued, that invoice and its amount remain unchanged; the upgrade moves to the following renewal.",
  "The target renewal will use the exact plan and amount shown in this panel. A changed quote must be reviewed and accepted again.",
  "Your automatic or manual renewal setting is not changed by scheduling this upgrade.",
  "If the target renewal is not paid, fails, expires, or is voided, the upgrade is not applied and normal billing-access rules continue.",
  "New plan features and limits become available only when the target renewal payment is verified.",
  "Your current plan, limits, and price continue to govern the account before the verified target renewal payment.",
  "A scheduled upgrade may be cancelled only before it is attached and locked to its renewal invoice.",
  "Quotes expire and become invalid when material plan, price, invoice, or renewal state changes. PerkUp will require a refreshed review.",
  "Your electronic acceptance records the terms version, account, timestamp, selected plans, amounts, and effective renewal for audit purposes.",
] as const;

const formatRenewalDate = (value: string) =>
  new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(value));

const focusableSelector = [
  "button:not([disabled])",
  "input:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function SubscriptionUpgradeTermsModal({
  isOpen,
  quote,
  isSubmitting,
  error,
  onConfirm,
  onClose,
  onRefreshQuote,
}: SubscriptionUpgradeTermsModalProps) {
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  const submittingRef = useRef(isSubmitting);
  const submissionStartedRef = useRef(false);
  const [reachedTermsEnd, setReachedTermsEnd] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [submittingLocally, setSubmittingLocally] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  closeRef.current = onClose;
  submittingRef.current = isSubmitting || submittingLocally;

  useEffect(() => {
    setReachedTermsEnd(false);
    setAccepted(false);
    setSubmittingLocally(false);
    submissionStartedRef.current = false;
  }, [isOpen, quote?.quoteFingerprint]);

  useEffect(() => {
    if (!isOpen) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const previousActiveElement = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!submittingRef.current) closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => element.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActiveElement?.focus();
    };
  }, [isOpen]);

  const featureGains = useMemo(
    () => quote ? getUpgradeFeatureGains(quote.currentPlan, quote.targetPlan) : [],
    [quote],
  );
  const limitRows = useMemo(
    () => quote ? getUpgradeLimitRows(quote.currentPlan, quote.targetPlan) : [],
    [quote],
  );
  const expiresAtMs = quote ? new Date(quote.expiresAt).getTime() : 0;
  const expired = !quote || !Number.isFinite(expiresAtMs) || nowMs >= expiresAtMs;
  const submitting = isSubmitting || submittingLocally;
  const canConfirm = Boolean(quote) && canConfirmUpgrade({
    reachedTermsEnd,
    accepted,
    expiresAt: quote?.expiresAt || "",
    now: new Date(nowMs),
    submitting,
  });

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!quote || !canConfirm || submissionStartedRef.current) return;
    submissionStartedRef.current = true;
    setSubmittingLocally(true);
    try {
      await onConfirm({
        termsVersion: quote.termsVersion,
        termsAccepted: true,
        quoteFingerprint: quote.quoteFingerprint,
      });
    } finally {
      submissionStartedRef.current = false;
      setSubmittingLocally(false);
    }
  };

  const handleRefresh = async () => {
    if (refreshing || submitting) return;
    setRefreshing(true);
    try {
      await onRefreshQuote();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/65 px-3 py-4 backdrop-blur-sm sm:px-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscription-upgrade-title"
        aria-describedby="subscription-upgrade-summary"
        className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900"
      >
        <header className="flex items-start gap-4 border-b border-gray-100 px-5 py-4 dark:border-gray-800 sm:px-7 sm:py-5">
          <span className="mt-0.5 rounded-2xl bg-teal-50 p-2.5 text-[#1b5660] dark:bg-teal-950/50 dark:text-teal-300">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="subscription-upgrade-title" className="text-xl font-black text-gray-950 dark:text-white">
              Review your subscription upgrade
            </h2>
            <p id="subscription-upgrade-summary" className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
              Read the price computation, effective renewal, plan differences, and all terms before confirming.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close upgrade terms"
            disabled={submitting}
            onClick={onClose}
            className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {!quote ? (
          <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Preparing the authoritative quote...
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
              <PlanCard
                eyebrow="Current plan"
                name={quote.currentPlan.name}
                amount={formatPhpCentavos(quote.currentPlan.priceCentavos)}
              />
              <div className="hidden items-center justify-center text-gray-400 sm:flex">
                <ArrowRight className="h-6 w-6" />
              </div>
              <PlanCard
                eyebrow="Upgrade plan"
                name={quote.targetPlan.name}
                amount={formatPhpCentavos(quote.targetPlan.priceCentavos)}
                target
              />
            </div>

            <section className="mt-5 rounded-2xl border border-teal-200 bg-teal-50/70 p-4 dark:border-teal-900/70 dark:bg-teal-950/25">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-teal-950 dark:text-teal-100">
                    Charged today: {formatPhpCentavos(quote.amountDueTodayCentavos)}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-teal-800 dark:text-teal-300">
                    No proration or immediate PayMongo charge.
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">Upgrade price difference</p>
                  <p className="mt-1 text-lg font-black text-teal-950 dark:text-teal-100">
                    {formatPhpCentavos(quote.differenceCentavos)}
                  </p>
                </div>
              </div>
            </section>

            <section className="mt-5 rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
              <h3 className="font-bold text-gray-950 dark:text-white">Renewal computation</h3>
              <div className="mt-3 space-y-2 text-sm">
                <ComputationRow label="Current recurring price" value={formatPhpCentavos(quote.currentPlan.priceCentavos)} />
                <ComputationRow label="Target recurring price" value={formatPhpCentavos(quote.targetPlan.priceCentavos)} />
                <ComputationRow label="Difference per renewal" value={formatPhpCentavos(quote.differenceCentavos)} strong />
                {quote.nextRenewal.alreadyIssued && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                    <p className="font-semibold">
                      Your next invoice for {formatPhpCentavos(quote.nextRenewal.amountCentavos)} was already issued and remains unchanged.
                    </p>
                    <p className="mt-1 text-xs leading-5">
                      The upgrade moves to the following renewal on {formatRenewalDate(quote.targetRenewal.periodStart)}.
                    </p>
                  </div>
                )}
                <ComputationRow
                  label={quote.nextRenewal.alreadyIssued ? "Following renewal amount" : "Next renewal amount"}
                  value={`${formatPhpCentavos(quote.targetRenewal.amountCentavos)} on ${formatRenewalDate(quote.targetRenewal.periodStart)}`}
                  strong
                />
              </div>
              <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-gray-600 dark:text-gray-400">
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
                {quote.renewalMode === "automatic"
                  ? "Automatic renewal remains on. The ordinary PayMongo renewal flow will use the target amount on the effective renewal."
                  : "Manual renewal remains on. The target plan applies only after you pay the effective manual renewal."}
              </p>
            </section>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <section className="rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
                <h3 className="font-bold text-gray-950 dark:text-white">Limit differences</h3>
                <div className="mt-3 space-y-2">
                  {limitRows.map((row) => (
                    <div key={row.key} className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 px-3 py-2.5 text-sm dark:bg-gray-800">
                      <span className="font-medium text-gray-600 dark:text-gray-300">{row.label}</span>
                      <span className="text-right font-bold text-gray-950 dark:text-white">{row.current} → {row.target}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
                <h3 className="font-bold text-gray-950 dark:text-white">Newly included features</h3>
                <div className="mt-3 space-y-2">
                  {featureGains.length ? featureGains.map((feature) => (
                    <p key={feature} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <span className="mt-0.5 rounded-full bg-green-100 p-0.5 text-green-700 dark:bg-green-950/60 dark:text-green-300">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      {feature}
                    </p>
                  )) : (
                    <p className="text-sm text-gray-500">No additional feature labels are listed; review the limit increases.</p>
                  )}
                </div>
              </section>
            </div>

            <section className="mt-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-gray-950 dark:text-white">Subscription upgrade terms</h3>
                  <p className="mt-0.5 text-xs text-gray-500">Terms version {quote.termsVersion}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${reachedTermsEnd ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"}`}>
                  {reachedTermsEnd ? "Terms read" : "Scroll through all terms"}
                </span>
              </div>
              <div
                data-testid="subscription-upgrade-terms"
                tabIndex={0}
                onScroll={(event) => {
                  const element = event.currentTarget;
                  if (element.scrollTop + element.clientHeight >= element.scrollHeight - 4) {
                    setReachedTermsEnd(true);
                  }
                }}
                className="max-h-64 overflow-y-auto rounded-2xl border border-gray-200 bg-gray-50 p-4 outline-none focus-visible:ring-2 focus-visible:ring-[#1b5660] dark:border-gray-700 dark:bg-gray-950/40"
              >
                <ol className="space-y-3 pl-5 text-sm leading-6 text-gray-700 dark:text-gray-300">
                  {TERMS.map((term, index) => (
                    <li key={term} className="list-decimal pl-1">
                      <span className="font-semibold text-gray-950 dark:text-white">Term {index + 1}.</span> {term}
                    </li>
                  ))}
                </ol>
                <p className="mt-4 rounded-xl bg-white p-3 text-xs font-semibold text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                  End of all {TERMS.length} terms.
                </p>
              </div>
              <label className={`mt-3 flex items-start gap-3 rounded-2xl border p-4 ${reachedTermsEnd ? "cursor-pointer border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900" : "cursor-not-allowed border-gray-200 bg-gray-50 opacity-65 dark:border-gray-800 dark:bg-gray-950/30"}`}>
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-[#1b5660] focus:ring-[#1b5660]"
                  disabled={!reachedTermsEnd || expired || submitting}
                  checked={accepted}
                  onChange={(event) => setAccepted(event.target.checked)}
                />
                <span className="text-sm leading-6 text-gray-700 dark:text-gray-300">
                  I have read and agree to all {TERMS.length} terms, including the exact price difference and effective renewal shown above.
                </span>
              </label>
            </section>

            {expired && (
              <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-start gap-2 font-semibold">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  This quote has expired. Refresh it and review all terms again.
                </p>
                <button
                  type="button"
                  disabled={refreshing || submitting}
                  onClick={handleRefresh}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-900 px-3 py-2 font-semibold text-white disabled:opacity-60 dark:bg-amber-200 dark:text-amber-950"
                >
                  {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Refresh quote
                </button>
              </div>
            )}
            {error && (
              <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </p>
            )}
          </div>
        )}

        <footer className="flex flex-col-reverse gap-3 border-t border-gray-100 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-950/30 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="text-xs leading-5 text-gray-500">
            Confirmation is unavailable until all terms are read and accepted.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Not now
            </button>
            <button
              type="button"
              disabled={!canConfirm}
              onClick={handleConfirm}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1b5660] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#164750] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Confirming..." : "Confirm upgrade"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function PlanCard({
  eyebrow,
  name,
  amount,
  target = false,
}: {
  eyebrow: string;
  name: string;
  amount: string;
  target?: boolean;
}) {
  return (
    <article className={`rounded-2xl border p-4 ${target ? "border-[#1b5660] bg-[#1b5660] text-white" : "border-gray-200 bg-gray-50 text-gray-950 dark:border-gray-700 dark:bg-gray-800 dark:text-white"}`}>
      <p className={`text-xs font-bold uppercase tracking-wider ${target ? "text-teal-100" : "text-gray-500 dark:text-gray-400"}`}>{eyebrow}</p>
      <h3 className="mt-2 text-lg font-black">{name}</h3>
      <p className={`mt-1 text-sm font-semibold ${target ? "text-white" : "text-gray-700 dark:text-gray-300"}`}>{amount} per renewal</p>
    </article>
  );
}

function ComputationRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 rounded-xl px-3 py-2.5 ${strong ? "bg-gray-900 text-white dark:bg-white dark:text-gray-950" : "bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
      <span>{label}</span>
      <span className="text-right font-bold">{value}</span>
    </div>
  );
}
