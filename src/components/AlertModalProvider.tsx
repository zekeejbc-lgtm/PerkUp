import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Info, X } from "lucide-react";

interface AlertItem {
  id: number;
  message: string;
}

/**
 * Replaces the browser's blocking window.alert dialog with an accessible,
 * app-styled modal. Keeping the window.alert API here also covers alerts from
 * lazy-loaded routes and prevents individual pages from drifting in style.
 */
export function AlertModalProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const nextId = useRef(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const dismissCurrent = useCallback(() => {
    setAlerts((current) => current.slice(1));
  }, []);

  useEffect(() => {
    const nativeAlert = window.alert;

    window.alert = (message?: unknown) => {
      const text = String(message ?? "");
      setAlerts((current) => [...current, { id: ++nextId.current, message: text }]);
    };

    return () => {
      window.alert = nativeAlert;
    };
  }, []);

  const currentAlert = alerts[0];

  useEffect(() => {
    if (!currentAlert) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissCurrent();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [currentAlert, dismissCurrent]);

  return (
    <>
      {children}
      {currentAlert && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) dismissCurrent();
          }}
        >
          <section
            aria-describedby="app-alert-message"
            aria-labelledby="app-alert-title"
            aria-modal="true"
            className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-950"
            role="alertdialog"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-[#1b1b1b] dark:bg-white/10 dark:text-white">
                <Info className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <h2 id="app-alert-title" className="text-lg font-bold text-gray-950 dark:text-white">
                    PerkUp notification
                  </h2>
                  <button
                    type="button"
                    onClick={dismissCurrent}
                    className="-mr-2 -mt-2 rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200"
                    aria-label="Close notification"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                <p
                  id="app-alert-message"
                  className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-gray-600 dark:text-gray-300"
                >
                  {currentAlert.message}
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                ref={closeButtonRef}
                type="button"
                onClick={dismissCurrent}
                className="min-w-28 rounded-xl bg-[#1b1b1b] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 dark:bg-white dark:text-[#1b1b1b] dark:hover:bg-gray-200 dark:focus:ring-offset-gray-950"
              >
                Got it
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
