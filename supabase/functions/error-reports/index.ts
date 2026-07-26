import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { maintenanceError, readRuntimeConfig } from "../_shared/runtime.ts";

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const cleanText = (value: unknown, maxLength: number) =>
  String(value || "").trim().slice(0, maxLength);

const hashValue = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const sanitizeContext = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(source).slice(0, 20).map(([key, item]) => {
      const cleanKey = cleanText(key, 60);
      const sensitive = /password|passcode|token|authorization|cookie|secret|card|cvv/i.test(cleanKey);
      return [
        cleanKey,
        sensitive ? "[redacted]" : typeof item === "string" ? cleanText(item, 500) :
          typeof item === "number" || typeof item === "boolean" || item === null ? item :
          cleanText(JSON.stringify(item), 500),
      ];
    }),
  );
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const errorCode = cleanText(body.errorCode, 25).toUpperCase();
    const message = cleanText(body.message, 2000);
    if (!/^ERR-[0-9]{8}-[A-F0-9]{8}$/.test(errorCode) || !message) {
      return jsonResponse({ error: "A valid error code and message are required." }, 400);
    }

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const runtime = await readRuntimeConfig(admin);
    if (runtime.mode === "maintenance") return jsonResponse(maintenanceError(runtime), 503);
    const authorization = req.headers.get("Authorization") || "";
    let reporterUserId: string | null = null;
    let reporterRole: string | null = null;

    if (authorization) {
      const userClient = createClient(supabaseUrl, requiredEnv("SUPABASE_ANON_KEY"), {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false },
      });
      const { data } = await userClient.auth.getUser();
      reporterUserId = data.user?.id || null;
      if (reporterUserId) {
        const { data: profile } = await admin.from("users").select("data").eq("id", reporterUserId).maybeSingle();
        reporterRole = cleanText(profile?.data?.role, 30) || null;
      }
    }

    const forwardedFor = cleanText(req.headers.get("x-forwarded-for")?.split(",")[0], 100);
    const reporterKey = await hashValue(
      reporterUserId ? `user:${reporterUserId}` : `ip:${forwardedFor || "unknown"}:${serviceKey.slice(-24)}`,
    );
    const cooldownStart = new Date(Date.now() - 30_000).toISOString();
    const { count, error: cooldownError } = await admin
      .from("client_error_reports")
      .select("id", { count: "exact", head: true })
      .eq("reporter_key", reporterKey)
      .gte("created_at", cooldownStart);
    if (cooldownError) throw cooldownError;
    if ((count || 0) >= 3) return jsonResponse({ error: "Please wait a moment before sending another report." }, 429);

    const { data, error } = await admin.from("client_error_reports").insert({
      error_code: errorCode,
      message,
      stack_trace: cleanText(body.stack, 8000) || null,
      page_url: cleanText(body.pageUrl, 1000) || null,
      route: cleanText(body.route, 500) || null,
      user_agent: cleanText(body.userAgent, 1000) || null,
      app_version: cleanText(body.appVersion, 100) || null,
      context: sanitizeContext(body.context),
      reporter_user_id: reporterUserId,
      reporter_role: reporterRole,
      reporter_key: reporterKey,
    }).select("id,error_code,created_at").single();

    if (error?.code === "23505") {
      const { data: existing, error: existingError } = await admin
        .from("client_error_reports")
        .select("id,error_code,created_at")
        .eq("error_code", errorCode)
        .maybeSingle();
      if (existingError) throw existingError;
      return jsonResponse({ report: existing, alreadySubmitted: true });
    }
    if (error) throw error;
    return jsonResponse({ report: data }, 201);
  } catch (error) {
    console.error("error-reports failed", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Error report could not be sent." }, 500);
  }
});
