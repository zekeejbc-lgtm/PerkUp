import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  Clock3,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import { CustomDropdown } from "../../components/CustomDropdown";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { Pagination } from "../../components/Pagination";
import { PasswordVisibilityButton } from "../../components/PasswordVisibilityButton";
import { useToast } from "../../components/ToastProvider";
import { invokeAdminBackend } from "../../lib/adminBackend";
import { getDisplayImageUrl } from "../../lib/imageStorage";
import {
  generateStrongPassword,
  sanitizePasswordInput,
  validateStrongPassword,
} from "../../lib/passwordStrength";

type ManagedRole =
  | "customer"
  | "staff"
  | "store_owner"
  | "admin"
  | "assistant_admin"
  | "auditor";
type AccountStatus = "active" | "suspended" | "banned";

type ManagedAccount = {
  id: string;
  email: string;
  name: string;
  phone: string;
  avatarUrl: string;
  role: ManagedRole;
  accountStatus: AccountStatus;
  accountStatusReason: string;
  storeId: string;
  storeName: string;
  lastAccessedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  isPermanentAuditor: boolean;
};

type AssignmentStore = {
  id: string;
  name: string;
  ownerId: string;
  status: string;
  isPrimaryBranch: boolean;
  parentStoreId: string;
};

type AccountResponse = {
  accounts: ManagedAccount[];
  page: number;
  pageSize: number;
  total: number;
  summary: Record<string, number>;
};

type AccountForm = {
  name: string;
  email: string;
  phone: string;
  role: ManagedRole;
  accountStatus: AccountStatus;
  accountStatusReason: string;
  storeId: string;
  password: string;
};

const PAGE_SIZE = 25;
const INPUT_CLASSES =
  "min-h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-white";
const EMPTY_FORM: AccountForm = {
  name: "",
  email: "",
  phone: "",
  role: "customer",
  accountStatus: "active",
  accountStatusReason: "",
  storeId: "",
  password: "",
};

const ROLE_OPTIONS = [
  { label: "Customer", value: "customer" },
  { label: "Staff", value: "staff" },
  { label: "Store owner", value: "store_owner" },
  { label: "Administrator", value: "admin" },
  { label: "Assistant administrator", value: "assistant_admin" },
  { label: "Auditor", value: "auditor" },
];

const STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Suspended", value: "suspended" },
  { label: "Banned", value: "banned" },
];

const titleCase = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());

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

const statusClasses = (status: AccountStatus) => {
  if (status === "active") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300";
  if (status === "suspended") return "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300";
  return "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300";
};

