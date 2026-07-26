import { FormEvent, useState } from "react";
import { AlertTriangle, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, Wrench } from "lucide-react";
import { BrandMark } from "./BrandMark";
import { useRuntimeMode } from "../contexts/RuntimeModeContext";
import { supabase } from "../lib/supabase";
import { invokeAdminBackend } from "../lib/adminBackend";

const END_PHRASE = "END MAINTENANCE MODE";

const formatStartedAt = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
};

export function MaintenanceScreen() {
  const { config, statusUnavailable, refreshRuntimeMode } = useRuntimeMode();
  const [showRecovery, setShowRecovery] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const startedAt = formatStartedAt(config.maintenanceStartedAt);

  const endMaintenance = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (confirmation !== END_PHRASE) {
      setError(`Type ${END_PHRASE} exactly.`);
      return;
    }
    setSubmitting(true);
    try {
      await supabase.auth.signOut({ scope: "local" });
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInError) throw signInError;
      await invokeAdminBackend({
        action: "end_maintenance_mode",
        password,
        confirmation,
      });
      const next = await refreshRuntimeMode();
      if (next.mode === "maintenance") throw new Error("Maintenance mode is still active.");
      window.location.assign("/admin?tab=runtime");
    } catch (recoveryError) {
      setError(recoveryError instanceof Error ? recoveryError.message : "Maintenance mode could not be ended.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f7f7f5] px-4 py-12 text-gray-950 dark:bg-[#151515] dark:text-white">
      <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_20%_10%,rgba(0,0,0,0.07),transparent_28%),radial-gradient(circle_at_80%_90%,rgba(0,0,0,0.05),transparent_25%)] dark:opacity-30" />
      <section className="relative w-full max-w-2xl rounded-[2rem] border border-black/10 bg-white/90 p-7 text-center shadow-2xl shadow-black/10 backdrop-blur sm:p-12 dark:border-white/10 dark:bg-[#1d1d1d]/95">
        <BrandMark className="justify-center" />
        <div className="mx-auto mt-9 flex h-20 w-20 items-center justify-center rounded-3xl bg-gray-950 text-white shadow-lg dark:bg-white dark:text-gray-950">
          <Wrench className="h-9 w-9" aria-hidden="true" />
        </div>
        <p className="mt-7 text-xs font-bold uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">
          Maintenance mode
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{config.maintenanceTitle}</h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-gray-600 dark:text-gray-300">
          {config.maintenanceReason}
        </p>
        {config.maintenanceDetails && (
          <div className="mx-auto mt-6 max-w-xl whitespace-pre-wrap rounded-2xl border border-gray-200 bg-gray-50 p-4 text-left text-sm leading-6 text-gray-600 dark:border-gray-700 dark:bg-black/20 dark:text-gray-300">
            {config.maintenanceDetails}
          </div>
        )}
        {startedAt && <p className="mt-5 text-xs text-gray-500 dark:text-gray-400">Started {startedAt} (Philippine time)</p>}
        {statusUnavailable && (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            Runtime status could not be verified, so PerkUp has locked access as a safety precaution.
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setShowRecovery((current) => !current);
            setError("");
          }}
          className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
        >
          <KeyRound className="h-4 w-4" />
          Auditor recovery
        </button>

        {showRecovery && (
          <form onSubmit={endMaintenance} className="mx-auto mt-6 max-w-md space-y-4 rounded-2xl border border-gray-200 bg-white p-5 text-left dark:border-gray-700 dark:bg-[#181818]">
            <div>
              <h2 className="font-bold">End maintenance mode</h2>
              <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                Only an Auditor can end maintenance. This does not bypass the lock; it returns the entire system to Production Mode.
              </p>
            </div>
            <label className="block text-xs font-semibold">
              Auditor email
              <input
                required
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm outline-none focus:ring-2 focus:ring-gray-950 dark:border-gray-700 dark:bg-gray-800 dark:focus:ring-white"
              />
            </label>
            <label className="block text-xs font-semibold">
              Password
              <span className="relative mt-1.5 block">
                <LockKeyhole className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="min-h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-11 text-sm outline-none focus:ring-2 focus:ring-gray-950 dark:border-gray-700 dark:bg-gray-800 dark:focus:ring-white"
                />
                <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-3 top-3 text-gray-400" aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </span>
            </label>
            <label className="block text-xs font-semibold">
              Type <span className="font-mono">{END_PHRASE}</span>
              <input
                required
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                className="mt-1.5 min-h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 font-mono text-sm outline-none focus:ring-2 focus:ring-gray-950 dark:border-gray-700 dark:bg-gray-800 dark:focus:ring-white"
              />
            </label>
            {error && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={submitting || confirmation !== END_PHRASE}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-950"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              End maintenance and return to production
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
