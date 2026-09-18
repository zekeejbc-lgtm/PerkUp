import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Ban,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  FlaskConical,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Store,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { CustomDropdown } from "../../components/CustomDropdown";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { Pagination } from "../../components/Pagination";
import { ScrollableRegion } from "../../components/ScrollableRegion";
import { useToast } from "../../components/ToastProvider";
import { invokeAdminBackend } from "../../lib/adminBackend";

type DemoStatus = "active" | "deactivated" | "expired";

type DemoAccount = {
  id: string;
  role: "customer" | "staff" | "store_owner" | "admin";
  email: string;
  name: string;
  status: DemoStatus;
  lastAccessedAt: string | null;
  createdAt: string;
};

type DemoTenant = {
  id: string;
  publicId: string;
  name: string;
  slug: string;
  status: DemoStatus;
  storeId: string;
  expiresAt: string;
  deactivatedAt: string | null;
  createdAt: string;
  accounts: DemoAccount[];
};

type DemoCredential = {
  userId: string;
  role: DemoAccount["role"];
  name: string;
  email: string;
  password: string;
};

type DemoListResponse = {
  tenants: DemoTenant[];
  total: number;
  summary: {
    total: number;
    active: number;
    deactivated: number;
    expired: number;
    accounts: number;
  };
};

const PAGE_SIZE = 10;
const INPUT_CLASSES =
  "min-h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-white";

const formatDateTime = (value: string | null) => {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const roleLabel = (role: string) =>
  role.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());

const statusClasses = (status: DemoStatus) => {
  if (status === "active") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300";
  if (status === "expired") return "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300";
  return "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
};

