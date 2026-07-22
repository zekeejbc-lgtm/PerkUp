import { useEffect, useState } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, CreditCard, ExternalLink, Images, Loader2, Printer } from "lucide-react";
import {
  formatPaymentSchedule,
  formatPredictedPaymentDate,
  formatBillingDate,
  getSubscriptionBranchLimit,
  getSubscriptionGalleryPhotoLimit,
  predictPaymentDates,
  resolveStoreBilling,
} from "../../lib/subscriptionBilling";
import { useCurrency } from "../../contexts/CurrencyContext";
import { supabase } from "../../lib/supabase";

type BillingInvoice = {
  id: string;
  status: string;
  due_at: string;
  period_start: string;
  period_end: string;
  amount_centavos: number;
  currency: string;
  payment_url: string | null;
  paymongo_reference_number: string | null;
  livemode: boolean;
  paid_at: string | null;
  payment_method: string | null;
  gross_amount_centavos: number | null;
  fee_centavos: number | null;
  net_amount_centavos: number | null;
};

const escapeInvoiceText = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const invoiceNumber = (invoice: BillingInvoice) => `PU-${invoice.id.replace(/-/g, "").slice(0, 12).toUpperCase()}`;

export default function StoreOwnerSubscription({ stores }: { stores: any[] }) {
  const { formatCurrency } = useCurrency();
  const subscriptionStore = stores.find((store) => store.isPrimaryBranch === true) ||
    stores.find((store) => store.subscriptionLevel || store.subscriptionDependencies) ||
    stores[0] || null;
  const branchLimit = getSubscriptionBranchLimit(subscriptionStore?.subscriptionDependencies);
  const galleryPhotoLimit = getSubscriptionGalleryPhotoLimit(subscriptionStore?.subscriptionDependencies);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [billingInvoices, setBillingInvoices] = useState<BillingInvoice[]>([]);

  const printInvoice = (invoice: BillingInvoice) => {
    const popup = window.open("", "_blank", "width=900,height=720");
    if (!popup) {
      window.alert("Allow pop-ups for PerkUp to open the printable invoice.");
      return;
    }
    popup.opener = null;
    const amount = formatCurrency((invoice.gross_amount_centavos || invoice.amount_centavos) / 100);
    const status = invoice.status === "paid" ? "PAID" : "PAYMENT DUE";
    popup.document.write(`<!doctype html><html><head><title>${escapeInvoiceText(invoiceNumber(invoice))}</title><style>
      body{font-family:Arial,sans-serif;color:#171717;margin:48px;line-height:1.5}.brand{font-size:20px;font-weight:800;margin-bottom:30px}
      h1{margin:0;font-size:30px}.muted{color:#666}.status{display:inline-block;margin:16px 0;padding:6px 10px;border-radius:8px;background:#eee;font-weight:700}
      table{width:100%;border-collapse:collapse;margin-top:24px}th,td{text-align:left;padding:13px;border-bottom:1px solid #ddd}th{width:38%;color:#555}
      .footer{margin-top:40px;font-size:12px;color:#666}@media print{button{display:none}body{margin:24px}}
    </style></head><body>
      <div class="brand">PerkUp</div><h1>Subscription ${invoice.status === "paid" ? "Receipt" : "Invoice"}</h1>
      <div class="muted">Document ${escapeInvoiceText(invoiceNumber(invoice))}</div><div class="status">${status}${invoice.livemode ? "" : " · TEST MODE"}</div>
      <table>
        <tr><th>Business</th><td>${escapeInvoiceText(subscriptionStore?.businessName || subscriptionStore?.name || "Store")}</td></tr>
        <tr><th>Amount</th><td>${escapeInvoiceText(amount)}</td></tr>
        <tr><th>Billing period</th><td>${escapeInvoiceText(formatBillingDate(invoice.period_start))} – ${escapeInvoiceText(formatBillingDate(invoice.period_end))}</td></tr>
        <tr><th>Due</th><td>${escapeInvoiceText(formatBillingDate(invoice.due_at))}</td></tr>
        ${invoice.paid_at ? `<tr><th>Paid</th><td>${escapeInvoiceText(formatBillingDate(invoice.paid_at))}</td></tr>` : ""}
        ${invoice.payment_method ? `<tr><th>Payment method</th><td>${escapeInvoiceText(invoice.payment_method.replace(/_/g, " "))}</td></tr>` : ""}
        <tr><th>PayMongo reference</th><td>${escapeInvoiceText(invoice.paymongo_reference_number || "Pending")}</td></tr>
      </table>
      <div class="footer">This system-generated document records a PerkUp subscription charge or payment. It is not represented as a VAT official receipt or tax invoice. Contact perkup.shop@youthserviceph.org for assistance.</div>
      <p><button onclick="window.print()">Print / Save as PDF</button></p>
    </body></html>`);
    popup.document.close();
  };

  useEffect(() => {
    if (!subscriptionStore?.id) return;
    let cancelled = false;
    setBillingLoading(true);
    Promise.all([
      supabase.from("billing_subscriptions").select("automation_enabled").eq("store_id", subscriptionStore.id).maybeSingle(),
      supabase.from("billing_invoices")
        .select("id,status,due_at,period_start,period_end,amount_centavos,currency,payment_url,paymongo_reference_number,livemode,paid_at,payment_method,gross_amount_centavos,fee_centavos,net_amount_centavos")
        .eq("store_id", subscriptionStore.id)
        .order("created_at", { ascending: false })
        .limit(6),
    ]).then(([subscriptionResult, invoiceResult]) => {
      if (cancelled) return;
      if (subscriptionResult.error) throw subscriptionResult.error;
      if (invoiceResult.error) throw invoiceResult.error;
      setBillingEnabled(subscriptionResult.data?.automation_enabled === true);
      setBillingInvoices((invoiceResult.data || []) as BillingInvoice[]);
    }).catch((error) => {
      console.error("Could not load subscription billing history", error);
      if (!cancelled) {
        setBillingEnabled(false);
        setBillingInvoices([]);
      }
    }).finally(() => {
      if (!cancelled) setBillingLoading(false);
    });
    return () => { cancelled = true; };
  }, [subscriptionStore?.id]);

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
                      <div className="text-3xl font-black">{formatCurrency(Number(billing.amountDue || 0))}</div>
                      <div className="mt-1 text-xs uppercase tracking-widest text-gray-400">amount due</div>
                      {Number.isFinite(Number(store.pendingOwedAmount)) && Number(store.pendingOwedAmount) !== Number(billing.amountDue || 0) && (
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
                      <p className="text-sm font-semibold">{formatPaymentSchedule(store.paymentSchedule)}</p>
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

          <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="font-bold text-gray-900 dark:text-white">PayMongo billing</h4>
                <p className="mt-1 text-sm text-gray-500">Use the latest payment page and select QR Ph at checkout.</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${billingEnabled ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>
                {billingEnabled ? "Automatic" : "Not enabled"}
              </span>
            </div>

            {billingLoading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading billing history…</div>
            ) : billingInvoices.length ? (
              <div className="mt-5 space-y-3">
                {billingInvoices.map((invoice) => (
                  <div key={invoice.id} className="flex flex-col gap-3 rounded-2xl border border-gray-200 p-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(invoice.amount_centavos / 100)}</span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-600 dark:bg-gray-800 dark:text-gray-300">{invoice.status}</span>
                        {!invoice.livemode && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">Test mode</span>}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">Due {formatBillingDate(invoice.due_at)}{invoice.paymongo_reference_number ? ` · Ref ${invoice.paymongo_reference_number}` : ""}</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      {invoice.status !== "paid" && invoice.payment_url && (
                        <a href={invoice.payment_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black dark:bg-white dark:text-gray-900">
                          Open payment page <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      <button type="button" onClick={() => printInvoice(invoice)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
                        Print / PDF <Printer className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                No payment link has been issued yet. When automatic billing is enabled, the link appears here and is also sent by email.
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
