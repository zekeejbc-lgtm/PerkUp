import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Database,
  FileClock,
  HeartPulse,
  Loader2,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  TicketCheck,
} from "lucide-react";
import { CustomDropdown } from "../../components/CustomDropdown";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { Pagination } from "../../components/Pagination";
import { useToast } from "../../components/ToastProvider";
import { useCurrency } from "../../contexts/CurrencyContext";
import { invokeAdminBackend } from "../../lib/adminBackend";

type AuditTab = "financial" | "receipts" | "loyalty" | "events" | "health";

type AuditOverview = {
  financial: {
    grossCentavos: number;
    feeCentavos: number;
    netCentavos: number;
    paidTransactions: number;
    issuedInvoices: number;
    outstandingInvoices: number;
    failedInvoices: number;
  };
  receipts: { total: number; sent: number; failed: number };
  audit: { total: number; failures: number };
  generatedAt: string;
};

type HealthCheck = {
  id: string;
  name: string;
  status: "healthy" | "warning" | "critical";
  value: string;
  detail: string;
  checkedAt: string;
};

type HealthResponse = {
  checks: HealthCheck[];
  overall: HealthCheck["status"];
  generatedAt: string;
};

const PAGE_SIZE = 25;

const TAB_OPTIONS: Array<{ id: AuditTab; label: string; icon: typeof Banknote }> = [
  { id: "financial", label: "Money & transactions", icon: Banknote },
  { id: "receipts", label: "Receipts", icon: ReceiptText },
  { id: "loyalty", label: "Loyalty activity", icon: TicketCheck },
  { id: "events", label: "Audit trail", icon: FileClock },
  { id: "health", label: "System health", icon: HeartPulse },
];

const STATUS_OPTIONS: Record<AuditTab, Array<{ label: string; value: string }>> = {
  financial: [
    { label: "All invoice statuses", value: "all" },
    { label: "Paid", value: "paid" },
    { label: "Pending", value: "pending" },
    { label: "Link created", value: "link_created" },
    { label: "Failed", value: "failed" },
    { label: "Expired", value: "expired" },
    { label: "Void", value: "void" },
  ],
  receipts: [
    { label: "All delivery statuses", value: "all" },
    { label: "Sent", value: "sent" },
    { label: "Pending", value: "pending" },
    { label: "Failed", value: "failed" },
  ],
  loyalty: [
    { label: "All activity statuses", value: "all" },
    { label: "Completed", value: "completed" },
    { label: "Redeemed", value: "redeemed" },
    { label: "Failed", value: "failed" },
  ],
  events: [
    { label: "All outcomes", value: "all" },
    { label: "Success", value: "success" },
    { label: "Failure", value: "failure" },
    { label: "Blocked", value: "blocked" },
  ],
  health: [
    { label: "All health states", value: "all" },
    { label: "Healthy", value: "healthy" },
    { label: "Warning", value: "warning" },
    { label: "Critical", value: "critical" },
  ],
};

const titleCase = (value: unknown, fallback = "Not available") => {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return text.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
};

