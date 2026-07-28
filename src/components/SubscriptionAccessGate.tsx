import { AlertOctagon, AlertTriangle, CheckCircle2, Clock3, CreditCard, ExternalLink, LoaderCircle, LockKeyhole, LogOut, Mail, X } from "lucide-react";
import { useEffect, useState } from "react";
import { signOut } from "../lib/supabaseAuthCompat";
import {
  getEffectiveSubscriptionStatus,
  getGraceTimeLabel,
  clearSubscriptionPaymentPending,
  isSubscriptionPaymentPending,
  markSubscriptionPaymentPending,
  normalizeAccountRestriction,
  resolveSubscriptionAccess,
  safePaymentLink,
  subscriptionNoticeDismissKey,
  timestampToDate,
} from "../lib/subscriptionAccess";
import { supabase } from "../lib/supabase";

type PortalRole = "store_owner" | "staff";

type FrozenInvoice = {
  publicId?: string | null;
  amountCentavos: number;
  paymentUrl: string;
  referenceNumber: string | null;
  status?: string;
  createdAt?: string | null;
  nextAttemptAt?: string | null;
  paidAt?: string | null;
  periodEnd?: string | null;
};

export type PaymentConfirmation = {
  amountCentavos: number;
  paidAt: string | null;
  periodEnd: string | null;
  referenceNumber: string | null;
};

const LINK_REFRESH_SECONDS = 10;
const PAYMENT_STATUS_FALLBACK_MS = 10_000;

