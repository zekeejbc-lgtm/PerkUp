import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Database,
  Download,
  FileClock,
  History,
  Loader2,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  TicketCheck,
  UserCog,
  X,
} from "lucide-react";
import { CustomDropdown } from "../../components/CustomDropdown";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { Pagination } from "../../components/Pagination";
import { ScrollableRegion } from "../../components/ScrollableRegion";
import { useToast } from "../../components/ToastProvider";
import { useAuth } from "../../contexts/AuthContext";
import { useCurrency } from "../../contexts/CurrencyContext";
import { invokeAdminBackend } from "../../lib/adminBackend";
import { downloadAuditReportPdf } from "../../lib/auditReportPdf";

type AuditTab = "financial" | "receipts" | "loyalty" | "events";

type LogOverview = {
  total: number;
  last24Hours: number;
  shopChanges: number;
  privilegedChanges: number;
  issues: number;
  generatedAt: string;
};

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
  generatedAt: string;
};

type StoreOption = {
  id: string;
  publicId: string;
  name: string;
};

const PAGE_SIZE = 25;
const EXPORT_PAGE_SIZE = 100;

const TAB_OPTIONS: Array<{ id: AuditTab; label: string; icon: typeof Banknote }> = [
  { id: "events", label: "Activity log", icon: FileClock },
  { id: "financial", label: "Money & transactions", icon: Banknote },
  { id: "receipts", label: "Receipts", icon: ReceiptText },
  { id: "loyalty", label: "Loyalty activity", icon: TicketCheck },
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
};

const SOURCE_OPTIONS = [
  { label: "All sources", value: "all" },
  { label: "Database", value: "database" },
  { label: "Admin actions", value: "admin_backend" },
  { label: "Authentication", value: "auth" },
  { label: "Billing", value: "billing" },
  { label: "System", value: "system" },
];

const ACTOR_OPTIONS = [
  { label: "All actors", value: "all" },
  { label: "Auditors", value: "auditor" },
  { label: "Super admins", value: "admin" },
  { label: "Assistant admins", value: "assistant_admin" },
  { label: "Shop owners", value: "store_owner" },
  { label: "Staff", value: "staff" },
  { label: "Customers", value: "customer" },
  { label: "System processes", value: "system" },
  { label: "Service operations", value: "service_role" },
];

const ENTITY_OPTIONS = [
  { label: "All record types", value: "all" },
  { label: "Shops", value: "stores" },
  { label: "Products", value: "products" },
  { label: "Promotions", value: "promotions" },
  { label: "Shop reviews", value: "store_reviews" },
  { label: "Accounts", value: "users" },
  { label: "Applications", value: "applications" },
  { label: "Loyalty cards", value: "cards" },
  { label: "Invoices", value: "billing_invoices" },
  { label: "Subscriptions", value: "billing_subscriptions" },
  { label: "Runtime settings", value: "system_runtime_config" },
];