const formatDateTime = (value: unknown) => {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const tone = (value: unknown) => {
  const status = String(value ?? "").toLowerCase();
  if (["healthy", "success", "sent", "paid", "completed", "redeemed"].includes(status)) {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300";
  }
  if (["warning", "pending", "link_created"].includes(status)) {
    return "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300";
  }
  if (["critical", "failure", "failed", "blocked"].includes(status)) {
    return "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300";
  }
  return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";
};

export default function AdminAudit() {
  const toast = useToast();
  const { formatCurrency } = useCurrency();
  const [overview, setOverview] = useState<AuditOverview | null>(null);
  const [tab, setTab] = useState<AuditTab>("financial");
  const [records, setRecords] = useState<any[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadOverview = useCallback(async () => {
    const response = await invokeAdminBackend<AuditOverview>({ action: "get_audit_overview" });
    setOverview(response);
  }, []);

  const loadTab = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      if (tab === "health") {
        const response = await invokeAdminBackend<HealthResponse>({ action: "get_system_health" });
        setHealth(response);
        setTotal(response.checks.length);
        setRecords([]);
      } else {
        const response = await invokeAdminBackend<{ records: any[]; total: number }>({
          action: "list_audit_records",
          section: tab,
          search,
          status,
          page,
          pageSize: PAGE_SIZE,
        });
        setRecords(Array.isArray(response.records) ? response.records : []);
        setTotal(Number.isFinite(Number(response.total)) ? Number(response.total) : 0);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Audit data could not be loaded.", { error });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, search, status, tab, toast]);

  useEffect(() => {
    void loadOverview().catch((error) => {
      toast.error(error instanceof Error ? error.message : "Audit totals could not be loaded.", { error });
    });
  }, [loadOverview, toast]);

  useEffect(() => {
    void loadTab();
  }, [loadTab]);

  const changeTab = (nextTab: AuditTab) => {
    setTab(nextTab);
    setStatus("all");
    setSearchInput("");
    setSearch("");
    setPage(1);
  };

  const filteredHealth = useMemo(() => {
    const query = search.toLowerCase();
    return (health?.checks || []).filter((check) =>
      (status === "all" || check.status === status) &&
      (!query || [check.name, check.status, check.value, check.detail]
        .some((value) => String(value ?? "").toLowerCase().includes(query))));
  }, [health, search, status]);

  if (loading && !overview) return <PageSkeleton variant="table" />;

  const cards = [
    {
      label: "Gross earned",
      value: formatCurrency((overview?.financial.grossCentavos || 0) / 100),
      detail: `${overview?.financial.paidTransactions || 0} paid transactions`,
      icon: CircleDollarSign,
    },
    {
      label: "Processing fees",
      value: formatCurrency((overview?.financial.feeCentavos || 0) / 100),
      detail: "Recorded payment fees",
      icon: Banknote,
    },
    {
      label: "Net earned",
      value: formatCurrency((overview?.financial.netCentavos || 0) / 100),
      detail: "After recorded fees",
      icon: CheckCircle2,
    },
    {
      label: "Needs attention",
      value: String((overview?.financial.failedInvoices || 0) + (overview?.receipts.failed || 0)),
      detail: "Failed invoices and receipts",
      icon: AlertTriangle,
    },
  ];

  const activeRecords = tab === "health" ? filteredHealth : records;

  return (
    <div className="animate-in space-y-6 fade-in duration-300">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-7 w-7 text-violet-600 dark:text-violet-400" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-600 dark:text-violet-400">Auditor only</p>
              <h2 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">Audit center</h2>
            </div>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
            Review all recorded earnings, financial transactions, invoices, receipt delivery, loyalty activity, privileged changes, diagnostics, and system health.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void Promise.all([loadOverview(), loadTab(true)])}
          disabled={refreshing}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh audit
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">{card.label}</p>
              <card.icon className="h-5 w-5 text-gray-400" />
            </div>
            <p className="mt-3 text-2xl font-bold text-gray-900 dark:text-white">{card.value}</p>
            <p className="mt-1 text-xs text-gray-500">{card.detail}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="flex gap-2 overflow-x-auto border-b border-gray-100 p-3 dark:border-gray-800">
          {TAB_OPTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => changeTab(item.id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                tab === item.id
                  ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                  : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 border-b border-gray-100 p-4 dark:border-gray-800 sm:grid-cols-[minmax(0,1fr)_14rem]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={`Search ${TAB_OPTIONS.find((item) => item.id === tab)?.label.toLowerCase()}`}
              className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </label>
          <CustomDropdown
            value={status}
            onChange={(value) => { setStatus(value); setPage(1); }}
            options={STATUS_OPTIONS[tab]}
            ariaLabel={`Filter ${tab} by status`}
          />
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
          </div>
        ) : activeRecords.length ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {tab === "financial" && records.map((record) => (
              <FinancialRow key={record.id} record={record} formatCurrency={formatCurrency} />
            ))}
            {tab === "receipts" && records.map((record) => (
              <ReceiptRow key={record.id} record={record} formatCurrency={formatCurrency} />
            ))}
            {tab === "loyalty" && records.map((record) => (
              <LoyaltyRow key={record.id} record={record} />
            ))}
            {tab === "events" && records.map((record) => (
              <EventRow key={record.id} record={record} />
            ))}
            {tab === "health" && filteredHealth.map((check) => (
              <HealthRow key={check.id} check={check} />
            ))}
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <Database className="mx-auto h-10 w-10 text-gray-300" />
            <h3 className="mt-3 font-bold text-gray-900 dark:text-white">No matching audit records</h3>
            <p className="mt-1 text-sm text-gray-500">Try another search or status filter.</p>
          </div>
        )}

        {tab !== "health" && (
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            totalItems={total}
            onPageChange={setPage}
            itemLabel="records"
          />
        )}
      </div>

      <p className="flex items-center gap-2 text-xs text-gray-500">
        <Clock3 className="h-3.5 w-3.5" />
        Totals and health last refreshed {formatDateTime(tab === "health" ? health?.generatedAt : overview?.generatedAt)}.
      </p>
    </div>
  );
}

function FinancialRow({ record, formatCurrency }: { record: any; formatCurrency: (amount: number) => string }) {
  return (
    <article className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${tone(record.status)}`}>{titleCase(record.status, "Unknown status")}</span>
          <span className="text-xs font-semibold text-gray-500">{titleCase(record.invoice_type || "invoice")}</span>
        </div>
        <p className="mt-2 truncate font-bold text-gray-900 dark:text-white">{record.storeName || record.store_id}</p>
        <p className="mt-1 truncate font-mono text-xs text-gray-500">{record.id}</p>
      </div>
      <div>
        <p className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(Number(record.amount_centavos || 0) / 100)}</p>
        <p className="mt-1 text-xs text-gray-500">
          Gross {formatCurrency(Number(record.gross_amount_centavos ?? record.amount_centavos ?? 0) / 100)}
          {" · "}Fees {formatCurrency(Number(record.fee_centavos || 0) / 100)}
          {" · "}Net {formatCurrency(Number(record.net_amount_centavos ?? record.amount_centavos ?? 0) / 100)}
        </p>
      </div>
      <div className="lg:text-right">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{record.reference || "No payment reference"}</p>
        <p className="mt-1 text-xs text-gray-500">{titleCase(record.payment_method || "Not paid")} · {formatDateTime(record.paid_at || record.created_at)}</p>
      </div>
    </article>
  );
}

function ReceiptRow({ record, formatCurrency }: { record: any; formatCurrency: (amount: number) => string }) {
  return (
    <article className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <ReceiptText className="h-4 w-4 text-gray-400" />
          <p className="font-bold text-gray-900 dark:text-white">{titleCase(record.notification_type, "Notification")}</p>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${tone(record.status)}`}>{titleCase(record.status, "Unknown")}</span>
        </div>
        <p className="mt-2 truncate text-sm text-gray-500">{record.recipient}</p>
      </div>
      <div>
        <p className="font-semibold text-gray-900 dark:text-white">{record.storeName || record.storeId || "Unknown store"}</p>
        <p className="mt-1 text-sm text-gray-500">{formatCurrency(Number(record.amountCentavos || 0) / 100)} · Invoice {titleCase(record.invoiceStatus)}</p>
      </div>
      <div className="lg:text-right">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{titleCase(record.channel, "Unknown channel")} · Attempt {record.attempt_count || 0}</p>
        <p className="mt-1 text-xs text-gray-500">{formatDateTime(record.sent_at || record.created_at)}</p>
        {record.last_error && <p className="mt-1 text-xs text-red-600">{record.last_error}</p>}
      </div>
    </article>
  );
}

