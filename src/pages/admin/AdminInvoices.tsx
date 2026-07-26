import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  ReceiptText,
  RefreshCw,
  Timer,
} from "lucide-react";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { Pagination } from "../../components/Pagination";
import { useCurrency } from "../../contexts/CurrencyContext";
import { invokeAdminBackend } from "../../lib/adminBackend";
import { downloadSubscriptionInvoicePdf } from "../../lib/subscriptionInvoicePdf";

type InvoiceFilter = "all" | "outstanding" | "paid" | "failed" | "closed";

type AdminBillingInvoice = {
  id: string;
  public_id: string;
  subscription_id: string;
  store_id: string;
  owner_user_id: string;
  invoice_type: string;
  status: string;
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
  last_error: string | null;
  business: {
    name: string;
    address: string | null;
    contact: string | null;
  };
  subscription: {
    billing_email: string | null;
    plan_id: string | null;
    interval_days: number | null;
    grace_period_days: number | null;
  };
};

type InvoiceResponse = {
  invoices: AdminBillingInvoice[];
  page: number;
  pageSize: number;
  total: number;
  summary: {
    total: number;
    paid: number;
    outstanding: number;
    failed: number;
  };
};

const PAGE_SIZE = 25;

const invoiceNumber = (invoice: AdminBillingInvoice) =>
  invoice.public_id || `PU-${invoice.id.replace(/-/g, "").slice(0, 12).toUpperCase()}`;

const formatDate = (value: string | null) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const titleCase = (value: string) =>
  value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());

const isManualPayment = (invoice: AdminBillingInvoice) =>
  String(invoice.payment_method || "").startsWith("manual_") ||
  invoice.payment_method === "admin_confirmed";

const statusClasses = (status: string) => {
  if (status === "paid") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  if (status === "failed") return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  if (status === "pending" || status === "link_created") {
    return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  }
  return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";
};

export default function AdminInvoices() {
  const { formatCurrency } = useCurrency();
  const [invoices, setInvoices] = useState<AdminBillingInvoice[]>([]);
  const [summary, setSummary] = useState<InvoiceResponse["summary"]>({
    total: 0,
    paid: 0,
    outstanding: 0,
    failed: 0,
  });
  const [filter, setFilter] = useState<InvoiceFilter>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);

  const loadInvoices = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await invokeAdminBackend<InvoiceResponse>({
        action: "list_billing_invoices",
        page,
        pageSize: PAGE_SIZE,
        status: filter,
      });
      setInvoices(response.invoices);
      setSummary(response.summary);
      setTotal(response.total);
    } catch (loadError) {
      console.error("Could not load issued invoices", loadError);
      setError(loadError instanceof Error ? loadError.message : "Issued invoices could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, page]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  const changeFilter = (nextFilter: InvoiceFilter) => {
    setFilter(nextFilter);
    setPage(1);
  };

  const downloadInvoice = async (invoice: AdminBillingInvoice) => {
    setDownloadingInvoiceId(invoice.id);
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
          planId: invoice.subscription.plan_id,
          billingEmail: invoice.subscription.billing_email,
          intervalDays: invoice.subscription.interval_days,
          gracePeriodDays: invoice.subscription.grace_period_days,
        },
        business: invoice.business,
      });
    } catch (downloadError) {
      console.error("Could not generate invoice PDF", downloadError);
      window.alert("We could not prepare this PDF. Please refresh the page and try again.");
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  if (loading) return <PageSkeleton variant="table" />;

  const summaryCards = [
    { label: "All issued", value: summary.total, icon: ReceiptText, tone: "text-gray-700 dark:text-gray-200" },
    { label: "Paid", value: summary.paid, icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-400" },
    { label: "Awaiting payment", value: summary.outstanding, icon: Timer, tone: "text-amber-600 dark:text-amber-400" },
    { label: "Needs attention", value: summary.failed, icon: AlertCircle, tone: "text-red-600 dark:text-red-400" },
  ];
  const filters: Array<{ id: InvoiceFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "outstanding", label: "Awaiting payment" },
    { id: "paid", label: "Paid" },
    { id: "failed", label: "Failed" },
    { id: "closed", label: "Closed" },
  ];

  return (
    <div className="animate-in space-y-6 fade-in duration-300">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <ReceiptText className="h-6 w-6 text-gray-500" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Issued invoices</h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Review every subscription invoice issued to partner stores and download a current PDF copy at any time.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadInvoices(true)}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{card.label}</p>
              <card.icon className={`h-5 w-5 ${card.tone}`} />
            </div>
            <p className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">{card.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="flex gap-2 overflow-x-auto border-b border-gray-100 p-3 dark:border-gray-800">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => changeFilter(item.id)}
              className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                filter === item.id
                  ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error ? (
          <div className="m-4 flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            <span>{error}</span>
            <button type="button" onClick={() => void loadInvoices()} className="font-semibold underline underline-offset-4">
              Try again
            </button>
          </div>
        ) : invoices.length ? (
          <>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {invoices.map((invoice) => (
                <article key={invoice.id} className="grid gap-4 p-4 transition-colors hover:bg-gray-50/70 dark:hover:bg-gray-800/30 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                      <p className="font-bold text-gray-900 dark:text-white">{invoiceNumber(invoice)}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusClasses(invoice.status)}`}>
                        {titleCase(invoice.status)}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        {titleCase(invoice.invoice_type)}
                      </span>
                    </div>
                    <p className="mt-2 truncate font-semibold text-gray-800 dark:text-gray-100">{invoice.business.name}</p>
                    <p className="mt-1 truncate text-xs text-gray-500">
                      {invoice.subscription.billing_email || "No billing email"} · Store {invoice.store_id}
                    </p>
                  </div>

                  <div>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {formatCurrency(invoice.amount_centavos / 100)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Period {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {invoice.paid_at ? `Paid ${formatDate(invoice.paid_at)}` : `Due ${formatDate(invoice.due_at)}`}
                      {(invoice.manual_payment_reference || invoice.paymongo_reference_number)
                        ? ` · Ref ${invoice.manual_payment_reference || invoice.paymongo_reference_number}`
                        : ""}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void downloadInvoice(invoice)}
                    disabled={downloadingInvoiceId !== null}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-wait disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 lg:w-auto"
                  >
                    {downloadingInvoiceId === invoice.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Download className="h-4 w-4" />}
                    {downloadingInvoiceId === invoice.id
                      ? "Preparing PDF..."
                      : `Download ${invoice.status === "paid" ? "receipt" : "invoice"}`}
                  </button>
                </article>
              ))}
            </div>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              totalItems={total}
              itemLabel="invoices"
              onPageChange={setPage}
            />
          </>
        ) : (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="rounded-2xl bg-gray-100 p-4 text-gray-400 dark:bg-gray-800">
              <ReceiptText className="h-7 w-7" />
            </span>
            <h3 className="mt-4 font-bold text-gray-900 dark:text-white">No invoices found</h3>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
              There are no issued invoices matching this status yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
