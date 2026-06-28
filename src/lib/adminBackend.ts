import { supabase } from "./supabase";

type AdminBackendResponse<T> = T & { error?: string };

export async function invokeAdminBackend<T extends Record<string, unknown>>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<AdminBackendResponse<T>>("admin-backend", {
    body,
  });
  if (error) throw new Error(error.message || "Backend operation failed.");
  if (!data || data.error) throw new Error(data?.error || "Backend operation returned no data.");
  return data as T;
}
