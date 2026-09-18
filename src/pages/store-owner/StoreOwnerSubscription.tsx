import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowUpCircle, CalendarDays, Check, CheckCircle2, CreditCard, Download, ExternalLink, FileText, Images, Loader2, LockKeyhole, RefreshCwOff } from "lucide-react";
import {
  formatPaymentSchedule,
  formatPredictedPaymentDate,
  formatBillingDate,
  getCurrentSubscriptionPaymentState,
  getSubscriptionBranchLimit,
  getSubscriptionGalleryPhotoLimit,
  predictPaymentDates,
  resolveStoreBilling,
} from "../../lib/subscriptionBilling";
import { useCurrency } from "../../contexts/CurrencyContext";
import { supabase } from "../../lib/supabase";
import { downloadSubscriptionInvoicePdf } from "../../lib/subscriptionInvoicePdf";
import { markSubscriptionPaymentPending } from "../../lib/subscriptionAccess";
import { useAuth } from "../../contexts/AuthContext";
import { BackendOperationError, invokeAdminBackend } from "../../lib/adminBackend";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import { SubscriptionUpgradeTermsModal } from "../../components/SubscriptionUpgradeTermsModal";
import { ScrollableRegion } from "../../components/ScrollableRegion";
import { Pagination } from "../../components/Pagination";
import { useCollectionPagination } from "../../hooks/useCollectionPagination";
import { useToast } from "../../components/ToastProvider";
import {
  cancelSubscriptionUpgrade,
  confirmSubscriptionUpgrade,
  getSubscriptionUpgradeOptions,
  quoteSubscriptionUpgrade,
  type UpgradeOptionsResponse,
} from "../../lib/subscriptionUpgradeApi";
import {
  formatPhpCentavos,
  type SubscriptionPlanChangeSummary,
  type SubscriptionPlanSnapshot,
  type SubscriptionUpgradeQuote,
} from "../../lib/subscriptionUpgrade";

type BillingInvoice = {
  id: string;
  public_id: string;
  status: string;
  plan_id_snapshot: string | null;
  plan_name_snapshot: string | null;
  created_at: string;
  due_at: string;
  period_start: string;
  period_end: string;
  amount_centavos: number;
  currency: string;
  payment_url: string | null;
  paymongo_reference_number: string | null;
  manual_payment_reference: string | null;
  livemode: boolean;
  paid_at: string | null;
  payment_method: string | null;
  paymongo_payment_id: string | null;
  gross_amount_centavos: number | null;
  fee_centavos: number | null;
  net_amount_centavos: number | null;
};

type BillingSubscriptionSummary = {
  public_id: string;
  automation_enabled: boolean;
  billing_email: string | null;
  plan_id: string | null;
  interval_days: number | null;
  grace_period_days: number | null;
  status: string;
  renewal_mode: "automatic" | "manual";
  auto_renew_cancelled_at: string | null;
  current_period_end: string;
  initial_payment_required: boolean;
};