const elapsedLabel = (startedAt: Date | null, now: number) => {
  if (!startedAt) return "a few seconds";
  const totalSeconds = Math.max(0, Math.floor((now - startedAt.getTime()) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds.toString().padStart(2, "0")}s` : `${seconds}s`;
};

const formatPhp = (amount: number) => new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number.isFinite(amount) ? amount : 0);

export function SubscriptionAccessBanner({ store, role = "store_owner" }: { store: any; role?: PortalRole }) {
  const policy = resolveSubscriptionAccess(store?.subscriptionAccess, store?.subscriptionEnd);
  const status = getEffectiveSubscriptionStatus(store?.subscriptionAccess, new Date(), store?.subscriptionEnd);
  const dismissKey = subscriptionNoticeDismissKey(`${String(store?.id || "store")}:${role}`, policy);
  const [dismissed, setDismissed] = useState(() => window.localStorage.getItem(dismissKey) === "dismissed");
  const [latestInvoice, setLatestInvoice] = useState<FrozenInvoice | null>(null);

  useEffect(() => {
    setDismissed(window.localStorage.getItem(dismissKey) === "dismissed");
  }, [dismissKey]);

  useEffect(() => {
    if (role !== "store_owner" || !store?.id || (status !== "warning" && status !== "grace")) return;
    let cancelled = false;
    const loadLatestInvoice = async () => {
      const { data, error } = await supabase
        .from("billing_invoices")
        .select("public_id,amount_centavos,payment_url,paymongo_reference_number")
        .eq("store_id", store.id)
        .in("status", ["link_created", "failed"])
        .not("payment_url", "is", null)
        .order("due_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled || error) return;
      const paymentUrl = safePaymentLink(data?.payment_url);
      setLatestInvoice(data && paymentUrl ? {
        publicId: data.public_id || null,
        amountCentavos: Number(data.amount_centavos || 0),
        paymentUrl,
        referenceNumber: data.paymongo_reference_number || null,
      } : null);
    };
    void loadLatestInvoice();
    const refreshId = window.setInterval(loadLatestInvoice, 10_000);
    return () => { cancelled = true; window.clearInterval(refreshId); };
  }, [role, status, store?.id]);

  if (dismissed || (status !== "warning" && status !== "grace")) return null;
  const graceEnd = timestampToDate(policy.graceEndsAt);

  return (
    <div className="fixed inset-x-0 top-0 z-[100] border-b border-amber-300 bg-amber-400 px-4 py-3 text-amber-950 shadow-lg dark:border-amber-700 dark:bg-amber-500">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 pr-9 sm:flex-row sm:items-center">
        {status === "grace" ? <Clock3 className="mt-0.5 h-5 w-5 shrink-0 sm:mt-0" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 sm:mt-0" />}
        <div className="min-w-0 flex-1 text-sm">
          <span className="font-bold">{status === "grace" ? `Payment grace period: ${getGraceTimeLabel(policy)}` : "Subscription notice"}</span>
          <span className="ml-2">{role === "staff" ? "Please contact your store owner to prevent an interruption to store access." : policy.warningMessage}</span>
          {status === "grace" && graceEnd && (
            <span className="ml-2 whitespace-nowrap font-semibold">Access ends {graceEnd.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}.</span>
          )}
        </div>
        {role === "store_owner" && latestInvoice?.paymentUrl && (
          <a href={latestInvoice.paymentUrl} target="_blank" rel="noopener noreferrer" onClick={() => markSubscriptionPaymentPending(store.id)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-black">
            Pay now - {formatPhp(latestInvoice.amountCentavos / 100)} <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss subscription notice"
        onClick={() => {
          window.localStorage.setItem(dismissKey, "dismissed");
          setDismissed(true);
        }}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 transition-colors hover:bg-amber-950/10"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

export function AccountSuspendedScreen({ store, role = "store_owner" }: { store: any; role?: PortalRole }) {
  const restriction = normalizeAccountRestriction(store?.accountRestriction);
  const contact = "perkup.shop@youthserviceph.org";
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-10rem)] max-w-3xl items-center justify-center py-8">
      <section className="w-full overflow-hidden rounded-[2rem] border border-red-200 bg-white shadow-xl dark:border-red-900/60 dark:bg-gray-900">
        <div className="border-b border-red-200 bg-red-50 p-6 dark:border-red-900/60 dark:bg-red-950/30 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-700 text-white"><AlertOctagon className="h-6 w-6" /></div>
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-red-700 dark:text-red-400">Account suspended</p>
              <h1 className="mt-1 text-2xl font-bold text-gray-950 dark:text-white">Access to {store?.businessName || store?.name || "this store"} is unavailable</h1>
              <p className="mt-2 leading-6 text-gray-600 dark:text-gray-300">{role === "staff" ? "This store is under administrative review. Please contact your store owner for assistance." : restriction.reason}</p>
            </div>
          </div>
        </div>
        <div className="space-y-5 p-6 sm:p-8">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-700 dark:bg-gray-800/60">
            <p className="font-bold text-gray-900 dark:text-white">Administrative review</p>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">Payments cannot remove this restriction. Only a Perk administrator can restore access after the review is complete.</p>
          </div>
          {role === "store_owner" && <a href={`mailto:${contact}`} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 px-5 py-3 text-sm font-bold text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800"><Mail className="h-4 w-4" /> Contact Perk Support</a>}
          <button type="button" onClick={async () => { await signOut(); window.location.assign("/"); }} className="mx-auto flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white"><LogOut className="h-4 w-4" /> Log out</button>
        </div>
      </section>
    </div>
  );
}

export function SubscriptionFrozenScreen({
  store,
  role = "store_owner",
  onPaymentConfirmed,
}: {
  store: any;
  role?: PortalRole;
  onPaymentConfirmed?: (confirmation: PaymentConfirmation) => void;
}) {
  const policy = resolveSubscriptionAccess(store?.subscriptionAccess, store?.subscriptionEnd);
  const mirroredPaymentLink = safePaymentLink(policy.paymentLink);
  const [latestInvoice, setLatestInvoice] = useState<FrozenInvoice | null>(null);
  const [paymentLookupComplete, setPaymentLookupComplete] = useState(role !== "store_owner");
  const storeId = String(store?.id || "store");
  const [paymentPageOpened, setPaymentPageOpened] = useState(() => isSubscriptionPaymentPending(storeId));
  const [clock, setClock] = useState(Date.now());
  const [lastCheckedAt, setLastCheckedAt] = useState(Date.now());
  const [linkPreparationError, setLinkPreparationError] = useState("");
  const paymentLink = latestInvoice?.paymentUrl || mirroredPaymentLink;
  const amountDue = latestInvoice
    ? latestInvoice.amountCentavos / 100
    : Number(store?.owedAmount || 0);
  const subscriptionEnd = timestampToDate(store?.subscriptionEnd);
  const graceEnd = timestampToDate(policy.graceEndsAt);
  const contactIsEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(policy.paymentContact);
  const initialPaymentRequired = store?.initialPaymentRequired === true;
  const storeCreatedAt = timestampToDate(store?.createdAt);
  const initialPaymentDeletionAt = storeCreatedAt
    ? new Date(storeCreatedAt.getTime() + 15 * 86_400_000)
    : null;
  const invoiceStartedAt = latestInvoice?.createdAt
    ? new Date(latestInvoice.createdAt)
    : timestampToDate(store?.createdAt);
  const secondsUntilRefresh = Math.max(1, LINK_REFRESH_SECONDS - Math.floor((clock - lastCheckedAt) / 1000));

  useEffect(() => {
    if (role !== "store_owner" || !store?.id) return;
    let cancelled = false;

    const loadLatestInvoice = async () => {
      const { data, error } = await supabase
        .from("billing_invoices")
        .select("public_id,amount_centavos,payment_url,paymongo_reference_number,status,created_at,next_attempt_at,paid_at,period_end")
        .eq("store_id", store.id)
        .in("status", ["pending", "link_created", "failed", "paid"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      setLastCheckedAt(Date.now());
      setPaymentLookupComplete(true);
      if (error) {
        console.warn("Could not refresh the frozen subscription invoice", error);
        return;
      }
      const verifiedUrl = safePaymentLink(data?.payment_url);
      if (verifiedUrl) setLinkPreparationError("");
      if (data) {
        const invoice = {
          publicId: data.public_id || null,
          amountCentavos: Number(data.amount_centavos || 0),
          paymentUrl: verifiedUrl || "",
          referenceNumber: data.paymongo_reference_number || null,
          status: data.status || "pending",
          createdAt: data.created_at || null,
          nextAttemptAt: data.next_attempt_at || null,
          paidAt: data.paid_at || null,
          periodEnd: data.period_end || null,
        };
        setLatestInvoice(invoice);
        if (data.status === "paid") {
          clearSubscriptionPaymentPending(storeId);
          onPaymentConfirmed?.({
            amountCentavos: invoice.amountCentavos,
            paidAt: invoice.paidAt,
            periodEnd: invoice.periodEnd,
            referenceNumber: invoice.referenceNumber,
          });
        } else if (data.status === "link_created" && paymentPageOpened) {
          const { data: confirmation, error: confirmationError } = await supabase.functions.invoke("subscription-payment-status", {
            body: { storeId: store.id },
          });
          if (!cancelled && !confirmationError && confirmation?.paid === true) {
            clearSubscriptionPaymentPending(storeId);
            onPaymentConfirmed?.({
              amountCentavos: Number(confirmation.amountCentavos || invoice.amountCentavos),
              paidAt: confirmation.paidAt || null,
              periodEnd: confirmation.periodEnd || null,
              referenceNumber: confirmation.referenceNumber || invoice.referenceNumber,
            });
          }
        }
      }
    };

    void loadLatestInvoice();
    const refreshId = window.setInterval(loadLatestInvoice, PAYMENT_STATUS_FALLBACK_MS);
    window.addEventListener("focus", loadLatestInvoice);
    document.addEventListener("visibilitychange", loadLatestInvoice);
    return () => {
      cancelled = true;
      window.clearInterval(refreshId);
      window.removeEventListener("focus", loadLatestInvoice);
      document.removeEventListener("visibilitychange", loadLatestInvoice);
    };
  }, [onPaymentConfirmed, paymentPageOpened, role, store?.id, storeId]);

  useEffect(() => {
    if (role !== "store_owner" || !store?.id) return;

    const channel = supabase
      .channel(`billing-invoice-payment:${store.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "billing_invoices",
          filter: `store_id=eq.${store.id}`,
        },
        (payload) => {
          const invoice = payload.new as {
            status?: string;
            amount_centavos?: number;
            payment_url?: string | null;
            created_at?: string | null;
            next_attempt_at?: string | null;
            paid_at?: string | null;
            period_end?: string | null;
            paymongo_reference_number?: string | null;
            public_id?: string | null;
          };
          if (invoice.status === "link_created") {
            const verifiedUrl = safePaymentLink(invoice.payment_url);
            if (!verifiedUrl) return;
            setLinkPreparationError("");
            setLatestInvoice((current) => ({
              amountCentavos: Number(invoice.amount_centavos || current?.amountCentavos || 0),
              publicId: invoice.public_id || current?.publicId || null,
              paymentUrl: verifiedUrl,
              referenceNumber: invoice.paymongo_reference_number || current?.referenceNumber || null,
              status: "link_created",
              createdAt: invoice.created_at || current?.createdAt || new Date().toISOString(),
              nextAttemptAt: invoice.next_attempt_at || current?.nextAttemptAt || null,
              paidAt: current?.paidAt || null,
              periodEnd: invoice.period_end || current?.periodEnd || null,
            }));
            return;
          }
          if (invoice.status !== "paid") return;

          clearSubscriptionPaymentPending(storeId);
          onPaymentConfirmed?.({
            amountCentavos: Number(invoice.amount_centavos || 0),
            paidAt: invoice.paid_at || null,
            periodEnd: invoice.period_end || null,
            referenceNumber: invoice.paymongo_reference_number || null,
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [onPaymentConfirmed, role, store?.id, storeId]);

  useEffect(() => {
    if (role !== "store_owner" || !store?.id || paymentLink || !paymentLookupComplete) return;
    let cancelled = false;
    let inFlight = false;
    const preparePaymentLink = async () => {
      if (inFlight) return;
      inFlight = true;
      setLastCheckedAt(Date.now());
      try {
        const { data, error } = await supabase.functions.invoke("subscription-payment-status", {
          body: { storeId: store.id },
        });
        if (cancelled) return;
        if (error || !data?.paymentUrl) {
          const message = String(data?.error || error?.message || "PayMongo did not return a payment link.");
          setLinkPreparationError(message);
          if (error) console.warn("Could not prepare the subscription payment link", error);
          return;
        }
        const verifiedUrl = safePaymentLink(data.paymentUrl);
        if (!verifiedUrl) {
          setLinkPreparationError("PayMongo returned an invalid payment link. Perk will retry automatically.");
          return;
        }
        setLinkPreparationError("");
        setLatestInvoice((current) => ({
          amountCentavos: Number(data.amountCentavos || current?.amountCentavos || 0),
          paymentUrl: verifiedUrl,
          referenceNumber: data.referenceNumber || current?.referenceNumber || null,
          status: "link_created",
          createdAt: current?.createdAt || new Date().toISOString(),
          nextAttemptAt: current?.nextAttemptAt || null,
          paidAt: current?.paidAt || null,
          periodEnd: current?.periodEnd || null,
        }));
      } finally {
        inFlight = false;
      }
    };
    void preparePaymentLink();
    const retryId = window.setInterval(preparePaymentLink, LINK_REFRESH_SECONDS * 1_000);
    return () => {
      cancelled = true;
      window.clearInterval(retryId);
    };
  }, [paymentLink, paymentLookupComplete, role, store?.id]);

  useEffect(() => {
    if (paymentLink || role !== "store_owner") return;
    const clockId = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(clockId);
  }, [paymentLink, role]);

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-10rem)] max-w-3xl items-center justify-center py-8">
      <section className="w-full overflow-hidden rounded-[2rem] border border-red-200 bg-white shadow-xl dark:border-red-900/60 dark:bg-gray-900">
        <div className="border-b border-red-200 bg-red-50 p-6 dark:border-red-900/60 dark:bg-red-950/30 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-600 text-white">
              <LockKeyhole className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-red-600 dark:text-red-400">{initialPaymentRequired ? "Initial payment required" : "Subscription frozen"}</p>
              <h1 className="mt-1 text-2xl font-bold text-gray-950 dark:text-white">{initialPaymentRequired ? `Activate ${store?.businessName || store?.name || "this store"}` : `Access to ${store?.businessName || store?.name || "this store"} is temporarily paused`}</h1>
              <p className="mt-2 leading-6 text-gray-600 dark:text-gray-300">{role === "staff" ? "Store access is paused. Please contact your store owner so they can settle the subscription." : initialPaymentRequired ? "Complete the first subscription payment through PayMongo to activate the store dashboard. Access starts automatically after PayMongo confirms the exact payment." : "The subscription payment is overdue. Pay through the secure PayMongo page below; access reactivates automatically after PayMongo confirms the exact payment."}</p>
            </div>
          </div>
        </div>

        <div className="space-y-6 p-6 sm:p-8">
          {role === "store_owner" && <div className="grid gap-3 sm:grid-cols-2">
            <Info label="Subscription" value={store?.subscriptionLevel || "Not specified"} />
            <Info label="Exact amount due" value={formatPhp(amountDue)} />
            {latestInvoice?.publicId && <Info label="Invoice ID" value={latestInvoice.publicId} />}
            {latestInvoice?.referenceNumber && <Info label="PayMongo reference" value={latestInvoice.referenceNumber} />}
            {initialPaymentRequired ? <>
              <Info label="Access period" value={`${Number(store?.billingIntervalDays || 30)} days after payment`} />
              <Info label="Payment deadline" value={initialPaymentDeletionAt ? `${initialPaymentDeletionAt.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })} (automatic deletion)` : "15 days after creation"} />
            </> : <>
              <Info label="Subscription ended" value={subscriptionEnd ? subscriptionEnd.toLocaleDateString("en-PH", { dateStyle: "long" }) : "Contact Perk"} />
              <Info label="Grace period ended" value={graceEnd ? graceEnd.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "Not applicable"} />
            </>}
          </div>}

          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-700 dark:bg-gray-800/60">
            <div className="flex items-center gap-2 font-bold text-gray-900 dark:text-white"><CreditCard className="h-5 w-5" /> How to restore access</div>
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-gray-600 dark:text-gray-300">{role === "staff" ? "Contact your store owner. Only the store owner can open the payment page." : paymentLink ? `Open the official PayMongo payment page and confirm that it shows exactly ${formatPhp(amountDue)} before paying. Complete payment using an available method such as QR Ph. You do not need to send proof; signed PayMongo confirmation ${initialPaymentRequired ? "activates the store" : "restores access"} automatically.` : paymentLookupComplete ? "A secure PayMongo payment link is not available yet. Perk is preparing it automatically; please contact support if it does not appear shortly." : "Checking for your secure PayMongo payment link..."}</p>
            {role === "store_owner" && !paymentLink && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-950 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-100" role="status" aria-live="polite">
                <LoaderCircle className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />
                <div className="text-sm">
                  <p className="font-bold">Preparing your secure payment link</p>
                  <p className="mt-1 text-blue-800 dark:text-blue-200">
                    Elapsed: {elapsedLabel(invoiceStartedAt, clock)}. Checking automatically again in {secondsUntilRefresh}s; you do not need to refresh this page.
                  </p>
                  {linkPreparationError && (
                    <p className="mt-2 text-blue-900 dark:text-blue-100">
                      Last attempt: {linkPreparationError} Retrying automatically.
                    </p>
                  )}
                </div>
              </div>
            )}
            {role === "store_owner" && paymentLink && paymentPageOpened && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-950 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-100" role="status" aria-live="polite">
                <LoaderCircle className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />
                <div className="text-sm">
                  <p className="font-bold">Waiting for PayMongo confirmation</p>
                  <p className="mt-1 text-blue-800 dark:text-blue-200">You can safely close this Perk or PayMongo tab and come back later. Payment processing continues securely, and we will resume checking when you return.</p>
                </div>
              </div>
            )}
          </div>

          {role === "store_owner" && <div className="flex flex-col gap-3 sm:flex-row">
            {paymentLink && (
              <a href={paymentLink} target="_blank" rel="noopener noreferrer" onClick={() => { markSubscriptionPaymentPending(storeId); setPaymentPageOpened(true); }} aria-label={`Pay now - ${formatPhp(amountDue)} securely with PayMongo`} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-green-700">
                Pay now - {formatPhp(amountDue)} <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <a href={contactIsEmail ? `mailto:${policy.paymentContact}` : undefined} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 px-5 py-3 text-sm font-bold text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800">
              <Mail className="h-4 w-4" /> {policy.paymentContact}
            </a>
          </div>}

          <button type="button" onClick={async () => { await signOut(); window.location.assign("/"); }} className="mx-auto flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white">
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      </section>
    </div>
  );
}

