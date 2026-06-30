import { supabase } from "./supabase";

type AdminBackendResponse<T> = T & { error?: string };

const getFunctionErrorMessage = async (error: unknown, fallback: string) => {
  if (!error || typeof error !== "object") return fallback;

  const maybeContext = error as {
    context?: {
      json?: () => Promise<{ error?: string }>;
      text?: () => Promise<string>;
    };
    message?: string;
  };

  if (maybeContext.context?.json) {
    try {
      const body = await maybeContext.context.json();
      if (body?.error) return body.error;
    } catch {
      // Fall through to other error sources.
    }
  }

  if (maybeContext.context?.text) {
    try {
      const bodyText = await maybeContext.context.text();
      const trimmed = bodyText.trim();
      if (trimmed) return trimmed;
    } catch {
      // Fall through to the SDK message.
    }
  }

  return maybeContext.message || fallback;
};

export async function invokeAdminBackend<T extends Record<string, unknown>>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<AdminBackendResponse<T>>("admin-backend", {
    body,
  });
  if (error) throw new Error(await getFunctionErrorMessage(error, "Backend operation failed."));
  if (!data || data.error) throw new Error(data?.error || "Backend operation returned no data.");
  return data as T;
}