const remainingLabel = (expiresAt: string) => {
  const remaining = Date.parse(expiresAt) - Date.now();
  if (remaining <= 0) return "Expired";
  const hours = Math.ceil(remaining / 3_600_000);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} remaining`;
  const days = Math.ceil(hours / 24);
  return `${days} days remaining`;
};

export default function AdminDemoManagement() {
  const toast = useToast();
  const [tenants, setTenants] = useState<DemoTenant[]>([]);
  const [summary, setSummary] = useState<DemoListResponse["summary"]>({
    total: 0,
    active: 0,
    deactivated: 0,
    expired: 0,
    accounts: 0,
  });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [expiry, setExpiry] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    duration: "24",
    unit: "hours",
    staffCount: "1",
    includeCustomer: true,
    includeAdmin: false,
  });
  const [credentials, setCredentials] = useState<DemoCredential[]>([]);
  const [credentialTitle, setCredentialTitle] = useState("");
  const [copied, setCopied] = useState("");
  const [workingKey, setWorkingKey] = useState("");
  const [deactivateTenant, setDeactivateTenant] = useState<DemoTenant | null>(null);
  const [renewTenant, setRenewTenant] = useState<DemoTenant | null>(null);
  const [renewDuration, setRenewDuration] = useState("24");
  const [addStaffTenant, setAddStaffTenant] = useState<DemoTenant | null>(null);
  const [addStaffCount, setAddStaffCount] = useState("1");
  const [collapsedTenants, setCollapsedTenants] = useState<Set<string>>(() => new Set());

  const toggleTenant = (tenantId: string) => {
    setCollapsedTenants((current) => {
      const next = new Set(current);
      if (next.has(tenantId)) {
        next.delete(tenantId);
      } else {
        next.add(tenantId);
      }
      return next;
    });
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const loadTenants = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const response = await invokeAdminBackend<DemoListResponse>({
        action: "list_demo_tenants",
        search,
        status,
        expiry,
        page,
        pageSize: PAGE_SIZE,
      });
      setTenants(response.tenants);
      setTotal(response.total);
      setSummary(response.summary);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Demo sandboxes could not be loaded.", { error });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [expiry, page, search, status, toast]);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  const createSandbox = async (event: FormEvent) => {
    event.preventDefault();
    const duration = Number(createForm.duration);
    const durationHours = createForm.unit === "days" ? duration * 24 : duration;
    setCreating(true);
    try {
      const response = await invokeAdminBackend<{ credentials: DemoCredential[] }>({
        action: "create_demo_tenant",
        name: createForm.name,
        durationHours,
        staffCount: Number(createForm.staffCount),
        includeCustomer: createForm.includeCustomer,
        includeAdmin: createForm.includeAdmin,
      });
      setCredentials(response.credentials);
      setCredentialTitle(`${createForm.name} credentials`);
      setShowCreate(false);
      setCreateForm({ name: "", duration: "24", unit: "hours", staffCount: "1", includeCustomer: true, includeAdmin: false });
      toast.success("Isolated demo sandbox created.");
      await loadTenants(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The demo sandbox could not be created.", { error });
    } finally {
      setCreating(false);
    }
  };

  const deactivate = async (tenant: DemoTenant) => {
    setWorkingKey(`deactivate:${tenant.id}`);
    try {
      await invokeAdminBackend({ action: "deactivate_demo_tenant", tenantId: tenant.id });
      toast.success("Demo sandbox deactivated.");
      await loadTenants(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The sandbox could not be deactivated.", { error });
    } finally {
      setWorkingKey("");
      setDeactivateTenant(null);
    }
  };

  const reactivate = async (event: FormEvent) => {
    event.preventDefault();
    if (!renewTenant) return;
    setWorkingKey(`reactivate:${renewTenant.id}`);
    try {
      await invokeAdminBackend({
        action: "reactivate_demo_tenant",
        tenantId: renewTenant.id,
        durationHours: Number(renewDuration),
      });
      toast.success("Demo sandbox reactivated.");
      setRenewTenant(null);
      await loadTenants(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The sandbox could not be reactivated.", { error });
    } finally {
      setWorkingKey("");
    }
  };

  const addStaff = async (event: FormEvent) => {
    event.preventDefault();
    if (!addStaffTenant) return;
    setWorkingKey(`staff:${addStaffTenant.id}`);
    try {
      const response = await invokeAdminBackend<{ credentials: DemoCredential[] }>({
        action: "add_demo_staff",
        tenantId: addStaffTenant.id,
        count: Number(addStaffCount),
      });
      setCredentials(response.credentials);
      setCredentialTitle(`New ${addStaffTenant.name} staff credentials`);
      setAddStaffTenant(null);
      setAddStaffCount("1");
      toast.success("Demo staff account created.");
      await loadTenants(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Demo staff could not be added.", { error });
    } finally {
      setWorkingKey("");
    }
  };

  const resetPassword = async (tenant: DemoTenant, account: DemoAccount) => {
    setWorkingKey(`password:${account.id}`);
    try {
      const response = await invokeAdminBackend<{ credentials: DemoCredential[] }>({
        action: "reset_demo_password",
        userId: account.id,
      });
      setCredentials(response.credentials);
      setCredentialTitle(`${tenant.name} password reset`);
      toast.success("A new demo password was generated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The demo password could not be reset.", { error });
    } finally {
      setWorkingKey("");
    }
  };

  const copyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      toast.info("Clipboard access was unavailable. Select and copy the value manually.", { title: "Copy manually" });
    }
  };

  const copyAllCredentials = async () => {
    const text = credentials.map((credential) =>
      `${roleLabel(credential.role)}\nName: ${credential.name}\nEmail: ${credential.email}\nPassword: ${credential.password}`
    ).join("\n\n");
    await copyText("all", text);
  };

  if (loading) return <PageSkeleton variant="table" />;

  const summaryCards = [
    { label: "All sandboxes", value: summary.total, icon: FlaskConical },
    { label: "Active", value: summary.active, icon: ShieldCheck },
    { label: "Demo accounts", value: summary.accounts, icon: Users },
    { label: "Inactive", value: summary.deactivated + summary.expired, icon: Ban },
  ];

  return (
    <div className="animate-in space-y-6 fade-in duration-300">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <FlaskConical className="h-6 w-6 text-violet-500" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Demo management</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
            Create disposable store sandboxes with isolated owner, staff, and optional customer accounts. Demo records stay out of the public directory, production account management, billing, and live-customer activity.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void loadTenants(true)}
            disabled={refreshing}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            aria-label="Refresh sandboxes"
            title="Refresh sandboxes"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-gray-900 px-3 text-sm font-semibold leading-none text-white hover:bg-black dark:bg-white dark:text-gray-900"
            aria-label="New sandbox"
            title="New sandbox"
          >
            <Plus className="h-4 w-4" />
            New
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between text-gray-500">
              <p className="text-sm font-medium">{card.label}</p>
              <card.icon className="h-5 w-5" />
            </div>
            <p className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">{card.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="grid gap-3 border-b border-gray-100 p-4 dark:border-gray-800 lg:grid-cols-[minmax(16rem,1fr)_13rem_13rem]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search sandbox, email, role, or store ID"
              className={`${INPUT_CLASSES} pl-10`}
            />
          </label>
          <CustomDropdown
            value={status}
            onChange={(value) => { setStatus(value); setPage(1); }}
            ariaLabel="Filter demo sandboxes by status"
            options={[
              { label: "All statuses", value: "all" },
              { label: "Active", value: "active" },
              { label: "Deactivated", value: "deactivated" },
              { label: "Expired", value: "expired" },
            ]}
          />
          <CustomDropdown
            value={expiry}
            onChange={(value) => { setExpiry(value); setPage(1); }}
            ariaLabel="Filter demo sandboxes by expiry"
            options={[
              { label: "Any expiration", value: "all" },
              { label: "Expires in 24 hours", value: "24h" },
              { label: "Expires in 7 days", value: "7d" },
            ]}
          />
        </div>

        {tenants.length ? (
          <ScrollableRegion label="Demo sandboxes" className="divide-y divide-gray-100 dark:divide-gray-800">
            {tenants.map((tenant) => {
              const isCollapsed = collapsedTenants.has(tenant.id);
              const accountsId = `demo-accounts-${tenant.id}`;

              return (
              <article key={tenant.id} className="p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">{tenant.name}</h3>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClasses(tenant.status)}`}>
                        {tenant.status}
                      </span>
                      <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                        Isolated
                      </span>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                      <Store className="h-4 w-4" />
                      <span className="truncate font-mono text-xs">{tenant.publicId || tenant.storeId}</span>
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                      <Clock3 className="h-4 w-4" />
                      {tenant.status === "active" ? remainingLabel(tenant.expiresAt) : roleLabel(tenant.status)} · {formatDateTime(tenant.expiresAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => toggleTenant(tenant.id)}
                      aria-expanded={!isCollapsed}
                      aria-controls={accountsId}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 dark:focus-visible:ring-gray-500"
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform duration-300 ease-out motion-reduce:transition-none ${isCollapsed ? "-rotate-90" : "rotate-0"}`}
                      />
                      {isCollapsed ? "Expand" : "Collapse"}
                    </button>
                    {tenant.status === "active" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setAddStaffTenant(tenant)}
                          disabled={Boolean(workingKey)}
                          className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 px-3 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
                        >
                          <UserPlus className="h-4 w-4" />
                          Add staff
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeactivateTenant(tenant)}
                          disabled={Boolean(workingKey)}
                          className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-200 px-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:hover:bg-red-950/30"
                        >
                          {workingKey === `deactivate:${tenant.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                          Deactivate
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setRenewTenant(tenant); setRenewDuration("24"); }}
                        disabled={Boolean(workingKey)}
                        className="inline-flex h-10 items-center gap-2 rounded-xl bg-gray-900 px-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-900"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Reactivate
                      </button>
                    )}
                  </div>
                </div>

                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
                    isCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
                  }`}
                >
                  <div
                    id={accountsId}
                    aria-hidden={isCollapsed}
                    inert={isCollapsed}
                    className="overflow-hidden"
                  >
                    <div className="grid gap-3 pt-4 lg:grid-cols-2">
                      {tenant.accounts.map((account) => (
                        <div key={account.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-800/40">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{account.name}</p>
                              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500 dark:bg-gray-900">
                                {roleLabel(account.role)}
                              </span>
                            </div>
                            <p className="truncate text-xs text-gray-500">{account.email}</p>
                            <p className="mt-1 text-[11px] text-gray-400">Last accessed {formatDateTime(account.lastAccessedAt)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void resetPassword(tenant, account)}
                            disabled={tenant.status !== "active" || Boolean(workingKey)}
                            title="Generate a new password"
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-35 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
                          >
                            {workingKey === `password:${account.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
              );
            })}
          </ScrollableRegion>
        ) : (
          <div className="px-6 py-16 text-center">
            <FlaskConical className="mx-auto h-10 w-10 text-gray-300" />
            <h3 className="mt-3 font-bold text-gray-900 dark:text-white">No matching demo sandboxes</h3>
            <p className="mt-1 text-sm text-gray-500">Create one or change the search and filters.</p>
          </div>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} totalItems={total} onPageChange={setPage} itemLabel="sandboxes" />
      </div>

      {showCreate && (
        <Modal title="Create demo sandbox" onClose={() => !creating && setShowCreate(false)}>
          <form onSubmit={createSandbox} className="space-y-5">
            <p className="text-sm leading-6 text-gray-500">
              Credentials are generated securely and shown once. This sandbox cannot appear in production store discovery or modify live customer loyalty data.
            </p>
            <Field label="Sandbox name">
              <input required minLength={2} maxLength={120} value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} placeholder="July QA test" className={INPUT_CLASSES} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Access duration">
                <input required type="number" min={1} max={createForm.unit === "days" ? 90 : 2160} value={createForm.duration} onChange={(event) => setCreateForm({ ...createForm, duration: event.target.value })} className={INPUT_CLASSES} />
              </Field>
              <Field label="Duration unit">
                <CustomDropdown value={createForm.unit} onChange={(unit) => setCreateForm({ ...createForm, unit })} options={[{ label: "Hours", value: "hours" }, { label: "Days", value: "days" }]} />
              </Field>
              <Field label="Staff accounts">
                <input required type="number" min={1} max={10} value={createForm.staffCount} onChange={(event) => setCreateForm({ ...createForm, staffCount: event.target.value })} className={INPUT_CLASSES} />
              </Field>
              <label className="flex min-h-11 items-center gap-3 self-end rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-800">
                <input type="checkbox" checked={createForm.includeCustomer} onChange={(event) => setCreateForm({ ...createForm, includeCustomer: event.target.checked })} className="h-4 w-4 rounded" />
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Include test customer</span>
              </label>
              <label className="flex min-h-11 items-center gap-3 self-end rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-800 sm:col-span-2">
                <input type="checkbox" checked={createForm.includeAdmin} onChange={(event) => setCreateForm({ ...createForm, includeAdmin: event.target.checked })} className="h-4 w-4 rounded" />
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Include a read-only demo administrator</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowCreate(false)} disabled={creating} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold dark:border-gray-700">Cancel</button>
              <button type="submit" disabled={creating} className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900">
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Create sandbox
              </button>
            </div>
          </form>
        </Modal>
      )}

      {renewTenant && (
        <Modal title={`Reactivate ${renewTenant.name}`} onClose={() => !workingKey && setRenewTenant(null)}>
          <form onSubmit={reactivate} className="space-y-5">
            <p className="text-sm leading-6 text-gray-500">All existing demo accounts will be unblocked and their expiration will be replaced with the new duration.</p>
            <Field label="New duration in hours">
              <input required type="number" min={1} max={2160} value={renewDuration} onChange={(event) => setRenewDuration(event.target.value)} className={INPUT_CLASSES} />
            </Field>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setRenewTenant(null)} disabled={Boolean(workingKey)} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold dark:border-gray-700">Cancel</button>
              <button type="submit" disabled={Boolean(workingKey)} className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900">
                {Boolean(workingKey) && <Loader2 className="h-4 w-4 animate-spin" />}
                Reactivate
              </button>
            </div>
          </form>
        </Modal>
      )}

      {addStaffTenant && (
        <Modal title={`Add staff to ${addStaffTenant.name}`} onClose={() => !workingKey && setAddStaffTenant(null)}>
          <form onSubmit={addStaff} className="space-y-5">
            <p className="text-sm leading-6 text-gray-500">New staff inherit this sandbox’s existing expiration time. Their generated credentials will be shown once.</p>
            <Field label="Number of staff accounts">
              <input required type="number" min={1} max={10} value={addStaffCount} onChange={(event) => setAddStaffCount(event.target.value)} className={INPUT_CLASSES} />
            </Field>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setAddStaffTenant(null)} disabled={Boolean(workingKey)} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold dark:border-gray-700">Cancel</button>
              <button type="submit" disabled={Boolean(workingKey)} className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900">
                {Boolean(workingKey) && <Loader2 className="h-4 w-4 animate-spin" />}
                Add staff
              </button>
            </div>
          </form>
        </Modal>
      )}

      {credentials.length > 0 && (
        <Modal title={credentialTitle} onClose={() => setCredentials([])}>
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              Save these credentials now. Passwords are not stored in readable form and will not be shown again.
            </div>
            <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
              {credentials.map((credential) => (
                <div key={credential.userId} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">{credential.name}</p>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{roleLabel(credential.role)}</p>
                    </div>
                    <button type="button" onClick={() => void copyText(credential.userId, `${credential.email}\n${credential.password}`)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-gray-200 px-3 text-xs font-semibold dark:border-gray-700">
                      {copied === credential.userId ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                      Copy
                    </button>
                  </div>
                  <label className="block text-xs text-gray-500">Email</label>
                  <input readOnly value={credential.email} className={`${INPUT_CLASSES} mt-1 font-mono text-xs`} />
                  <label className="mt-3 block text-xs text-gray-500">Password</label>
                  <input readOnly value={credential.password} className={`${INPUT_CLASSES} mt-1 font-mono text-xs`} />
                </div>
              ))}
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setCredentials([])} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold dark:border-gray-700">Done</button>
              <button type="button" onClick={() => void copyAllCredentials()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-gray-900">
                {copied === "all" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                Copy all credentials
              </button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmationModal
        isOpen={deactivateTenant !== null}
        title={`Deactivate ${deactivateTenant?.name || "demo sandbox"}?`}
        description="All demo accounts in this sandbox will be blocked immediately. You can reactivate the sandbox later with a new access duration."
        confirmLabel="Deactivate sandbox"
        isLoading={deactivateTenant !== null && workingKey === `deactivate:${deactivateTenant.id}`}
        onConfirm={() => deactivateTenant && deactivate(deactivateTenant)}
        onClose={() => setDeactivateTenant(null)}
      />
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900 sm:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-500">Auditor only</p>
            <h3 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</span>
      {children}
    </label>
  );
}