const invoiceNumber = (invoice: BillingInvoice) => invoice.public_id || `PU-${invoice.id.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
const isManualPayment = (invoice: BillingInvoice) =>
  String(invoice.payment_method || "").startsWith("manual_") || invoice.payment_method === "admin_confirmed";

export default function StoreOwnerSubscription({ stores }: { stores: any[] }) {
  const { formatCurrency } = useCurrency();
  const { user } = useAuth();
  const toast = useToast();
  const subscriptionStore = stores.find((store) => store.isPrimaryBranch === true) ||
    stores.find((store) => store.subscriptionLevel || store.subscriptionDependencies) ||
    stores[0] || null;
  const branchLimit = getSubscriptionBranchLimit(subscriptionStore?.subscriptionDependencies);
  const galleryPhotoLimit = getSubscriptionGalleryPhotoLimit(subscriptionStore?.subscriptionDependencies);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [billingSubscription, setBillingSubscription] = useState<BillingSubscriptionSummary | null>(null);
  const [billingInvoices, setBillingInvoices] = useState<BillingInvoice[]>([]);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);
  const [showCancelRenewal, setShowCancelRenewal] = useState(false);
  const [cancellingRenewal, setCancellingRenewal] = useState(false);
  const [renewalMessage, setRenewalMessage] = useState("");
  const [renewalError, setRenewalError] = useState("");
  const [upgradeOptions, setUpgradeOptions] = useState<UpgradeOptionsResponse | null>(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [quotingPlanId, setQuotingPlanId] = useState("");
  const [upgradeQuote, setUpgradeQuote] = useState<SubscriptionUpgradeQuote | null>(null);
  const [upgradeSubmitting, setUpgradeSubmitting] = useState(false);
  const [upgradeError, setUpgradeError] = useState("");
  const [upgradeMessage, setUpgradeMessage] = useState("");
  const [upgradeToCancel, setUpgradeToCancel] = useState<SubscriptionPlanChangeSummary | null>(null);
  const [cancellingUpgrade, setCancellingUpgrade] = useState(false);
  const manualRenewal = billingSubscription?.renewal_mode === "manual";
  const currentPeriodEnd = billingSubscription?.current_period_end || subscriptionStore?.subscriptionEnd;
  const currentPeriodExpired = Boolean(currentPeriodEnd) && new Date(currentPeriodEnd).getTime() <= Date.now();
  const refreshUpgradeOptions = useCallback(async () => {
    if (!subscriptionStore?.id) {
      setUpgradeOptions(null);
      return;
    }
    setUpgradeLoading(true);
    try {
      const nextOptions = await getSubscriptionUpgradeOptions(subscriptionStore.id);
      setUpgradeOptions(nextOptions);
    } catch (error) {
      console.error("Could not load subscription upgrade options", error);
      setUpgradeOptions(null);
      setUpgradeError(error instanceof Error ? error.message : "Upgrade options could not be loaded.");
    } finally {
      setUpgradeLoading(false);
    }
  }, [subscriptionStore?.id]);

  useEffect(() => {
    void refreshUpgradeOptions();
  }, [refreshUpgradeOptions]);

  const openUpgradeQuote = async (targetPlanId: string) => {
    if (!subscriptionStore?.id || quotingPlanId || upgradeSubmitting) return;
    setQuotingPlanId(targetPlanId);
    setUpgradeError("");
    setUpgradeMessage("");
    try {
      const nextQuote = await quoteSubscriptionUpgrade(subscriptionStore.id, targetPlanId);
      setUpgradeQuote(nextQuote);
    } catch (error) {
      setUpgradeError(error instanceof Error ? error.message : "The upgrade quote could not be prepared.");
    } finally {
      setQuotingPlanId("");
    }
  };

  const refreshOpenQuote = async () => {
    if (!subscriptionStore?.id || !upgradeQuote) return;
    const nextQuote = await quoteSubscriptionUpgrade(
      subscriptionStore.id,
      upgradeQuote.targetPlan.id,
    );
    setUpgradeQuote(nextQuote);
    setUpgradeError("");
  };

  const confirmUpgrade = async (acceptance: {
    termsVersion: string;
    termsAccepted: true;
    quoteFingerprint: string;
  }) => {
    if (!subscriptionStore?.id || !upgradeQuote || upgradeSubmitting) return;
    setUpgradeSubmitting(true);
    setUpgradeError("");
    try {
      const change = await confirmSubscriptionUpgrade({
        storeId: subscriptionStore.id,
        targetPlanId: upgradeQuote.targetPlan.id,
        quoteToken: upgradeQuote.quoteToken,
        ...acceptance,
      });
      setUpgradeMessage(
        `${change.toPlan.name} is scheduled for ${formatBillingDate(change.targetPeriodStart)} at ${formatPhpCentavos(change.targetAmountCentavos)}.`,
      );
      setUpgradeQuote(null);
      await refreshUpgradeOptions();
    } catch (error) {
      if (
        error instanceof BackendOperationError
        && ["STALE_UPGRADE_QUOTE", "EXPIRED_UPGRADE_QUOTE"].includes(error.code)
      ) {
        try {
          const refreshedQuote = await quoteSubscriptionUpgrade(
            subscriptionStore.id,
            upgradeQuote.targetPlan.id,
          );
          setUpgradeQuote(refreshedQuote);
          setUpgradeError("Billing details changed. Review the refreshed terms before confirming.");
        } catch (refreshError) {
          setUpgradeError(
            refreshError instanceof Error
              ? refreshError.message
              : "Billing details changed and a new quote could not be prepared.",
          );
        }
      } else {
        setUpgradeError(error instanceof Error ? error.message : "The upgrade could not be scheduled.");
      }
    } finally {
      setUpgradeSubmitting(false);
    }
  };

  const cancelScheduledUpgrade = async () => {
    if (!subscriptionStore?.id || !upgradeToCancel || cancellingUpgrade) return;
    setCancellingUpgrade(true);
    setUpgradeError("");
    try {
      await cancelSubscriptionUpgrade(subscriptionStore.id, upgradeToCancel.id);
      setUpgradeMessage("The scheduled subscription upgrade has been cancelled.");
      setUpgradeToCancel(null);
      await refreshUpgradeOptions();
    } catch (error) {
      setUpgradeError(error instanceof Error ? error.message : "The scheduled upgrade could not be cancelled.");
    } finally {
      setCancellingUpgrade(false);
    }
  };

  const cancelAutomaticRenewal = async () => {
    if (!subscriptionStore?.id || cancellingRenewal) return;
    setCancellingRenewal(true);
    setRenewalError("");
    try {
      const result = await invokeAdminBackend<{
        cancellation: {
          cancelledAt: string;
          currentPeriodEnd: string;
          renewalMode: "manual";
        };
      }>({
        action: "cancel_subscription_auto_renewal",
        storeId: subscriptionStore.id,
      });
      setBillingEnabled(false);
      setBillingSubscription((current) => current ? {
        ...current,
        automation_enabled: false,
        renewal_mode: "manual",
        status: "cancelled",
        auto_renew_cancelled_at: result.cancellation.cancelledAt,
        current_period_end: result.cancellation.currentPeriodEnd,
      } : current);
      setRenewalMessage("Automatic renewal has been cancelled. Your paid access remains available until the current period ends.");
      setShowCancelRenewal(false);
    } catch (error) {
      setRenewalError(error instanceof Error ? error.message : "Automatic renewal could not be cancelled.");
    } finally {
      setCancellingRenewal(false);
    }
  };

  const downloadInvoice = async (invoice: BillingInvoice) => {
    setDownloadingInvoiceId(invoice.id);
    const progressToastId = toast.progress("Preparing the invoice PDF…", { title: "Generating PDF" });
    try {
      await downloadSubscriptionInvoicePdf({
        invoice: {
          id: invoice.id,
          publicId: invoice.public_id,
          status: invoice.status,
          createdAt: invoice.created_at,
          dueAt: invoice.due_at,
          periodStart: invoice.period_start,
          periodEnd: invoice.period_end,
          amountCentavos: invoice.amount_centavos,
          currency: invoice.currency,
          paymentUrl: invoice.payment_url,
          referenceNumber: invoice.manual_payment_reference || invoice.paymongo_reference_number,
          livemode: invoice.livemode,
          paidAt: invoice.paid_at,
          paymentMethod: invoice.payment_method,
          paymentId: invoice.paymongo_payment_id,
          grossAmountCentavos: invoice.gross_amount_centavos,
        },
        subscription: {
          planId: invoice.plan_id_snapshot || billingSubscription?.plan_id || subscriptionStore?.subscriptionLevel || null,
          planName: invoice.plan_name_snapshot,
          billingEmail: billingSubscription?.billing_email || null,
          intervalDays: billingSubscription?.interval_days || null,
          gracePeriodDays: billingSubscription?.grace_period_days || null,
        },
        business: {
          name: subscriptionStore?.businessName || subscriptionStore?.name || "Perk merchant",
          subscriberName: user?.name || null,
          address: subscriptionStore?.address || subscriptionStore?.location || null,
          contact: subscriptionStore?.contact || subscriptionStore?.contactNumber || subscriptionStore?.phone || null,
        },
      });
      toast.update(progressToastId, "The invoice PDF was downloaded.", "success", { title: "Download ready" });
    } catch (error) {
      console.error("Could not generate subscription invoice PDF", error);
      toast.update(progressToastId, "We could not prepare this PDF. Please refresh the page and try again.", "error", { error, title: "PDF failed" });
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  useEffect(() => {
    if (!subscriptionStore?.id) return;
    let cancelled = false;
    setBillingLoading(true);
    Promise.all([
      supabase.from("billing_subscriptions").select("public_id,automation_enabled,billing_email,plan_id,interval_days,grace_period_days,status,renewal_mode,auto_renew_cancelled_at,current_period_end,initial_payment_required").eq("store_id", subscriptionStore.id).maybeSingle(),
      supabase.from("billing_invoices")
        .select("id,public_id,status,created_at,due_at,period_start,period_end,amount_centavos,currency,payment_url,paymongo_reference_number,manual_payment_reference,livemode,paid_at,payment_method,paymongo_payment_id,gross_amount_centavos,fee_centavos,net_amount_centavos,plan_id_snapshot,plan_name_snapshot")
        .eq("store_id", subscriptionStore.id)
        .order("created_at", { ascending: false })
        .limit(6),
    ]).then(([subscriptionResult, invoiceResult]) => {
      if (cancelled) return;
      if (subscriptionResult.error) throw subscriptionResult.error;
      if (invoiceResult.error) throw invoiceResult.error;
      setBillingEnabled(subscriptionResult.data?.automation_enabled === true);
      setBillingSubscription((subscriptionResult.data || null) as BillingSubscriptionSummary | null);
      setBillingInvoices((invoiceResult.data || []) as BillingInvoice[]);
    }).catch((error) => {
      console.error("Could not load subscription billing history", error);
      if (!cancelled) {
        setBillingEnabled(false);
        setBillingSubscription(null);
        setBillingInvoices([]);
      }
    }).finally(() => {
      if (!cancelled) setBillingLoading(false);
    });
    return () => { cancelled = true; };
  }, [subscriptionStore?.id]);

  const invoicePagination = useCollectionPagination(billingInvoices, 6);

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
              new Date(),
              store.billingIntervalDays,
            );
            const billing = resolveStoreBilling(store, []);
            const currentPayment = getCurrentSubscriptionPaymentState(
              billingInvoices,
              store.subscriptionStart,
              store.subscriptionEnd,
              store.initialPaymentRequired === true,
            );
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
                      <div className="text-3xl font-black">{formatCurrency(Number(billing.amountDue || 0))}</div>
                      <div className="mt-1 text-xs uppercase tracking-widest text-gray-400">amount due</div>
                      <div className="mt-3 flex justify-start sm:justify-end">
                        {billingLoading ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-gray-300"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking payment</span>
                        ) : currentPayment.status === "paid" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-green-300"><CheckCircle2 className="h-3.5 w-3.5" /> Current cycle paid</span>
                        ) : currentPayment.status === "payment_due" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-300"><AlertCircle className="h-3.5 w-3.5" /> Payment due</span>
                        ) : (
                          <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-gray-300">No payment record</span>
                        )}
                      </div>
                      {store.pendingOwedAmount != null &&
                        formatBillingDate(store.pendingOwedAmountEffectiveAt) !== "N/A" &&
                        Number.isFinite(Number(store.pendingOwedAmount)) &&
                        Number(store.pendingOwedAmount) !== Number(billing.amountDue || 0) && (
                        <div className="mt-2 text-xs text-gray-300">
                          {formatCurrency(Number(store.pendingOwedAmount))} starts on {formatBillingDate(store.pendingOwedAmountEffectiveAt)}.
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-5">
                    <CreditCard className="h-5 w-5 text-gray-300" />
                    <div>
                      <p className="text-xs text-gray-400">Payment schedule</p>
                      <p className="text-sm font-semibold">{formatPaymentSchedule(store.paymentSchedule, billingSubscription?.interval_days || store.billingIntervalDays)}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white/10 px-4 py-3">
                      <p className="text-xs uppercase tracking-widest text-gray-400">Branch allowance</p>
                      <p className="mt-1 text-sm font-semibold">{stores.length} of {branchLimit} branches used</p>
                    </div>
                    <div className="rounded-2xl bg-white/10 px-4 py-3">
                      <p className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-gray-400"><Images className="h-3.5 w-3.5" /> Gallery allowance</p>
                      <p className="mt-1 text-sm font-semibold">Up to {galleryPhotoLimit} photos per branch</p>
                    </div>
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
                  {manualRenewal ? (
                    <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-100">
                      <RefreshCwOff className="mt-0.5 h-5 w-5 shrink-0" />
                      <div>
                        <p className="font-semibold">Automatic renewal is off</p>
                        <p className="mt-1 leading-6">Your current paid access continues through {formatBillingDate(currentPeriodEnd)}. After it expires, use the payment screen to renew manually.</p>
                      </div>
                    </div>
                  ) : dates.length > 0 ? (
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

          {billingSubscription && (
            <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className={`rounded-xl p-2.5 ${manualRenewal ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300"}`}>
                    <RefreshCwOff className="h-5 w-5" />
                  </span>
                  <div>
                    <h4 className="font-bold text-gray-900 dark:text-white">{manualRenewal ? "Manual renewal" : "Automatic renewal"}</h4>
                    <p className="mt-1 font-mono text-xs font-semibold text-gray-400">{billingSubscription.public_id}</p>
                    <p className="mt-1 max-w-xl text-sm leading-6 text-gray-500 dark:text-gray-400">
                      {manualRenewal
                        ? `No future billing links or reminders will be sent automatically. Access remains active through ${formatBillingDate(currentPeriodEnd)}, then you can renew from the expired-payment screen whenever you choose.`
                        : "Perk prepares the next PayMongo payment link and sends billing reminders before the next cycle."}
                    </p>
                  </div>
                </div>
                {!manualRenewal && billingEnabled && billingSubscription.initial_payment_required !== true && (
                  <button
                    type="button"
                    onClick={() => {
                      setRenewalError("");
                      setShowCancelRenewal(true);
                    }}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-900/70 dark:text-red-300 dark:hover:bg-red-950/30"
                  >
                    <RefreshCwOff className="h-4 w-4" /> Cancel automatic renewal
                  </button>
                )}
              </div>
              {renewalMessage && <p className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700 dark:bg-green-950/30 dark:text-green-300">{renewalMessage}</p>}
              {renewalError && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300">{renewalError}</p>}
            </section>
          )}

          <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-start gap-3">
                <span className="rounded-xl bg-teal-50 p-2.5 text-[#1b5660] dark:bg-teal-950/40 dark:text-teal-300">
                  <ArrowUpCircle className="h-5 w-5" />
                </span>
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-white">Upgrade your plan at renewal</h4>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-gray-500 dark:text-gray-400">
                    Compare available higher plans. There is no charge today; a confirmed upgrade uses the renewal date and amount shown in the required terms panel.
                  </p>
                </div>
              </div>

              {upgradeLoading ? (
                <div className="mt-5 flex items-center gap-2 rounded-2xl bg-gray-50 p-4 text-sm text-gray-500 dark:bg-gray-800">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking eligible upgrades...
                </div>
              ) : upgradeOptions?.pendingChange ? (
                <PendingUpgradePanel
                  change={upgradeOptions.pendingChange}
                  onCancel={() => {
                    setUpgradeError("");
                    setUpgradeToCancel(upgradeOptions.pendingChange);
                  }}
                />
              ) : upgradeOptions?.enabled === false ? (
                <p className="mt-5 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  {upgradeOptions.blockedReason || "Subscription upgrades are currently unavailable."}
                </p>
              ) : upgradeOptions ? (
                <>
                  {upgradeOptions.blockedReason && (
                    <p role="status" className="mt-5 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      {upgradeOptions.blockedReason}
                    </p>
                  )}
                  {upgradeOptions.eligiblePlans.length > 0 ? (
                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      {upgradeOptions.eligiblePlans.map((plan) => (
                        <UpgradePlanCard
                          key={plan.id}
                          plan={plan}
                          disabled={Boolean(upgradeOptions.blockedReason) || Boolean(quotingPlanId)}
                          loading={quotingPlanId === plan.id}
                          onReview={() => openUpgradeQuote(plan.id)}
                        />
                      ))}
                    </div>
                  ) : !upgradeOptions.blockedReason ? (
                    <p className="mt-5 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      Your current plan has no higher compatible self-service option.
                    </p>
                  ) : null}
                </>
              ) : upgradeError ? null : (
                <p className="mt-5 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  Upgrade options could not be displayed.
                </p>
              )}

              <p className="mt-5 border-t border-gray-100 pt-4 text-sm font-medium text-gray-600 dark:border-gray-800 dark:text-gray-300">
              Need a lower plan? Contact Perk support.
              </p>
              {upgradeMessage && (
                <p className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700 dark:bg-green-950/30 dark:text-green-300">
                  {upgradeMessage}
                </p>
              )}
              {upgradeError && !upgradeQuote && (
                <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300">
                  {upgradeError}
                </p>
              )}
            </section>

          <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="rounded-xl bg-teal-50 p-2.5 text-[#1b5660] dark:bg-teal-950/40 dark:text-teal-300">
                  <FileText className="h-5 w-5" />
                </span>
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-white">Payment history</h4>
                  <p className="mt-1 max-w-xl text-sm text-gray-500">Review invoices and receipts for every billing cycle. Unpaid invoices also include the secure PayMongo payment link.</p>
                </div>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${billingEnabled ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>
                {billingEnabled ? "Automatic" : manualRenewal ? "Manual renewal" : "Not enabled"}
              </span>
            </div>

            {billingLoading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading billing history...</div>
            ) : billingInvoices.length ? (
              <>
              <ScrollableRegion label="Payment history" className="mt-5 space-y-3 pr-1">
                {invoicePagination.pageItems.map((invoice) => (
                  <div key={invoice.id} className="flex flex-col gap-3 rounded-2xl border border-gray-200 p-4 transition-colors hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{invoice.status === "paid" ? "Receipt" : "Invoice"} {invoiceNumber(invoice)}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(invoice.amount_centavos / 100)}</span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-600 dark:bg-gray-800 dark:text-gray-300">{invoice.status}</span>
                        {isManualPayment(invoice) && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Manual payment</span>}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">Period {formatBillingDate(invoice.period_start)} - {formatBillingDate(invoice.period_end)}</p>
                      <p className="mt-1 text-xs text-gray-500">{invoice.paid_at ? `Paid ${formatBillingDate(invoice.paid_at)}` : `Due ${formatBillingDate(invoice.due_at)}`}{(invoice.manual_payment_reference || invoice.paymongo_reference_number) ? ` | Ref ${invoice.manual_payment_reference || invoice.paymongo_reference_number}` : ""}</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      {invoice.status !== "paid" && invoice.payment_url && (!manualRenewal || currentPeriodExpired) && (
                        <a href={invoice.payment_url} target="_blank" rel="noopener noreferrer" onClick={() => markSubscriptionPaymentPending(subscriptionStore.id)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black dark:bg-white dark:text-gray-900">
                          Open payment page <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => downloadInvoice(invoice)}
                        disabled={downloadingInvoiceId !== null}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        {downloadingInvoiceId === invoice.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        {downloadingInvoiceId === invoice.id ? "Preparing PDF..." : `Download ${invoice.status === "paid" ? "receipt" : "invoice"}`}
                      </button>
                    </div>
                  </div>
                ))}
              </ScrollableRegion>
              <Pagination page={invoicePagination.page} pageSize={invoicePagination.pageSize} totalItems={invoicePagination.totalItems} onPageChange={invoicePagination.setPage} itemLabel="invoices" />
              </>
            ) : (
              <div className="mt-5 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {manualRenewal
                  ? "No manual renewal payment has been prepared. A secure payment option will appear after the current paid period expires."
                  : "No payment link has been issued yet. When automatic billing is enabled, the link appears here and is also sent by email."}
              </div>
            )}
          </section>
        </div>
      )}

      <ConfirmationModal
        isOpen={showCancelRenewal}
        title="Cancel automatic renewal?"
        description={`Your current paid access will stay active through ${formatBillingDate(currentPeriodEnd)}. Perk will stop automatic renewal billing and reminder emails. When access expires, you can still renew manually from the payment screen.`}
        confirmLabel="Cancel automatic renewal"
        cancelLabel="Keep automatic renewal"
        isLoading={cancellingRenewal}
        onConfirm={cancelAutomaticRenewal}
        onClose={() => {
          if (!cancellingRenewal) setShowCancelRenewal(false);
        }}
      />
      <SubscriptionUpgradeTermsModal
        isOpen={Boolean(upgradeQuote)}
        quote={upgradeQuote}
        isSubmitting={upgradeSubmitting}
        error={upgradeError}
        onConfirm={confirmUpgrade}
        onRefreshQuote={refreshOpenQuote}
        onClose={() => {
          if (upgradeSubmitting) return;
          setUpgradeQuote(null);
          setUpgradeError("");
        }}
      />
      <ConfirmationModal
        isOpen={Boolean(upgradeToCancel)}
        title="Cancel scheduled upgrade?"
        description={upgradeToCancel
          ? `${upgradeToCancel.toPlan.name} is scheduled for ${formatBillingDate(upgradeToCancel.targetPeriodStart)} at ${formatPhpCentavos(upgradeToCancel.targetAmountCentavos)}. Cancelling keeps your current plan and removes this scheduled change.`
          : ""}
        confirmLabel="Cancel upgrade"
        cancelLabel="Keep scheduled upgrade"
        isLoading={cancellingUpgrade}
        onConfirm={cancelScheduledUpgrade}
        onClose={() => {
          if (!cancellingUpgrade) setUpgradeToCancel(null);
        }}
      />
    </div>
  );
}

