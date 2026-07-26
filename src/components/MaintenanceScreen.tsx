import { FormEvent, useState } from "react";
import { AlertTriangle, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, LogIn, Wrench } from "lucide-react";
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
  const [showAdminSignIn, setShowAdminSignIn] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const startedAt = formatStartedAt(config.maintenanceStartedAt);

  const signInDuringMaintenance = async (event: FormEvent) => {
    event.preventDefault();
    setAdminError("");
    setAdminSubmitting(true);
    try {
      await supabase.auth.signOut({ scope: "local" });
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: adminEmail.trim().toLowerCase(),
        password: adminPassword,
      });
      if (signInError) throw signInError;
      if (!signInData.user) throw new Error("Sign-in did not return an authenticated account.");

      const { data: profileRow, error: profileError } = await supabase
        .from("users")
        .select("data")
        .eq("id", signInData.user.id)
        .maybeSingle();
      if (profileError) throw profileError;

      const profile = (profileRow?.data || {}) as {
        role?: string;
        isDemo?: boolean;
        accountStatus?: string;
      };
      const hasAccess =
        profile.isDemo !== true &&
        !["suspended", "banned"].includes(profile.accountStatus || "active") &&
        ["admin", "assistant_admin", "auditor"].includes(profile.role || "");
      if (!hasAccess) {
        await supabase.auth.signOut({ scope: "local" });
        throw new Error("Maintenance access is limited to active Auditor and administrator accounts.");
      }

      window.location.assign("/admin?tab=runtime");
    } catch (signInError) {
      setAdminError(signInError instanceof Error ? signInError.message : "Administrator sign-in failed.");
    } finally {
      setAdminSubmitting(false);
    }
  };

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

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              setShowAdminSignIn((current) => !current);
              setShowRecovery(false);
              setAdminError("");
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            <LogIn className="h-4 w-4" />
            Admin or Auditor sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setShowRecovery((current) => !current);
              setShowAdminSignIn(false);
              setError("");
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            <KeyRound className="h-4 w-4" />
            End maintenance
          </button>
        </div>

        {showAdminSignIn && (
          <form onSubmit={signInDuringMaintenance} className="mx-auto mt-6 max-w-md space-y-4 rounded-2xl border border-gray-200 bg-white p-5 text-left dark:border-gray-700 dark:bg-[#181818]">
            <div>
              <h2 className="font-bold">Maintenance access</h2>
              <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                Active Auditor and administrator accounts can continue to the admin dashboard. Other accounts remain locked out.
              </p>
            </div>
            <label className="block text-xs font-semibold">
              Email
              <input
                required
                type="email"
                autoComplete="username"
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm outline-none focus:ring-2 focus:ring-gray-950 dark:border-gray-700 dark:bg-gray-800 dark:focus:ring-white"
              />
            </label>
            <label className="block text-xs font-semibold">
              Password
              <span className="relative mt-1.5 block">
                <LockKeyhole className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <input
                  required
                  type={showAdminPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  className="min-h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-11 text-sm outline-none focus:ring-2 focus:ring-gray-950 dark:border-gray-700 dark:bg-gray-800 dark:focus:ring-white"
                />
                <button type="button" onClick={() => setShowAdminPassword((current) => !current)} className="absolute right-3 top-3 text-gray-400" aria-label={showAdminPassword ? "Hide password" : "Show password"}>
                  {showAdminPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </span>
            </label>
            {adminError && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{adminError}</p>}
            <button
              type="submit"
              disabled={adminSubmitting}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-950"
            >
              {adminSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Continue to admin dashboard
            </button>
          </form>
        )}

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
