import { supabase } from "./supabase";

export type ErrorReportDetails = {
  errorCode: string;
  message: string;
  error?: unknown;
  context?: Record<string, unknown>;
};

export const createErrorCode = () => {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const token = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `ERR-${date}-${token}`;
};

const getErrorStack = (error: unknown) => {
  if (error instanceof Error) return error.stack || `${error.name}: ${error.message}`;
  if (error && typeof error === "object") {
    try { return JSON.stringify(error); } catch { return String(error); }
  }
  return typeof error === "string" ? error : "";
};

export async function submitErrorReport(details: ErrorReportDetails) {
  const pageUrl = new URL(window.location.href);
  pageUrl.search = "";
  pageUrl.hash = "";
  const { data, error } = await supabase.functions.invoke("error-reports", {
    body: {
      errorCode: details.errorCode,
      message: details.message,
      stack: getErrorStack(details.error),
      context: details.context || {},
      pageUrl: pageUrl.toString(),
      route: window.location.pathname,
      userAgent: navigator.userAgent,
      appVersion: import.meta.env.VITE_APP_VERSION || "web",
    },
  });
  if (error) throw error;
  if (!data?.report) throw new Error(data?.error || "Error report could not be sent.");
  return data.report as { id: string; error_code: string; created_at: string };
}