function UpgradePlanCard({
  plan,
  disabled,
  loading,
  onReview,
}: {
  plan: SubscriptionPlanSnapshot;
  disabled: boolean;
  loading: boolean;
  onReview: () => void;
}) {
  const limits = plan.dependencies;
  const formatLimit = (value: number) => value <= 0 ? "Unlimited" : value.toLocaleString("en-PH");
  return (
    <article className="flex flex-col rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h5 className="font-black text-gray-950 dark:text-white">{plan.name}</h5>
          <p className="mt-1 text-lg font-black text-[#1b5660] dark:text-teal-300">
            {formatPhpCentavos(plan.priceCentavos)}
          </p>
          <p className="text-xs text-gray-500">per {plan.interval}</p>
        </div>
        <span className="rounded-full bg-green-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-green-700 dark:bg-green-950/50 dark:text-green-300">
          Higher plan
        </span>
      </div>
      <div className="mt-4 space-y-2">
        {plan.features.slice(0, 5).map((feature) => (
          <p key={feature} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" /> {feature}
          </p>
        ))}
      </div>
      <p className="mt-4 text-xs leading-5 text-gray-500">
        {formatLimit(limits.customerLimit)} customers · {formatLimit(limits.staffLimit)} staff · {formatLimit(limits.branchLimit)} branches · {formatLimit(limits.galleryPhotoLimit)} gallery photos
      </p>
      <button
        type="button"
        aria-label={`Review upgrade to ${plan.name}`}
        disabled={disabled}
        onClick={onReview}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-[#1b5660] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#164750] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading ? "Preparing quote..." : "Review upgrade"}
      </button>
    </article>
  );
}

function PendingUpgradePanel({
  change,
  onCancel,
}: {
  change: SubscriptionPlanChangeSummary;
  onCancel: () => void;
}) {
  const locked = change.status === "locked" || Boolean(change.renewalInvoiceId);
  return (
    <div className="mt-5 rounded-2xl border border-teal-200 bg-teal-50/70 p-4 dark:border-teal-900/60 dark:bg-teal-950/25">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-teal-950 dark:text-teal-100">
            {locked ? <LockKeyhole className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {locked ? "Locked to renewal invoice" : "Upgrade scheduled"}
          </p>
          <p className="mt-2 text-sm text-teal-900 dark:text-teal-200">
            {change.fromPlan.name} → {change.toPlan.name}
          </p>
          <p className="mt-1 text-xs leading-5 text-teal-800 dark:text-teal-300">
            {formatPhpCentavos(change.targetAmountCentavos)} on {formatBillingDate(change.targetPeriodStart)}
          </p>
          {locked && (
            <p className="mt-2 text-xs leading-5 text-teal-800 dark:text-teal-300">
              This decision is attached to an issued invoice and can no longer be cancelled from self-service.
            </p>
          )}
        </div>
        {!locked && (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-900/70 dark:bg-gray-900 dark:text-red-300 dark:hover:bg-red-950/30"
          >
            Cancel scheduled upgrade
          </button>
        )}
      </div>
    </div>
  );
}