function LoyaltyRow({ record }: { record: any }) {
  return (
    <article className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
      <div>
        <div className="flex items-center gap-2">
          <TicketCheck className="h-4 w-4 text-gray-400" />
          <p className="font-bold text-gray-900 dark:text-white">{titleCase(record.type, "Loyalty activity")}</p>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${tone(record.status)}`}>{titleCase(record.status, "Unknown")}</span>
        </div>
        <p className="mt-2 text-sm text-gray-500">{record.storeName || record.storeId || "Unknown store"}</p>
      </div>
      <div className="text-xs text-gray-500">
        <p>Customer <span className="font-mono text-gray-700 dark:text-gray-300">{record.customerId || "Not recorded"}</span></p>
        <p className="mt-1">Staff <span className="font-mono text-gray-700 dark:text-gray-300">{record.staffId || "Not recorded"}</span></p>
      </div>
      <div className="lg:text-right">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{record.amount ? `${record.amount} credited` : "Recorded activity"}</p>
        <p className="mt-1 text-xs text-gray-500">{formatDateTime(record.occurredAt)}</p>
      </div>
    </article>
  );
}

function EventRow({ record }: { record: any }) {
  return (
    <article className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Activity className="h-4 w-4 text-gray-400" />
          <p className="font-bold text-gray-900 dark:text-white">{titleCase(record.action, "Recorded event")}</p>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${tone(record.outcome)}`}>{titleCase(record.outcome, "Unknown")}</span>
        </div>
        <p className="mt-2 text-sm text-gray-500">{titleCase(record.entity_type, "Unknown entity")} · <span className="font-mono">{record.entity_id || "No ID"}</span></p>
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{record.actor_email || "System process"}</p>
        <p className="mt-1 text-xs text-gray-500">{titleCase(record.actor_role || record.source)}</p>
      </div>
      <div className="lg:text-right">
        <p className="text-xs text-gray-500">{formatDateTime(record.created_at)}</p>
        {record.metadata && Object.keys(record.metadata).length > 0 && (
          <p className="mt-1 truncate text-xs text-gray-400" title={JSON.stringify(record.metadata)}>
            {JSON.stringify(record.metadata)}
          </p>
        )}
      </div>
    </article>
  );
}

function HealthRow({ check }: { check: HealthCheck }) {
  const Icon = check.status === "healthy" ? CheckCircle2 : check.status === "warning" ? AlertTriangle : HeartPulse;
  return (
    <article className="grid gap-4 p-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
      <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone(check.status)}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold text-gray-900 dark:text-white">{check.name}</p>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${tone(check.status)}`}>{check.status}</span>
        </div>
        <p className="mt-1 text-sm text-gray-500">{check.detail}</p>
      </div>
      <div className="sm:text-right">
        <p className="font-semibold text-gray-800 dark:text-gray-200">{check.value}</p>
        <p className="mt-1 text-xs text-gray-500">{formatDateTime(check.checkedAt)}</p>
      </div>
    </article>
  );
}
