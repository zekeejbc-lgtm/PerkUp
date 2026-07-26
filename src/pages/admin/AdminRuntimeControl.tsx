import { FormEvent, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, FlaskConical, Loader2, LockKeyhole, RadioTower, ShieldCheck, Wrench } from "lucide-react";
import { useToast } from "../../components/ToastProvider";
import { useRuntimeMode, RuntimeMode } from "../../contexts/RuntimeModeContext";
import { invokeAdminBackend } from "../../lib/adminBackend";

const INITIATE_PHRASE = "INITIATE MAINTENANCE MODE";
const INPUT_CLASSES = "min-h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-950 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-white";

export default function AdminRuntimeControl() {
  const toast = useToast();
  const { config, refreshRuntimeMode } = useRuntimeMode();
  const [workingMode, setWorkingMode] = useState<RuntimeMode | "">("");
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
    if (!window.confirm(`Switch PerkUp to ${mode === "production" ? "Production" : "Development"} Mode?`)) return;
    setWorkingMode(mode);
    try {
      await invokeAdminBackend({ action: "set_runtime_mode", mode });
      await refreshRuntimeMode();
      toast.success(`${mode === "production" ? "Production" : "Development"} Mode is active.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Runtime mode could not be changed.", { error, reportable: false });
    } finally {
      setWorkingMode("");
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
      description: "Replaces every page with the maintenance screen and blocks direct database access plus user-facing backend operations.",
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
                  onClick={() => setShowMaintenance(true)}
                  disabled={active}
                  className="mt-5 min-h-11 w-full rounded-xl bg-amber-500 px-4 text-sm font-bold text-gray-950 transition hover:bg-amber-400 disabled:cursor-default disabled:opacity-50"
                >
                  Configure maintenance
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void setRuntimeMode(card.mode)}
                  disabled={active || Boolean(workingMode)}
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
        Maintenance mode is fail-closed. Existing sessions, copied URLs, direct API requests, and alternate routes cannot read or change application data until an Auditor ends maintenance from the recovery form.
      </div>

      {showMaintenance && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
          <form onSubmit={initiateMaintenance} className="my-auto w-full max-w-xl rounded-[2rem] bg-white p-6 shadow-2xl dark:bg-gray-900 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-950 dark:text-white">Initiate maintenance mode</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">These details will be shown on the public maintenance screen.</p>
              </div>
              <button type="button" onClick={() => setShowMaintenance(false)} className="rounded-xl px-3 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">Close</button>
            </div>
            <div className="mt-6 space-y-4">
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
                Type <span className="font-mono">{INITIATE_PHRASE}</span>
                <input required autoComplete="off" value={form.confirmation} onChange={(event) => setForm({ ...form, confirmation: event.target.value })} className={`mt-1.5 font-mono ${INPUT_CLASSES}`} />
              </label>
            </div>
            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setShowMaintenance(false)} className="min-h-11 rounded-xl border border-gray-200 px-5 text-sm font-bold text-gray-700 dark:border-gray-700 dark:text-gray-200">Cancel</button>
              <button type="submit" disabled={workingMode === "maintenance" || form.confirmation !== INITIATE_PHRASE} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-bold text-gray-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50">
                {workingMode === "maintenance" && <Loader2 className="h-4 w-4 animate-spin" />}
                Initiate maintenance mode
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
