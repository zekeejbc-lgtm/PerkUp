import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  HeartPulse,
  Loader2,
  RefreshCw,
  Search,
  ServerCog,
} from "lucide-react";
import { CustomDropdown } from "../../components/CustomDropdown";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/ToastProvider";
import { invokeAdminBackend } from "../../lib/adminBackend";

type HealthStatus = "healthy" | "warning" | "critical";
type HealthCheck = {
  id: string;
  name: string;
  status: HealthStatus;
  value: string;
  detail: string;
  checkedAt: string;
};
type HealthResponse = {
  checks: HealthCheck[];
  overall: HealthStatus;
  generatedAt: string;
};

const statusTone = (status: HealthStatus) => {
  if (status === "healthy") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300";
  if (status === "warning") return "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300";
  return "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300";
};

const formatDateTime = (value: string) => new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  dateStyle: "medium",
  timeStyle: "short",
}).format(new Date(value));

export default function AdminSystemHealth() {
  const toast = useToast();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadHealth = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      setHealth(await invokeAdminBackend<HealthResponse>({ action: "get_system_health" }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "System diagnostics could not be loaded.", { error });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  const checks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (health?.checks || []).filter((check) =>
      (status === "all" || check.status === status) &&
      (!query || [check.name, check.status, check.value, check.detail].some((value) =>
        value.toLowerCase().includes(query))));
  }, [health, search, status]);

  if (loading) return <PageSkeleton variant="table" />;

  const counts = (health?.checks || []).reduce((result, check) => {
    result[check.status] += 1;
    return result;
  }, { healthy: 0, warning: 0, critical: 0 });

  return (
    <div className="animate-in space-y-6 fade-in duration-300">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <ServerCog className="h-7 w-7 text-violet-600 dark:text-violet-400" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-600 dark:text-violet-400">Auditor only</p>
              <h2 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">System diagnosis & health</h2>
            </div>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
            Live checks for the database, authentication, subscription billing, GAS email quota and queue, PayMongo webhooks, receipt delivery, and client diagnostics.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadHealth(true)}
          disabled={refreshing}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-gray-200 px-3 text-sm font-semibold leading-none text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          aria-label="Run diagnostics"
          title="Run diagnostics"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Diagnose
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Overall health"
          value={health?.overall || "critical"}
          icon={HeartPulse}
          status={health?.overall || "critical"}
        />
        <SummaryCard label="Healthy checks" value={String(counts.healthy)} icon={CheckCircle2} status="healthy" />
        <SummaryCard label="Warnings" value={String(counts.warning)} icon={AlertTriangle} status="warning" />
        <SummaryCard label="Critical checks" value={String(counts.critical)} icon={Database} status="critical" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="grid gap-3 border-b border-gray-100 p-4 dark:border-gray-800 sm:grid-cols-[minmax(0,1fr)_14rem]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search system, result, status, or diagnostic"
              className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </label>
          <CustomDropdown
            value={status}
            onChange={setStatus}
            ariaLabel="Filter system checks by health"
            options={[
              { label: "All health states", value: "all" },
              { label: "Healthy", value: "healthy" },
              { label: "Warning", value: "warning" },
              { label: "Critical", value: "critical" },
            ]}
          />
        </div>

        {refreshing ? (
          <div className="flex min-h-52 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
          </div>
        ) : checks.length ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {checks.map((check) => {
              const Icon = check.status === "healthy" ? CheckCircle2 : check.status === "warning" ? AlertTriangle : HeartPulse;
              return (
                <article key={check.id} className="grid gap-4 p-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${statusTone(check.status)}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-gray-900 dark:text-white">{check.name}</p>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${statusTone(check.status)}`}>
                        {check.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{check.detail}</p>
                  </div>
                  <div className="sm:text-right">
                    <p className="font-semibold text-gray-800 dark:text-gray-200">{check.value}</p>
                    <p className="mt-1 text-xs text-gray-500">{formatDateTime(check.checkedAt)}</p>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <Database className="mx-auto h-10 w-10 text-gray-300" />
            <h3 className="mt-3 font-bold text-gray-900 dark:text-white">No matching checks</h3>
            <p className="mt-1 text-sm text-gray-500">Try another search or health filter.</p>
          </div>
        )}
      </div>

      {health?.generatedAt && (
        <p className="text-xs text-gray-500">Diagnostic snapshot generated {formatDateTime(health.generatedAt)}.</p>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  status,
}: {
  label: string;
  value: string;
  icon: typeof HeartPulse;
  status: HealthStatus;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <span className={`rounded-xl p-2 ${statusTone(status)}`}><Icon className="h-4 w-4" /></span>
      </div>
      <p className="mt-3 text-2xl font-bold capitalize text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
