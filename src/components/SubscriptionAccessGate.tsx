import { AlertTriangle, Clock3, CreditCard, ExternalLink, LockKeyhole, LogOut, Mail, X } from "lucide-react";
import { useEffect, useState } from "react";
import { signOut } from "../lib/supabaseAuthCompat";
import {
  getEffectiveSubscriptionStatus,
  getGraceTimeLabel,
  resolveSubscriptionAccess,
  safePaymentLink,
  subscriptionNoticeDismissKey,
  timestampToDate,
} from "../lib/subscriptionAccess";
import { supabase } from "../lib/supabase";

type PortalRole = "store_owner" | "staff";

type FrozenInvoice = {
  amountCentavos: number;
  paymentUrl: string;
  referenceNumber: string | null;
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

  useEffect(() => {
    setDismissed(window.localStorage.getItem(dismissKey) === "dismissed");
  }, [dismissKey]);

  if (dismissed || (status !== "warning" && status !== "grace")) return null;
  const graceEnd = timestampToDate(policy.graceEndsAt);

  return (
    <div className="fixed inset-x-0 top-0 z-[100] border-b border-amber-300 bg-amber-400 px-4 py-3 text-amber-950 shadow-lg dark:border-amber-700 dark:bg-amber-500">
      <div className="mx-auto flex max-w-7xl items-start gap-3 pr-9 sm:items-center">
        {status === "grace" ? <Clock3 className="mt-0.5 h-5 w-5 shrink-0 sm:mt-0" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 sm:mt-0" />}
        <div className="min-w-0 flex-1 text-sm">
          <span className="font-bold">{status === "grace" ? `Payment grace period: ${getGraceTimeLabel(policy)}` : "Subscription notice"}</span>
          <span className="ml-2">{role === "staff" ? "Please contact your store owner to prevent an interruption to store access." : policy.warningMessage}</span>
          {status === "grace" && graceEnd && (
            <span className="ml-2 whitespace-nowrap font-semibold">Access ends {graceEnd.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}.</span>
          )}
        </div>
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

export function SubscriptionFrozenScreen({ store, role = "store_owner" }: { store: any; role?: PortalRole }) {
  const policy = resolveSubscriptionAccess(store?.subscriptionAccess, store?.subscriptionEnd);
  const mirroredPaymentLink = safePaymentLink(policy.paymentLink);
  const [latestInvoice, setLatestInvoice] = useState<FrozenInvoice | null>(null);
  const [paymentLookupComplete, setPaymentLookupComplete] = useState(role !== "store_owner");
  const paymentLink = latestInvoice?.paymentUrl || mirroredPaymentLink;
  const amountDue = latestInvoice
    ? latestInvoice.amountCentavos / 100
    : Number(store?.owedAmount || 0);
  const subscriptionEnd = timestampToDate(store?.subscriptionEnd);
  const graceEnd = timestampToDate(policy.graceEndsAt);
  const contactIsEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(policy.paymentContact);

  useEffect(() => {
    if (role !== "store_owner" || !store?.id) return;
    let cancelled = false;

    const loadLatestInvoice = async () => {
      const { data, error } = await supabase
        .from("billing_invoices")
        .select("amount_centavos,payment_url,paymongo_reference_number")
        .eq("store_id", store.id)
        .in("status", ["link_created", "failed"])
        .not("payment_url", "is", null)
        .order("due_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      setPaymentLookupComplete(true);
      if (error) {
        console.warn("Could not refresh the frozen subscription invoice", error);
        return;
      }
      const verifiedUrl = safePaymentLink(data?.payment_url);
      if (data && verifiedUrl) {
        setLatestInvoice({
          amountCentavos: Number(data.amount_centavos || 0),
          paymentUrl: verifiedUrl,
          referenceNumber: data.paymongo_reference_number || null,
        });
      }
    };

    void loadLatestInvoice();
    const refreshId = window.setInterval(loadLatestInvoice, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshId);
    };
  }, [role, store?.id]);

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-10rem)] max-w-3xl items-center justify-center py-8">
      <section className="w-full overflow-hidden rounded-[2rem] border border-red-200 bg-white shadow-xl dark:border-red-900/60 dark:bg-gray-900">
        <div className="border-b border-red-200 bg-red-50 p-6 dark:border-red-900/60 dark:bg-red-950/30 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-600 text-white">
              <LockKeyhole className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-red-600 dark:text-red-400">Subscription frozen</p>
              <h1 className="mt-1 text-2xl font-bold text-gray-950 dark:text-white">Access to {store?.businessName || store?.name || "this store"} is temporarily paused</h1>
              <p className="mt-2 leading-6 text-gray-600 dark:text-gray-300">{role === "staff" ? "Store access is paused. Please contact your store owner so they can settle the outstanding subscription." : "The subscription payment is overdue. Pay through the secure PayMongo page below; access reactivates automatically after PayMongo confirms the exact payment."}</p>
            </div>
          </div>
        </div>

        <div className="space-y-6 p-6 sm:p-8">
          {role === "store_owner" && <div className="grid gap-3 sm:grid-cols-2">
            <Info label="Subscription" value={store?.subscriptionLevel || "Not specified"} />
            <Info label="Exact amount due" value={formatPhp(amountDue)} />
            {latestInvoice?.referenceNumber && <Info label="PayMongo reference" value={latestInvoice.referenceNumber} />}
            <Info label="Subscription ended" value={subscriptionEnd ? subscriptionEnd.toLocaleDateString("en-PH", { dateStyle: "long" }) : "Contact PerkUp"} />
            <Info label="Grace period ended" value={graceEnd ? graceEnd.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "Not applicable"} />
          </div>}

          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-700 dark:bg-gray-800/60">
            <div className="flex items-center gap-2 font-bold text-gray-900 dark:text-white"><CreditCard className="h-5 w-5" /> How to restore access</div>
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-gray-600 dark:text-gray-300">{role === "staff" ? "Contact your store owner. Only the store owner can open the payment page." : paymentLink ? `Open the official PayMongo payment page and confirm that it shows exactly ${formatPhp(amountDue)} before paying. Complete payment using an available method such as QR Ph. You do not need to send proof; signed PayMongo confirmation restores access automatically.` : paymentLookupComplete ? "A secure PayMongo payment link is not available yet. PerkUp is retrying automatically; please contact support if it does not appear shortly." : "Checking for your secure PayMongo payment link..."}</p>
          </div>

          {role === "store_owner" && <div className="flex flex-col gap-3 sm:flex-row">
            {paymentLink && (
              <a href={paymentLink} target="_blank" rel="noopener noreferrer" aria-label={`Pay ${formatPhp(amountDue)} securely with PayMongo`} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-green-700">
                Pay {formatPhp(amountDue)} securely <ExternalLink className="h-4 w-4" />
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-700">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
