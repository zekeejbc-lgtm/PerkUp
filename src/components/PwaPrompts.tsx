import { useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import {
  applyPwaUpdate,
  canInstallPwa,
  hasPwaUpdate,
  pwaEvents,
  showPwaInstallPrompt,
} from "../lib/pwa";

export function PwaPrompts() {
  const [updateReady, setUpdateReady] = useState(hasPwaUpdate);
  const [installReady, setInstallReady] = useState(canInstallPwa);
  const [dismissedInstall, setDismissedInstall] = useState(false);

  useEffect(() => {
    const handleUpdate = () => setUpdateReady(hasPwaUpdate());
    const handleInstall = () => setInstallReady(canInstallPwa());
    window.addEventListener(pwaEvents.update, handleUpdate);
    window.addEventListener(pwaEvents.install, handleInstall);
    return () => {
      window.removeEventListener(pwaEvents.update, handleUpdate);
      window.removeEventListener(pwaEvents.install, handleInstall);
    };
  }, []);

  if (!updateReady && (!installReady || dismissedInstall)) return null;

  const updating = updateReady;
  return (
    <aside
      className="fixed inset-x-4 bottom-4 z-[100] mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-black/10 bg-white p-4 text-[#1b1b1b] shadow-xl dark:border-white/10 dark:bg-[#242424] dark:text-white"
      aria-live="polite"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-white/10">
        {updating ? <RefreshCw className="h-5 w-5" /> : <Download className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{updating ? "PerkUp update ready" : "Install PerkUp"}</p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          {updating ? "Update when you have finished any active scan or form." : "Open PerkUp quickly from your home screen."}
        </p>
      </div>
      <button
        type="button"
        onClick={() => updating ? applyPwaUpdate() : void showPwaInstallPrompt()}
        className="rounded-full bg-[#1b1b1b] px-4 py-2 text-xs font-bold text-white dark:bg-white dark:text-[#1b1b1b]"
      >
        {updating ? "Update" : "Install"}
      </button>
      {!updating && (
        <button type="button" onClick={() => setDismissedInstall(true)} aria-label="Dismiss install prompt" className="rounded-full p-1.5 hover:bg-gray-100 dark:hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
      )}
    </aside>
  );
}
