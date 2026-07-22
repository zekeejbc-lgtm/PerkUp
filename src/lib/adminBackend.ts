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
  const invoke = async (accessToken: string) => supabase.functions.invoke<AdminBackendResponse<T>>("admin-backend", {
    body,
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const { data: sessionData } = await supabase.auth.getSession();
  let session = sessionData.session;
  if (!session) throw new Error("Your session has expired. Please sign in again.");

  // Explicitly forward the user JWT. This avoids an occasional race where the
  // Functions client still has the publishable key while Auth has restored the
  // persisted user session.
  let result = await invoke(session.access_token);
  if (result.error) {
    const firstMessage = await getFunctionErrorMessage(result.error, "Backend operation failed.");
    if (/authentication required|jwt|token.*expired/i.test(firstMessage)) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshed.session) {
        session = refreshed.session;
        result = await invoke(session.access_token);
      } else {
        throw new Error("Your session has expired. Please sign in again.");
      }
    } else {
      throw new Error(firstMessage);
    }
  }

  if (result.error) throw new Error(await getFunctionErrorMessage(result.error, "Backend operation failed."));
  if (!result.data || result.data.error) throw new Error(result.data?.error || "Backend operation returned no data.");
  return result.data as T;
}
