import { FormEvent, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, FlaskConical, Loader2, LockKeyhole, RadioTower, ShieldCheck, Wrench, X } from "lucide-react";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import { useToast } from "../../components/ToastProvider";
import { useRuntimeMode, RuntimeMode } from "../../contexts/RuntimeModeContext";
import { invokeAdminBackend } from "../../lib/adminBackend";

const INITIATE_PHRASE = "INITIATE MAINTENANCE MODE";
const END_PHRASE = "END MAINTENANCE MODE";
const INPUT_CLASSES = "min-h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-950 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-white";

export default function AdminRuntimeControl() {
  const toast = useToast();
  const { config, refreshRuntimeMode } = useRuntimeMode();
  const [workingMode, setWorkingMode] = useState<RuntimeMode | "">("");
  const [pendingMode, setPendingMode] = useState<"production" | "development" | null>(null);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    title: "Scheduled maintenance",
    reason: "",
    details: "",
    password: "",
    confirmation: "",
  });

  const setRuntimeMode = async (mode: "production" | "development") => {
    if (mode === config.mode) return;
    setWorkingMode(mode);
    try {
      await invokeAdminBackend({ action: "set_runtime_mode", mode });
      await refreshRuntimeMode();
      toast.success(`${mode === "production" ? "Production" : "Development"} Mode is active.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Runtime mode could not be changed.", { error, reportable: false });
    } finally {
      setWorkingMode("");
      setPendingMode(null);
    }
  };

  const initiateMaintenance = async (event: FormEvent) => {
    event.preventDefault();
    if (form.confirmation !== INITIATE_PHRASE) {
      toast.error(`Type ${INITIATE_PHRASE} exactly.`, { reportable: false });
      return;
    }
    setWorkingMode("maintenance");
    try {
      await invokeAdminBackend({
        action: "initiate_maintenance_mode",
        title: form.title,
        reason: form.reason,
        details: form.details,
        password: form.password,
        confirmation: form.confirmation,
      });
      await refreshRuntimeMode();
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Maintenance mode could not be initiated.", { error, reportable: false });
      setWorkingMode("");
    }
  };

  const endMaintenance = async (event: FormEvent) => {
    event.preventDefault();
    if (form.confirmation !== END_PHRASE) {
      toast.error(`Type ${END_PHRASE} exactly.`, { reportable: false });
      return;
    }
    setWorkingMode("maintenance");
    try {
      await invokeAdminBackend({
        action: "end_maintenance_mode",
        password: form.password,
        confirmation: form.confirmation,
      });
      await refreshRuntimeMode();
      toast.success("Maintenance ended. Production Mode is active.");
      setShowMaintenance(false);
      setForm({
        title: "Scheduled maintenance",
        reason: "",
        details: "",
        password: "",
        confirmation: "",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Maintenance mode could not be ended.", { error, reportable: false });
    } finally {
      setWorkingMode("");
    }
  };

  const cards = [
    {
      mode: "production" as const,
      label: "Production Mode",
      icon: ShieldCheck,
      description: "Normal customer operations. Demo launch buttons are hidden and production queries exclude all demo tenants, accounts, stores, and assets.",
      tone: "emerald",
    },
    {
      mode: "development" as const,
      label: "Development Mode",
      icon: FlaskConical,
      description: "Shows one-click demo role buttons on sign-in. Only active, time-bounded sandbox records are used; production records remain separate.",
      tone: "blue",
    },
    {
      mode: "maintenance" as const,
      label: "Maintenance Mode",
      icon: Wrench,
      description: "Locks public and tenant access while active, non-demo Auditors and administrators retain secured dashboard access for operations and recovery.",
      tone: "amber",
    },
  ];

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-3">
          <RadioTower className="h-7 w-7" />
          <h1 className="text-2xl font-bold tracking-tight text-gray-950 dark:text-white">Runtime Modes</h1>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
          Auditor-only controls for production visibility, isolated demo access, and the system-wide maintenance lock.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {cards.map((card) => {
          const active = config.mode === card.mode;
          return (
            <article key={card.mode} className={`rounded-3xl border p-5 ${active ? "border-gray-950 bg-gray-50 ring-1 ring-gray-950 dark:border-white dark:bg-white/5 dark:ring-white" : "border-gray-200 dark:border-gray-700"}`}>
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-950 text-white dark:bg-white dark:text-gray-950">
                  <card.icon className="h-5 w-5" />
                </span>
                {active && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Active</span>}
              </div>
              <h2 className="mt-5 font-bold text-gray-950 dark:text-white">{card.label}</h2>
              <p className="mt-2 min-h-24 text-sm leading-6 text-gray-500 dark:text-gray-400">{card.description}</p>
              {card.mode === "maintenance" ? (
                <button
                  type="button"
                  onClick={() => {
                    setForm((current) => ({ ...current, password: "", confirmation: "" }));
                    setShowMaintenance(true);
                  }}
                  disabled={Boolean(workingMode)}
                  className="mt-5 min-h-11 w-full rounded-xl bg-amber-500 px-4 text-sm font-bold text-gray-950 transition hover:bg-amber-400 disabled:cursor-default disabled:opacity-50"
                >
                  {active ? "End maintenance" : "Configure maintenance"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setPendingMode(card.mode)}
                  disabled={active || config.mode === "maintenance" || Boolean(workingMode)}
                  className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 text-sm font-bold text-white transition hover:bg-black disabled:cursor-default disabled:opacity-50 dark:bg-white dark:text-gray-950"
                >
                  {workingMode === card.mode && <Loader2 className="h-4 w-4 animate-spin" />}
                  Switch to {card.label}
                </button>
              )}
            </article>
          );
        })}
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        Maintenance mode is fail-closed for public and tenant accounts. Their existing sessions, copied URLs, direct API requests, and alternate routes cannot read or change application data until an Auditor ends maintenance.
      </div>

      {showMaintenance && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={config.mode === "maintenance" ? endMaintenance : initiateMaintenance}
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl dark:bg-gray-900"
            role="dialog"
            aria-modal="true"
            aria-labelledby="maintenance-modal-title"
          >
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-200 px-6 py-5 dark:border-gray-800 sm:px-8">
              <h2 id="maintenance-modal-title" className="text-xl font-bold text-gray-950 dark:text-white">
                {config.mode === "maintenance" ? "End maintenance mode" : "Initiate maintenance mode"}
              </h2>
              <button
                type="button"
                onClick={() => setShowMaintenance(false)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-500 transition hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Close maintenance modal"
              >
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6 sm:px-8">
              <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
                {config.mode === "maintenance"
                  ? "Authenticate the recovery action to restore normal production access."
                  : "These details will be shown on the public maintenance screen."}
              </p>
              <div className="space-y-4">
              {config.mode !== "maintenance" && (
                <>
              <label className="block text-xs font-semibold text-gray-800 dark:text-gray-200">
                Screen title
                <input required minLength={1} maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={`mt-1.5 ${INPUT_CLASSES}`} />
              </label>
              <label className="block text-xs font-semibold text-gray-800 dark:text-gray-200">
                Reason
                <textarea required minLength={1} maxLength={2000} rows={3} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} className={`mt-1.5 ${INPUT_CLASSES}`} placeholder="Why PerkUp is temporarily unavailable" />
              </label>
              <label className="block text-xs font-semibold text-gray-800 dark:text-gray-200">
                Additional details
                <textarea maxLength={4000} rows={3} value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} className={`mt-1.5 ${INPUT_CLASSES}`} placeholder="Expected completion, affected services, or support information" />
              </label>
                </>
              )}
              <label className="block text-xs font-semibold text-gray-800 dark:text-gray-200">
                Your Auditor password
                <span className="relative mt-1.5 block">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input required type={showPassword ? "text" : "password"} autoComplete="current-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className={`${INPUT_CLASSES} pl-10 pr-11`} />
                  <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-3 top-3 text-gray-400" aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </span>
              </label>
              <label className="block text-xs font-semibold text-gray-800 dark:text-gray-200">
                Type <span className="font-mono">{config.mode === "maintenance" ? END_PHRASE : INITIATE_PHRASE}</span>
                <input required autoComplete="off" value={form.confirmation} onChange={(event) => setForm({ ...form, confirmation: event.target.value })} className={`mt-1.5 font-mono ${INPUT_CLASSES}`} />
              </label>
              </div>
            </div>
            <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-gray-200 px-6 py-5 dark:border-gray-800 sm:flex-row sm:justify-end sm:px-8">
              <button
                type="submit"
                disabled={
                  workingMode === "maintenance" ||
                  form.confirmation !== (config.mode === "maintenance" ? END_PHRASE : INITIATE_PHRASE)
                }
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-bold text-gray-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {workingMode === "maintenance" && <Loader2 className="h-4 w-4 animate-spin" />}
                {config.mode === "maintenance" ? "End maintenance mode" : "Initiate maintenance mode"}
              </button>
            </footer>
          </form>
        </div>
      )}

      <ConfirmationModal
        isOpen={pendingMode !== null}
        title={`Switch to ${pendingMode === "production" ? "Production" : "Development"} Mode?`}
        description={
          pendingMode === "production"
            ? "Demo launch controls will be hidden and production data isolation rules will take effect."
            : "One-click demo role controls will be enabled while production records remain isolated."
        }
        confirmLabel={`Switch to ${pendingMode === "production" ? "Production" : "Development"}`}
        isLoading={pendingMode !== null && workingMode === pendingMode}
        tone="default"
        onConfirm={() => pendingMode && setRuntimeMode(pendingMode)}
        onClose={() => setPendingMode(null)}
      />
    </div>
  );
}
