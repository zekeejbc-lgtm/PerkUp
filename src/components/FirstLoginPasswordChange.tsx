import { FormEvent, useMemo, useState } from "react";
import { AlertTriangle, KeyRound, Loader2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { validateStrongPassword } from "../lib/passwordStrength";
import { invokeAdminBackend } from "../lib/adminBackend";

export function FirstLoginPasswordChange() {
  const { user, refreshUser } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const validation = useMemo(
    () => validateStrongPassword(password, { name: user?.name, email: user?.email }),
    [password, user?.name, user?.email],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!validation.valid) return setError("Your new password must meet every requirement.");
    if (password !== confirmation) return setError("The passwords do not match.");
    setSubmitting(true);
    try {
      await invokeAdminBackend<{ updated: boolean }>({
        action: "complete_first_login_password_change",
        password,
      });
      await refreshUser();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "Password change failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10 dark:bg-[#1b1b1b]">
      <form onSubmit={submit} className="w-full max-w-lg space-y-5 rounded-[2rem] border border-gray-200 bg-white p-7 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#1b1b1b] text-white dark:bg-white dark:text-[#1b1b1b]">
            <KeyRound className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Create your private password</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Your administrator required you to replace the temporary password before continuing.</p>
          </div>
        </div>
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />{error}
          </div>
        )}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-900 dark:text-white">New password</label>
          <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
        </div>
        <div className="grid gap-1 sm:grid-cols-2">
          {validation.requirements.map((requirement) => (
            <span key={requirement.label} className={`text-xs ${requirement.met ? "text-green-700 dark:text-green-400" : "text-gray-500"}`}>
              {requirement.met ? "✓" : "○"} {requirement.label}
            </span>
          ))}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-900 dark:text-white">Confirm new password</label>
          <input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
        </div>
        <button type="submit" disabled={submitting || !validation.valid || password !== confirmation} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1b1b1b] px-5 py-3 font-semibold text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-[#1b1b1b]">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Change password and continue
        </button>
      </form>
    </main>
  );
}
