import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  applyPwaUpdate,
  hasPwaUpdate,
  pwaEvents,
} from "../lib/pwa";

export function PwaPrompts() {
  const [updateReady, setUpdateReady] = useState(hasPwaUpdate);

  useEffect(() => {
    const handleUpdate = () => setUpdateReady(hasPwaUpdate());
    window.addEventListener(pwaEvents.update, handleUpdate);
    return () => {
      window.removeEventListener(pwaEvents.update, handleUpdate);
    };
  }, []);

  if (!updateReady) return null;

  return (
    <aside
      className="fixed inset-x-4 bottom-4 z-[100] mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-black/10 bg-white p-4 text-[#1b1b1b] shadow-xl dark:border-white/10 dark:bg-[#242424] dark:text-white"
      aria-live="polite"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-white/10">
        <RefreshCw className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">Perk update ready</p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Update when you have finished any active scan or form.
        </p>
      </div>
      <button
        type="button"
        onClick={applyPwaUpdate}
        className="rounded-full bg-[#1b1b1b] px-4 py-2 text-xs font-bold text-white dark:bg-white dark:text-[#1b1b1b]"
      >
        Update
      </button>
    </aside>
  );
}