export function PaymentActivationSuccessScreen({
  store,
  confirmation,
  onContinue,
}: {
  store: any;
  confirmation?: PaymentConfirmation | null;
  onContinue: () => void;
}) {
  const [secondsRemaining, setSecondsRemaining] = useState(4);

  useEffect(() => {
    if (secondsRemaining <= 0) {
      onContinue();
      return;
    }
    const timerId = window.setTimeout(() => setSecondsRemaining((seconds) => seconds - 1), 1_000);
    return () => window.clearTimeout(timerId);
  }, [onContinue, secondsRemaining]);

  const paidAt = confirmation?.paidAt ? new Date(confirmation.paidAt) : null;
  const periodEnd = confirmation?.periodEnd ? new Date(confirmation.periodEnd) : timestampToDate(store?.subscriptionEnd);

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-10rem)] max-w-2xl items-center justify-center py-8">
      <section className="w-full rounded-[2rem] border border-green-200 bg-white p-7 text-center shadow-xl dark:border-green-900/60 dark:bg-gray-900 sm:p-10" role="status" aria-live="assertive">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300">
          <CheckCircle2 className="h-9 w-9" />
        </div>
        <p className="mt-5 text-sm font-bold uppercase tracking-widest text-green-700 dark:text-green-400">Payment received</p>
        <h1 className="mt-2 text-3xl font-bold text-gray-950 dark:text-white">Your store is now active</h1>
        <p className="mx-auto mt-3 max-w-lg leading-6 text-gray-600 dark:text-gray-300">
          PayMongo confirmed the payment for {store?.businessName || store?.name || "your store"}. Dashboard access and public listing have been enabled automatically.
        </p>
        <div className="mt-7 grid gap-3 text-left sm:grid-cols-2">
          <Info label="Payment" value={confirmation ? formatPhp(confirmation.amountCentavos / 100) : "Confirmed"} />
          <Info label="Paid at" value={paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "Just now"} />
          {confirmation?.referenceNumber && <Info label="PayMongo reference" value={confirmation.referenceNumber} />}
          <Info label="Access active until" value={periodEnd && !Number.isNaN(periodEnd.getTime()) ? periodEnd.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "Updated in your subscription page"} />
        </div>
        <p className="mt-6 text-sm font-medium text-gray-500 dark:text-gray-400">Opening your store dashboard in {secondsRemaining}s…</p>
        <button type="button" onClick={onContinue} className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-green-700">
          Open store dashboard now
        </button>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-700">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
