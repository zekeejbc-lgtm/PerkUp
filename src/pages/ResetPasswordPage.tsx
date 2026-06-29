import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { ThemeToggle } from "../components/ThemeToggle";
import { getPasswordStrength } from "../lib/passwordStrength";
import { initialRecoveryCallbackDetected, supabase } from "../lib/supabase";

type RecoveryStatus = "checking" | "ready" | "invalid" | "success";

function hasRecoveryParameters() {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  return search.get("type") === "recovery"
    || hash.get("type") === "recovery"
    || search.has("code")
    || hash.has("access_token");
}

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<RecoveryStatus>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);

  useEffect(() => {
    let active = true;
    const arrivedFromRecoveryLink = initialRecoveryCallbackDetected || hasRecoveryParameters();
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const urlError = search.get("error_description") || hash.get("error_description");

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && event === "PASSWORD_RECOVERY" && session) {
        setStatus("ready");
        setError("");
      }
    });

    const validateRecoverySession = async () => {
      if (urlError) {
        setError(urlError);
        setStatus("invalid");
        return;
      }

      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;

      if (sessionError) {
        setError(sessionError.message);
        setStatus("invalid");
      } else if (arrivedFromRecoveryLink && data.session) {
        setStatus("ready");
      } else {
        setStatus("invalid");
      }
    };

    void validateRecoverySession();

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setSubmitting(false);
      return;
    }

    await supabase.auth.signOut({ scope: "local" });
    window.history.replaceState({}, document.title, "/reset-password");
    setPassword("");
    setConfirmPassword("");
    setSubmitting(false);
    setStatus("success");
  };

  const goToSignIn = () => {
    navigate("/", { replace: true, state: { authRequired: true } });
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-50 px-4 py-24 text-gray-900 dark:bg-[#0d0d0d] dark:text-white">
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-5 sm:p-8">
        <BrandMark />
        <ThemeToggle />
      </div>
      <div className="pointer-events-none absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-gray-200/70 blur-3xl dark:bg-white/5" />

      <section className="relative w-full max-w-md rounded-[2rem] border border-gray-200 bg-white p-6 shadow-xl shadow-black/5 sm:p-8 dark:border-white/10 dark:bg-[#171717] dark:shadow-black/30">
        {status === "checking" && (
          <div className="flex min-h-64 flex-col items-center justify-center text-center">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-gray-500" />
            <h1 className="text-xl font-bold">Verifying your reset link</h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">This should only take a moment.</p>
          </div>
        )}

        {status === "invalid" && (
          <div className="py-4 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400">
              <AlertCircle className="h-7 w-7" />
            </span>
            <h1 className="mt-5 text-2xl font-bold tracking-tight">Reset link unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
              {error || "This password reset link is invalid, expired, or has already been used. Request a new link to continue."}
            </p>
            <button type="button" onClick={goToSignIn} className="mt-6 w-full rounded-xl bg-gray-900 px-4 py-3 font-medium text-white transition-colors hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100">
              Back to sign in
            </button>
          </div>
        )}

        {status === "success" && (
          <div className="py-4 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400">
              <CheckCircle2 className="h-7 w-7" />
            </span>
            <h1 className="mt-5 text-2xl font-bold tracking-tight">Password updated</h1>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">Your password has been changed. Sign in with your new password.</p>
            <button type="button" onClick={goToSignIn} className="mt-6 w-full rounded-xl bg-gray-900 px-4 py-3 font-medium text-white transition-colors hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100">
              Continue to sign in
            </button>
          </div>
        )}

        {status === "ready" && (
          <>
            <div className="text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-900 dark:bg-white/10 dark:text-white">
                <ShieldCheck className="h-7 w-7" />
              </span>
              <h1 className="mt-5 text-2xl font-bold tracking-tight">Create a new password</h1>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Your email link has been verified. Choose a new password for your account.</p>
            </div>

            {error && <div className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">{error}</div>}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <PasswordField
                id="new-password"
                label="New password"
                value={password}
                onChange={setPassword}
                visible={showPassword}
                onToggle={() => setShowPassword((current) => !current)}
                placeholder="At least 8 characters"
              />

              {password && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-gray-500 dark:text-gray-400">Password strength</span>
                    <span>{passwordStrength.label}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                    <div className={`h-full rounded-full transition-all ${passwordStrength.tone}`} style={{ width: `${passwordStrength.percent}%` }} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {passwordStrength.checks.map((check) => (
                      <span key={check.label} className={`rounded-full px-2 py-1 text-[11px] font-medium ${check.met ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
                        {check.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <PasswordField
                id="confirm-password"
                label="Confirm new password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                visible={showConfirmPassword}
                onToggle={() => setShowConfirmPassword((current) => !current)}
                placeholder="Enter the password again"
              />

              <button type="submit" disabled={submitting || !password || !confirmPassword} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 font-medium text-white transition-colors hover:bg-black disabled:pointer-events-none disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? "Updating password..." : "Update password"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  visible,
  onToggle,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  placeholder: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-semibold">{label}</label>
      <div className="relative mt-1">
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
          className="block w-full rounded-xl border-0 bg-gray-50 py-3 pl-10 pr-11 text-sm ring-1 ring-inset ring-gray-200 focus:ring-2 focus:ring-gray-900 dark:bg-gray-800 dark:ring-gray-700 dark:focus:ring-white"
          placeholder={placeholder}
        />
        <button type="button" onClick={onToggle} aria-label={visible ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}