export default function AdminAccounts() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [stores, setStores] = useState<AssignmentStore[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [storeFilter, setStoreFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ManagedAccount | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<ManagedAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [roleFilter, statusFilter, storeFilter]);

  const loadStores = useCallback(async () => {
    const response = await invokeAdminBackend<{ stores: AssignmentStore[] }>({
      action: "list_account_stores",
    });
    setStores(response.stores);
  }, []);

  const loadAccounts = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await invokeAdminBackend<AccountResponse>({
        action: "list_accounts",
        page,
        pageSize: PAGE_SIZE,
        search,
        role: roleFilter,
        status: statusFilter,
        storeId: storeFilter,
      });
      setAccounts(response.accounts);
      setSummary(response.summary || {});
      setTotal(response.total);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Accounts could not be loaded.", { error });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, roleFilter, search, statusFilter, storeFilter, toast]);

  useEffect(() => {
    void Promise.all([loadAccounts(), loadStores()]).catch((error) => {
      toast.error(error instanceof Error ? error.message : "Account management could not be loaded.", { error });
      setLoading(false);
    });
  }, [loadAccounts, loadStores, toast]);

  const storeOptions = useMemo(() => [
    { label: "Select a store", value: "" },
    ...stores.map((store) => ({
      label: `${store.name}${store.isPrimaryBranch ? " · Primary" : ""}`,
      value: store.id,
    })),
  ], [stores]);

  const openCreate = () => {
    setEditingAccount(null);
    setForm({ ...EMPTY_FORM, password: generateStrongPassword() });
    setShowPassword(false);
    setShowForm(true);
  };

  const openEdit = (account: ManagedAccount) => {
    setEditingAccount(account);
    setForm({
      name: account.name,
      email: account.email,
      phone: account.phone,
      role: account.role,
      accountStatus: account.accountStatus,
      accountStatusReason: account.accountStatusReason,
      storeId: account.storeId,
      password: "",
    });
    setShowPassword(false);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingAccount(null);
    setForm(EMPTY_FORM);
  };

  const saveAccount = async (event: FormEvent) => {
    event.preventDefault();
    const needsStore = form.role === "staff" || form.role === "store_owner";
    if (needsStore && !form.storeId) {
      toast.error("Select the store assigned to this account.");
      return;
    }
    if (!editingAccount && !validateStrongPassword(form.password, form).valid) {
      toast.error("Use the generated password or enter another strong 12+ character password.");
      return;
    }

    setSaving(true);
    try {
      if (editingAccount) {
        await invokeAdminBackend({
          action: "update_account",
          userId: editingAccount.id,
          name: form.name,
          email: form.email,
          phone: form.phone,
          role: form.role,
          accountStatus: form.accountStatus,
          accountStatusReason: form.accountStatusReason,
          storeId: needsStore ? form.storeId : "",
        });
        toast.success("Account updated.");
      } else {
        await invokeAdminBackend({
          action: "create_account",
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          storeId: needsStore ? form.storeId : "",
          forcePasswordReset: true,
        });
        toast.success(`${titleCase(form.role)} account created.`);
      }
      closeForm();
      await loadAccounts(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The account could not be saved.", { error });
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async () => {
    if (!accountToDelete) return;
    setDeleting(true);
    try {
      await invokeAdminBackend({ action: "delete_user", userId: accountToDelete.id });
      toast.success("Account deleted.");
      setAccountToDelete(null);
      await loadAccounts(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The account could not be deleted.", { error });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <PageSkeleton variant="table" />;

  const summaryCards = [
    { label: "All accounts", value: summary.total || 0, icon: Users },
    { label: "Customers", value: summary.customer || 0, icon: UserRound },
    { label: "Store teams", value: (summary.staff || 0) + (summary.store_owner || 0), icon: Store },
    { label: "Restricted", value: (summary.suspended || 0) + (summary.banned || 0), icon: Ban },
  ];

  return (
    <div className="animate-in space-y-6 fade-in duration-300">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-gray-500" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Account management</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
            Create, review, update, reassign, suspend, ban, restore, and delete customer, staff, store-owner, administrator, and auditor accounts.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadAccounts(true)}
            disabled={refreshing}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-black dark:bg-white dark:text-gray-900"
          >
            <Plus className="h-4 w-4" />
            Add account
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
        <div className="grid gap-3 border-b border-gray-100 p-4 dark:border-gray-800 lg:grid-cols-[minmax(15rem,1fr)_12rem_12rem_14rem]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search name, email, phone, role, or store"
              className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </label>
          <CustomDropdown
            value={roleFilter}
            onChange={setRoleFilter}
            ariaLabel="Filter accounts by role"
            options={[{ label: "All roles", value: "all" }, ...ROLE_OPTIONS]}
          />
          <CustomDropdown
            value={statusFilter}
            onChange={setStatusFilter}
            ariaLabel="Filter accounts by status"
            options={[{ label: "All statuses", value: "all" }, ...STATUS_OPTIONS]}
          />
          <CustomDropdown
            value={storeFilter}
            onChange={setStoreFilter}
            ariaLabel="Filter accounts by store"
            options={[{ label: "All stores", value: "all" }, ...stores.map((store) => ({ label: store.name, value: store.id }))]}
          />
        </div>

        {accounts.length ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {accounts.map((account) => (
              <article
                key={account.id}
                className="grid gap-4 p-4 transition-colors hover:bg-gray-50/70 dark:hover:bg-gray-800/30 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] xl:items-center"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-sm font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {account.avatarUrl
                      ? <img src={getDisplayImageUrl(account.avatarUrl)} alt="" className="h-full w-full object-cover" />
                      : account.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-bold text-gray-900 dark:text-white">{account.name}</p>
                      {account.isPermanentAuditor && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                          <ShieldCheck className="h-3 w-3" />
                          Permanent
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm text-gray-500">{account.email}</p>
                    <p className="truncate text-xs text-gray-400">{account.phone || "No number provided"}</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{titleCase(account.role)}</p>
                  <p className="mt-1 truncate text-xs text-gray-500">{account.storeName || "Not assigned to a store"}</p>
                </div>

                <div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClasses(account.accountStatus)}`}>
                    {account.accountStatus}
                  </span>
                  <p className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                    <Clock3 className="h-3.5 w-3.5" />
                    Last accessed {formatDateTime(account.lastAccessedAt)}
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(account)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountToDelete(account)}
                    disabled={account.isPermanentAuditor}
                    title={account.isPermanentAuditor ? "The permanent auditor cannot be deleted." : "Delete account"}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-35 dark:border-red-900/60 dark:hover:bg-red-950/30"
                    aria-label={`Delete ${account.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <Users className="mx-auto h-10 w-10 text-gray-300" />
            <h3 className="mt-3 font-bold text-gray-900 dark:text-white">No matching accounts</h3>
            <p className="mt-1 text-sm text-gray-500">Try another search or clear one of the filters.</p>
          </div>
        )}
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={total}
          onPageChange={setPage}
          itemLabel="accounts"
        />
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={saveAccount}
            className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900 sm:p-8"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-500">
                {editingAccount ? "Update access" : "New account"}
              </p>
              <h3 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {editingAccount ? editingAccount.name : "Create an account"}
              </h3>
              {editingAccount?.isPermanentAuditor && (
                <p className="mt-3 rounded-xl bg-violet-50 p-3 text-sm text-violet-700 dark:bg-violet-950/30 dark:text-violet-300">
                  This is the permanent auditor. Its email, role, and active status are protected by the backend and database.
                </p>
              )}
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field label="Name">
                <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={INPUT_CLASSES} />
              </Field>
              <Field label="Email">
                <input required type="email" readOnly={editingAccount?.isPermanentAuditor} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className={`${INPUT_CLASSES} read-only:cursor-not-allowed read-only:opacity-60`} />
              </Field>
              <Field label="Phone / number">
                <input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className={INPUT_CLASSES} />
              </Field>
              <Field label="Role">
                <CustomDropdown
                  value={form.role}
                  onChange={(value) => setForm({ ...form, role: value as ManagedRole, storeId: ["staff", "store_owner"].includes(value) ? form.storeId : "" })}
                  options={ROLE_OPTIONS}
                  disabled={editingAccount?.isPermanentAuditor}
                />
              </Field>
              {(form.role === "staff" || form.role === "store_owner") && (
                <Field label={form.role === "staff" ? "Assigned store" : "Owned store"}>
                  <CustomDropdown value={form.storeId} onChange={(value) => setForm({ ...form, storeId: value })} options={storeOptions} />
                </Field>
              )}
              {editingAccount && (
                <Field label="Account status">
                  <CustomDropdown
                    value={form.accountStatus}
                    onChange={(value) => setForm({ ...form, accountStatus: value as AccountStatus })}
                    options={STATUS_OPTIONS}
                    disabled={editingAccount.isPermanentAuditor}
                  />
                </Field>
              )}
              {editingAccount && form.accountStatus !== "active" && (
                <Field label="Restriction reason" className="sm:col-span-2">
                  <textarea
                    required
                    maxLength={500}
                    rows={3}
                    value={form.accountStatusReason}
                    onChange={(event) => setForm({ ...form, accountStatusReason: event.target.value })}
                    placeholder="Explain why access is restricted."
                    className={`${INPUT_CLASSES} resize-none`}
                  />
                </Field>
              )}
              {!editingAccount && (
                <Field label="Temporary password" className="sm:col-span-2">
                  <div className="relative">
                    <input
                      required
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={(event) => setForm({ ...form, password: sanitizePasswordInput(event.target.value) })}
                      className={`${INPUT_CLASSES} pr-12`}
                    />
                    <PasswordVisibilityButton visible={showPassword} onToggle={() => setShowPassword((value) => !value)} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                    <span>The user must replace this password on first login.</span>
                    <button type="button" onClick={() => setForm({ ...form, password: generateStrongPassword() })} className="font-semibold text-gray-900 underline dark:text-white">
                      Generate another
                    </button>
                  </div>
                </Field>
              )}
            </div>

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeForm} disabled={saving} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold dark:border-gray-700">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingAccount ? "Save account" : "Create account"}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmationModal
        isOpen={Boolean(accountToDelete)}
        title="Delete this account?"
        description={`${accountToDelete?.name || "This account"} will lose access permanently. Store owners must be unassigned from all stores first.`}
        confirmLabel="Delete account"
        isLoading={deleting}
        onClose={() => !deleting && setAccountToDelete(null)}
        onConfirm={deleteAccount}
      />
    </div>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`space-y-2 ${className}`}>
      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</span>
      {children}
    </label>
  );
}
