import { useRef, useState } from "react";
import { AlertTriangle, Wrench } from "lucide-react";
import { AuthModal } from "./AuthModal";
import { BrandMark } from "./BrandMark";
import { useRuntimeMode } from "../contexts/RuntimeModeContext";

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
  const { config, statusUnavailable } = useRuntimeMode();
  const logoPressCount = useRef(0);
  const [showAdminSignIn, setShowAdminSignIn] = useState(false);
  const startedAt = formatStartedAt(config.maintenanceStartedAt);

  const handleLogoPress = () => {
    logoPressCount.current += 1;
    if (logoPressCount.current < 10) return;

    logoPressCount.current = 0;
    setShowAdminSignIn(true);
  };

  return (
    <>
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f7f7f5] px-4 py-12 text-gray-950 dark:bg-[#151515] dark:text-white">
        <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_20%_10%,rgba(0,0,0,0.07),transparent_28%),radial-gradient(circle_at_80%_90%,rgba(0,0,0,0.05),transparent_25%)] dark:opacity-30" />
        <section className="relative w-full max-w-2xl rounded-[2rem] border border-black/10 bg-white/90 p-7 text-center shadow-2xl shadow-black/10 backdrop-blur sm:p-12 dark:border-white/10 dark:bg-[#1d1d1d]/95">
          <button
            type="button"
            onClick={handleLogoPress}
            aria-label="PerkUp"
            className="inline-flex appearance-none border-0 bg-transparent p-0"
          >
            <BrandMark className="justify-center" />
          </button>
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
        </section>
      </main>
      <AuthModal
        isOpen={showAdminSignIn}
        onClose={() => setShowAdminSignIn(false)}
        initialMode="signin"
        allowedSignInRoles={["auditor", "admin"]}
      />
    </>
  );
}
