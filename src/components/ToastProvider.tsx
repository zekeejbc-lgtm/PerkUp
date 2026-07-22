import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, LoaderCircle, Send, X } from "lucide-react";
import { createErrorCode, submitErrorReport } from "../lib/errorReports";

export type ToastType = "progress" | "success" | "error" | "info";

type ReportState = "idle" | "sending" | "sent" | "failed";

interface Toast {
  id: string;
  title?: string;
  message: string;
  type: ToastType;
  errorCode?: string;
  error?: unknown;
  context?: Record<string, unknown>;
  reportable?: boolean;
  reportState?: ReportState;
}

export interface ToastOptions {
  title?: string;
  duration?: number;
  error?: unknown;
  errorCode?: string;
  context?: Record<string, unknown>;
  reportable?: boolean;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, options?: ToastOptions) => string;
  progress: (message: string, options?: ToastOptions) => string;
  success: (message: string, options?: ToastOptions) => string;
  error: (message: string, options?: ToastOptions) => string;
  info: (message: string, options?: ToastOptions) => string;
  update: (id: string, message: string, type?: ToastType, options?: ToastOptions) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const typeStyles: Record<ToastType, string> = {
  progress: "border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-800 dark:bg-blue-950/90 dark:text-blue-100",
  success: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/90 dark:text-emerald-100",
  error: "border-red-200 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/90 dark:text-red-100",
  info: "border-gray-200 bg-white text-gray-950 dark:border-gray-700 dark:bg-gray-900/95 dark:text-gray-100",
};

const iconStyles: Record<ToastType, string> = {
  progress: "text-blue-600 dark:text-blue-400",
  success: "text-emerald-600 dark:text-emerald-400",
  error: "text-red-600 dark:text-red-400",
  info: "text-gray-700 dark:text-gray-200",
};

const ToastIcon = ({ type }: { type: ToastType }) => {
  const className = `mt-0.5 h-5 w-5 shrink-0 ${iconStyles[type]}`;
  if (type === "progress") return <LoaderCircle className={`${className} animate-spin motion-reduce:animate-none`} />;
  if (type === "success") return <CheckCircle2 className={className} />;
  if (type === "error") return <AlertTriangle className={className} />;
  return <Info className={className} />;
};

const defaultTitle: Record<ToastType, string> = {
  progress: "In progress",
  success: "Success",
  error: "Something went wrong",
  info: "Notice",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const scheduleDismiss = useCallback((id: string, type: ToastType, duration?: number) => {
    if (type === "progress" || duration === 0) return;
    window.setTimeout(() => dismissToast(id), duration ?? (type === "error" ? 20_000 : 4500));
  }, [dismissToast]);

  const showToast = useCallback(
    (message: string, type: ToastType = "info", options: ToastOptions = {}) => {
      const id = crypto.randomUUID();
      const reportable = type === "error" && options.reportable !== false;
      const toast: Toast = {
        id,
        message,
        type,
        title: options.title || defaultTitle[type],
        errorCode: reportable ? options.errorCode || createErrorCode() : undefined,
        error: options.error,
        context: options.context,
        reportable,
        reportState: reportable ? "idle" : undefined,
      };
      setToasts((current) => [...current, toast].slice(-4));
      scheduleDismiss(id, type, options.duration ?? (reportable ? 0 : undefined));
      return id;
    },
    [scheduleDismiss],
  );

  const update = useCallback((id: string, message: string, type: ToastType = "info", options: ToastOptions = {}) => {
    const reportable = type === "error" && options.reportable !== false;
    setToasts((current) => current.map((toast) => toast.id === id ? {
      ...toast,
      message,
      type,
      title: options.title || defaultTitle[type],
      errorCode: reportable ? options.errorCode || toast.errorCode || createErrorCode() : undefined,
      error: options.error,
      context: options.context,
      reportable,
      reportState: reportable ? "idle" : undefined,
    } : toast));
    scheduleDismiss(id, type, options.duration ?? (reportable ? 0 : undefined));
  }, [scheduleDismiss]);

  const value = useMemo<ToastContextValue>(
    () => ({
      showToast,
      progress: (message, options) => showToast(message, "progress", options),
      success: (message, options) => showToast(message, "success", options),
      error: (message, options) => showToast(message, "error", options),
      info: (message, options) => showToast(message, "info", options),
      update,
      dismissToast,
    }),
    [dismissToast, showToast, update],
  );

  // Keep older screens on the same visual system while their alert() calls are
  // migrated to useToast. This also covers third-party callbacks that only expose
  // the browser alert API.
  useEffect(() => {
    const originalAlert = window.alert;
    window.alert = (message) => {
      const text = String(message);
      if (/fail|error|could not|unable/i.test(text)) showToast(text, "error");
      else if (/success|created|saved|updated|redeemed|issued|copied/i.test(text)) showToast(text, "success");
      else showToast(text, "info", { duration: 7000 });
    };
    return () => { window.alert = originalAlert; };
  }, [showToast]);

  const reportError = useCallback(async (toast: Toast) => {
    if (!toast.errorCode || toast.reportState === "sending" || toast.reportState === "sent") return;
    setToasts((current) => current.map((item) => item.id === toast.id ? { ...item, reportState: "sending" } : item));
    try {
      await submitErrorReport({
        errorCode: toast.errorCode,
        message: toast.message,
        error: toast.error,
        context: toast.context,
      });
      setToasts((current) => current.map((item) => item.id === toast.id ? { ...item, reportState: "sent" } : item));
    } catch (error) {
      console.error("Could not send client error report", error);
      setToasts((current) => current.map((item) => item.id === toast.id ? { ...item, reportState: "failed" } : item));
    }
  }, []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-3 sm:right-6 sm:top-6" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto overflow-hidden rounded-2xl border shadow-xl shadow-gray-900/10 backdrop-blur transition-all ${typeStyles[toast.type]}`}
            role={toast.type === "error" ? "alert" : "status"}
          >
            <div className="flex items-start gap-3 p-4">
              <ToastIcon type={toast.type} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-5">{toast.title}</p>
                <p className="mt-0.5 break-words text-sm leading-5 opacity-90">{toast.message}</p>
                {toast.errorCode && <p className="mt-2 font-mono text-[11px] font-bold tracking-wide opacity-70">Error code: {toast.errorCode}</p>}
              </div>
              <button type="button" onClick={() => dismissToast(toast.id)} className="rounded-lg p-1 opacity-60 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-current/40" aria-label="Dismiss notification">
                <X className="h-4 w-4" />
              </button>
            </div>
            {toast.reportable && (
              <div className="border-t border-current/10 px-4 py-3">
                <button
                  type="button"
                  onClick={() => void reportError(toast)}
                  disabled={toast.reportState === "sending" || toast.reportState === "sent"}
                  className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-current/10 px-3 py-2 text-xs font-bold transition hover:bg-current/15 disabled:cursor-default disabled:opacity-70"
                >
                  {toast.reportState === "sending" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : toast.reportState === "sent" ? <CheckCircle2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                  {toast.reportState === "sending" ? "Sending…" : toast.reportState === "sent" ? "Sent to developer" : toast.reportState === "failed" ? "Retry sending" : "Send to developer"}
                </button>
                {toast.reportState === "failed" && <p className="mt-2 text-xs font-medium opacity-80">The report was not sent. Check your connection and try again.</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider.");
  return context;
}