const DATE_OPTIONS = [
  { label: "Any time", value: "all" },
  { label: "Last 24 hours", value: "1" },
  { label: "Last 7 days", value: "7" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
];

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

const formatManilaDateKey = (value: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
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
  const { user } = useAuth();
  const { formatCurrency } = useCurrency();
  const isAuditor = user?.role === "auditor";
  const [overview, setOverview] = useState<LogOverview | null>(null);
  const [auditOverview, setAuditOverview] = useState<AuditOverview | null>(null);
  const [tab, setTab] = useState<AuditTab>(() => isAuditor ? "financial" : "events");
  const [records, setRecords] = useState<any[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [actorRole, setActorRole] = useState("all");
  const [entityType, setEntityType] = useState("all");
  const [storeId, setStoreId] = useState("all");
  const [dateRange, setDateRange] = useState("30");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const visibleTabs = useMemo(
    () => isAuditor ? TAB_OPTIONS : TAB_OPTIONS.filter((item) => item.id === "events"),
    [isAuditor],
  );

  const dateFrom = useMemo(() => {
    if (dateRange === "all") return "";
    const date = new Date();
    date.setDate(date.getDate() - Number(dateRange));
    return date.toISOString();
  }, [dateRange]);

  const storeOptions = useMemo(() => [
    { label: "All shops", value: "all" },
    ...stores.map((store) => ({
      label: `${store.name}${store.publicId ? ` · ${store.publicId}` : ""}`,
      value: store.id,
    })),
  ], [stores]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadOverview = useCallback(async () => {
    const activityPromise = invokeAdminBackend<LogOverview>({ action: "get_activity_log_overview" });
    const auditPromise = isAuditor
      ? invokeAdminBackend<AuditOverview>({ action: "get_audit_overview" })
      : Promise.resolve(null);
    const [activity, audit] = await Promise.all([activityPromise, auditPromise]);
    setOverview(activity);
    setAuditOverview(audit);
  }, [isAuditor]);

  const loadStores = useCallback(async () => {
    const response = await invokeAdminBackend<{ stores: StoreOption[] }>({ action: "list_log_stores" });
    setStores(Array.isArray(response.stores) ? response.stores : []);
  }, []);

  const loadTab = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      if (tab === "events") {
        const response = await invokeAdminBackend<{ records: any[]; total: number }>({
          action: "list_activity_logs",
          search,
          outcome: status,
          source,
          actorRole,
          entityType,
          storeId,
          dateFrom,
          page,
          pageSize: PAGE_SIZE,
        });
        setRecords(Array.isArray(response.records) ? response.records : []);
        setTotal(Number.isFinite(Number(response.total)) ? Number(response.total) : 0);
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
      toast.error(error instanceof Error ? error.message : "Logs could not be loaded.", { error });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [actorRole, dateFrom, entityType, page, search, source, status, storeId, tab, toast]);

  useEffect(() => {
    void Promise.all([loadOverview(), loadStores()]).catch((error) => {
      toast.error(error instanceof Error ? error.message : "Log filters could not be loaded.", { error });
    });
  }, [loadOverview, loadStores, toast]);

  useEffect(() => {
    void loadTab();
  }, [loadTab]);

  const changeTab = (nextTab: AuditTab) => {
    setTab(nextTab);
    setStatus("all");
    setSearchInput("");
    setSearch("");
    setPage(1);
    setFiltersOpen(false);
  };

  const resetEventFilters = () => {
    setSearchInput("");
    setSearch("");
    setStatus("all");
    setSource("all");
    setActorRole("all");
    setEntityType("all");
    setStoreId("all");
    setDateRange("30");
    setPage(1);
  };

  const exportVisibleLogs = async () => {
    setExporting(true);
    try {
      const generatedDate = new Date();
      const generatedAt = generatedDate.toISOString();
      const requestExportPage = async (exportPage: number) => {
        if (tab === "events") {
          return invokeAdminBackend<{ records: any[]; total: number }>({
            action: "list_activity_logs",
            search,
            outcome: status,
            source,
            actorRole,
            entityType,
            storeId,
            dateFrom,
            page: exportPage,
            pageSize: EXPORT_PAGE_SIZE,
          });
        }
        return invokeAdminBackend<{ records: any[]; total: number }>({
          action: "list_audit_records",
          section: tab,
          search,
          status,
          page: exportPage,
          pageSize: EXPORT_PAGE_SIZE,
        });
      };
      const firstPage = await requestExportPage(1);
      const exportTotal = Math.max(0, Number(firstPage.total) || 0);
      const remainingPages = Math.max(0, Math.ceil(exportTotal / EXPORT_PAGE_SIZE) - 1);
      const remainingResponses = await Promise.all(
        Array.from({ length: remainingPages }, (_, index) => requestExportPage(index + 2)),
      );
      const exportRecords = [firstPage, ...remainingResponses]
        .flatMap((response) => Array.isArray(response.records) ? response.records : []);
      const money = auditOverview?.financial;
      const reportByTab = {
        financial: {
          title: "Money & Transactions",
          description: "Perk revenue, payment fees, net earnings, and invoice activity. Net earned is revenue after recorded payment fees; operating expenses are not tracked here.",
          summary: [
            { label: "Gross revenue", value: formatCurrency(Number(money?.grossCentavos || 0) / 100) },
            { label: "Payment fees", value: formatCurrency(Number(money?.feeCentavos || 0) / 100) },
            { label: "Net earned / profit", value: formatCurrency(Number(money?.netCentavos || 0) / 100), detail: "After payment fees" },
            { label: "Paid transactions", value: String(money?.paidTransactions || 0) },
            { label: "Outstanding", value: String(money?.outstandingInvoices || 0) },
          ],
          columns: ["Date", "Shop", "Status", "Gross", "Fees", "Net", "Reference"],
          columnWeights: [1.25, 1.45, 0.8, 1, 0.9, 1, 1.35],
          rows: exportRecords.map((record) => [
            formatDateTime(record.paid_at || record.created_at), record.storeName || record.store_id || "Unknown shop",
            titleCase(record.status), formatCurrency(Number(record.gross_amount_centavos ?? record.amount_centavos ?? 0) / 100),
            formatCurrency(Number(record.fee_centavos || 0) / 100), formatCurrency(Number(record.net_amount_centavos ?? record.amount_centavos ?? 0) / 100),
            record.reference || "Not available",
          ]),
        },
        receipts: {
          title: "Receipt Delivery Log", description: "Receipt and billing-notification delivery activity.",
          summary: [
            { label: "Total receipts", value: String(auditOverview?.receipts.total || 0) },
            { label: "Sent", value: String(auditOverview?.receipts.sent || 0) },
            { label: "Failed", value: String(auditOverview?.receipts.failed || 0) },
          ],
          columns: ["Date", "Shop", "Recipient", "Channel", "Status", "Amount"],
          columnWeights: [1.1, 1.3, 1.7, 0.8, 0.8, 1],
          rows: exportRecords.map((record) => [formatDateTime(record.sent_at || record.created_at), record.storeName || record.storeId || "Unknown shop", record.recipient || "Not available", titleCase(record.channel), titleCase(record.status), formatCurrency(Number(record.amountCentavos || 0) / 100)]),
        },
        loyalty: {
          title: "Loyalty Activity", description: "Recorded loyalty credits, redemptions, and scans.", summary: [{ label: "Matching records", value: String(total) }],
          columns: ["Date", "Shop", "Activity", "Status", "Customer", "Staff"],
          columnWeights: [1.1, 1.35, 1.15, 0.8, 1.3, 1.3],
          rows: exportRecords.map((record) => [formatDateTime(record.occurredAt), record.storeName || record.storeId || "Unknown shop", titleCase(record.type), titleCase(record.status), record.customerId || "Not recorded", record.staffId || "Not recorded"]),
        },
        events: {
          title: "Activity Log", description: "Shop, administrator, auditor, account, and system changes recorded by Perk.",
          summary: [
            { label: "Recorded events", value: String(overview?.total || 0) }, { label: "Last 24 hours", value: String(overview?.last24Hours || 0) },
            { label: "Shop changes", value: String(overview?.shopChanges || 0) }, { label: "Privileged changes", value: String(overview?.privilegedChanges || 0) },
            { label: "Needs attention", value: String(overview?.issues || 0) },
          ],
          columns: ["Date", "Action", "Record", "Shop", "Actor", "Outcome", "Source"],
          columnWeights: [1.15, 1.1, 1.55, 1.3, 1.55, 0.75, 0.8],
          rows: exportRecords.map((record) => [formatDateTime(record.created_at), titleCase(record.action), `${titleCase(record.entity_type)} / ${record.entity_id || "No ID"}`, record.store_name || record.metadata?.storeName || "Not shop-specific", record.actor_email || titleCase(record.actor_role, "System process"), titleCase(record.outcome), titleCase(record.source)]),
        },
      }[tab];
      await downloadAuditReportPdf({
        ...reportByTab,
        generatedAt,
        filters: [search && `Search: ${search}`, status !== "all" && `Status: ${titleCase(status)}`, tab === "events" && storeId !== "all" && `Shop: ${storeOptions.find((item) => item.value === storeId)?.label}`, tab === "events" && dateRange !== "all" && `Last ${dateRange} days`].filter(Boolean) as string[],
        filename: `Perk-${tab}-report-${formatManilaDateKey(generatedDate)}.pdf`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The PDF could not be generated.", { error });
    } finally {
      setExporting(false);
    }
  };

  if (loading && !overview) return <PageSkeleton variant="table" />;

  const activityCards = [
    { label: "Recorded events", value: overview?.total || 0, detail: "All retained activity", icon: History },
    { label: "Last 24 hours", value: overview?.last24Hours || 0, detail: "New recorded events", icon: Clock3 },
    { label: "Shop changes", value: overview?.shopChanges || 0, detail: "Shop-linked activity", icon: Store },
    { label: "Privileged changes", value: overview?.privilegedChanges || 0, detail: "Admin and auditor actions", icon: UserCog },
    { label: "Needs attention", value: overview?.issues || 0, detail: "Failed or blocked events", icon: AlertTriangle },
  ];
  const financialCards = [
    { label: "Gross revenue", value: formatCurrency(Number(auditOverview?.financial.grossCentavos || 0) / 100), detail: "All completed payments", icon: Banknote },
    { label: "Payment fees", value: formatCurrency(Number(auditOverview?.financial.feeCentavos || 0) / 100), detail: "Recorded processing costs", icon: ReceiptText },
    { label: "Net earned / profit", value: formatCurrency(Number(auditOverview?.financial.netCentavos || 0) / 100), detail: "Gross less fees; before operating costs", icon: Activity },
    { label: "Paid transactions", value: auditOverview?.financial.paidTransactions || 0, detail: `${auditOverview?.financial.issuedInvoices || 0} invoices issued`, icon: CheckCircle2 },
    { label: "Outstanding", value: auditOverview?.financial.outstandingInvoices || 0, detail: `${auditOverview?.financial.failedInvoices || 0} failed`, icon: Clock3 },
  ];
  const cards = tab === "financial" ? financialCards : activityCards;

  const activeRecords = records;
  const hasCustomEventFilters = status !== "all" || source !== "all" || actorRole !== "all"
    || entityType !== "all" || storeId !== "all" || dateRange !== "30" || Boolean(searchInput);

  return (
    <div className="animate-in space-y-6 fade-in duration-300">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-7 w-7 text-violet-600 dark:text-violet-400" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-600 dark:text-violet-400">
                {isAuditor ? "Full auditor access" : "Administrator view · read only"}
              </p>
              <h2 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">Logs</h2>
            </div>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
            {isAuditor
              ? "Review money earned, payment fees, shop changes, administrator and auditor actions, account changes, billing, loyalty, and system activity from one place."
              : "Review a redacted activity stream for operational awareness. Sensitive metadata, financial views, and exports remain auditor-only."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAuditor && (
            <button
              type="button"
              onClick={() => void exportVisibleLogs()}
              disabled={exporting}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download PDF
            </button>
          )}
          <button
            type="button"
            onClick={() => void Promise.all([loadOverview(), loadTab(true)]).catch((error) => {
              toast.error(error instanceof Error ? error.message : "Logs could not be refreshed.", { error });
            })}
            disabled={refreshing}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            aria-label="Refresh logs"
            title="Refresh logs"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">{card.label}</p>
              <card.icon className="h-5 w-5 text-gray-400" />
            </div>
            <p className="mt-3 text-2xl font-bold text-gray-900 dark:text-white">{typeof card.value === "number" ? card.value.toLocaleString() : card.value}</p>
            <p className="mt-1 text-xs text-gray-500">{card.detail}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {isAuditor && (
          <div className="flex gap-2 overflow-x-auto border-b border-gray-100 p-3 dark:border-gray-800">
            {visibleTabs.map((item) => (
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
        )}

        <div className="border-b border-gray-100 p-4 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setFiltersOpen((value) => !value)}
            className="flex h-11 w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-700 lg:hidden dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            aria-expanded={filtersOpen}
            aria-controls="audit-log-filters"
          >
            <span className="inline-flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" /> Search & filters</span>
            <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${filtersOpen ? "rotate-180" : ""}`} />
          </button>
          <div
            id="audit-log-filters"
            className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out lg:block lg:opacity-100 ${filtersOpen ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 lg:mt-0"}`}
          >
            <div className={`min-h-0 lg:overflow-visible ${filtersOpen ? "overflow-visible" : "overflow-hidden"}`}>
          <div className={`grid gap-3 ${tab === "events" ? "lg:grid-cols-[minmax(16rem,1.5fr)_repeat(3,minmax(10rem,1fr))]" : "sm:grid-cols-[minmax(0,1fr)_14rem]"}`}>
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={tab === "events" ? "Search action, shop, record ID, actor…" : `Search ${visibleTabs.find((item) => item.id === tab)?.label.toLowerCase()}`}
                aria-label="Search logs"
                className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </label>
            <CustomDropdown
              value={status}
              onChange={(value) => { setStatus(value); setPage(1); }}
              options={STATUS_OPTIONS[tab]}
              ariaLabel={`Filter ${tab} by status`}
            />
            {tab === "events" && (
              <>
                <CustomDropdown value={storeId} onChange={(value) => { setStoreId(value); setPage(1); }} options={storeOptions} ariaLabel="Filter logs by shop" />
                <CustomDropdown value={dateRange} onChange={(value) => { setDateRange(value); setPage(1); }} options={DATE_OPTIONS} ariaLabel="Filter logs by date" />
              </>
            )}
          </div>
          {tab === "events" && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CustomDropdown value={source} onChange={(value) => { setSource(value); setPage(1); }} options={SOURCE_OPTIONS} ariaLabel="Filter logs by source" />
              <CustomDropdown value={actorRole} onChange={(value) => { setActorRole(value); setPage(1); }} options={ACTOR_OPTIONS} ariaLabel="Filter logs by actor" />
              <CustomDropdown value={entityType} onChange={(value) => { setEntityType(value); setPage(1); }} options={ENTITY_OPTIONS} ariaLabel="Filter logs by record type" />
              <button
                type="button"
                onClick={resetEventFilters}
                disabled={!hasCustomEventFilters}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <X className="h-4 w-4" />
                Clear filters
              </button>
            </div>
          )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
          </div>
        ) : activeRecords.length ? (
          <ScrollableRegion label={`${tab} log records`} className="divide-y divide-gray-100 dark:divide-gray-800">
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
              <EventRow key={record.id} record={record} isAuditor={isAuditor} />
            ))}
          </ScrollableRegion>
        ) : (
          <div className="px-6 py-16 text-center">
            <Database className="mx-auto h-10 w-10 text-gray-300" />
            <h3 className="mt-3 font-bold text-gray-900 dark:text-white">No matching log records</h3>
            <p className="mt-1 text-sm text-gray-500">Try another search, shop, date range, or status.</p>
          </div>
        )}

        <Pagination page={page} pageSize={PAGE_SIZE} totalItems={total} onPageChange={setPage} itemLabel="records" />
      </div>

      <p className="flex items-center gap-2 text-xs text-gray-500">
        <Clock3 className="h-3.5 w-3.5" />
        Log totals last refreshed {formatDateTime(overview?.generatedAt)}. Times are shown in Philippine time.
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
        <p className="mt-1 truncate font-mono text-xs text-gray-500">{record.public_id || record.id}</p>
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
        {record.public_id && <p className="mt-1 font-mono text-xs text-gray-400">{record.public_id}</p>}
      </div>
      <div>
        <p className="font-semibold text-gray-900 dark:text-white">{record.storeName || record.storeId || "Unknown shop"}</p>
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
        <p className="mt-2 text-sm text-gray-500">{record.storeName || record.storeId || "Unknown shop"}</p>
        {record.public_id && <p className="mt-1 font-mono text-xs text-gray-400">{record.public_id}</p>}
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

function EventRow({ record, isAuditor }: { record: any; isAuditor: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const changedFields = [
    ...(Array.isArray(record.metadata?.changedFields) ? record.metadata.changedFields : []),
    ...(Array.isArray(record.metadata?.dataChangedFields) ? record.metadata.dataChangedFields : []),
  ].filter((field, index, fields) => field !== "data" && fields.indexOf(field) === index);
  const storeName = record.store_name || record.metadata?.storeName || record.metadata?.name;

  return (
    <article className="p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,.85fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Activity className="h-4 w-4 text-gray-400" />
            <p className="font-bold text-gray-900 dark:text-white">{titleCase(record.action, "Recorded event")}</p>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${tone(record.outcome)}`}>{titleCase(record.outcome, "Unknown")}</span>
          </div>
          <p className="mt-2 truncate text-sm text-gray-500">
            {titleCase(record.entity_type, "Unknown record")} · <span className="font-mono">{record.entity_id || "No ID"}</span>
          </p>
          {storeName && (
            <p className="mt-1 truncate text-xs font-semibold text-violet-600 dark:text-violet-400">
              {storeName}{record.store_public_id ? ` · ${record.store_public_id}` : ""}
            </p>
          )}
        </div>
        <div>
          <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-200">
            {record.actor_email || titleCase(record.actor_role, "System process")}
          </p>
          <p className="mt-1 text-xs text-gray-500">{titleCase(record.actor_role || record.source)} · {titleCase(record.source)}</p>
        </div>
        <div className="lg:text-right">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-300">{formatDateTime(record.created_at)}</p>
          {changedFields.length > 0 && <p className="mt-1 text-xs text-gray-400">{changedFields.length} field{changedFields.length === 1 ? "" : "s"} changed</p>}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-gray-200 px-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          aria-expanded={expanded}
        >
          Details
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>
      {expanded && (
        <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/50">
          <dl className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="font-semibold text-gray-500">Event ID</dt><dd className="mt-1 break-all font-mono text-gray-800 dark:text-gray-200">{record.id}</dd></div>
            <div><dt className="font-semibold text-gray-500">Record</dt><dd className="mt-1 break-all font-mono text-gray-800 dark:text-gray-200">{record.entity_id || "Not recorded"}</dd></div>
            <div><dt className="font-semibold text-gray-500">Shop</dt><dd className="mt-1 text-gray-800 dark:text-gray-200">{storeName || "Not shop-specific"}</dd></div>
            <div><dt className="font-semibold text-gray-500">Source</dt><dd className="mt-1 text-gray-800 dark:text-gray-200">{titleCase(record.source)}</dd></div>
          </dl>
          {changedFields.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-500">Changed fields</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {changedFields.map((field) => <span key={field} className="rounded-md bg-white px-2 py-1 font-mono text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300">{field}</span>)}
              </div>
            </div>
          )}
          {isAuditor && Object.keys(record.metadata || {}).length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-500">Auditor metadata</p>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-gray-900 p-3 text-xs text-gray-100">{JSON.stringify(record.metadata, null, 2)}</pre>
            </div>
          )}
          {!isAuditor && (
            <p className="mt-4 text-xs text-gray-500">Sensitive actor details and raw metadata are available only to the Auditor.</p>
          )}
        </div>
      )}
    </article>
  );
}
