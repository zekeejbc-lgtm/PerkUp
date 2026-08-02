import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { consumeRateLimit, getClientAddress } from "../_shared/rate-limit.ts";
import { maintenanceError, readRuntimeConfig } from "../_shared/runtime.ts";

const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbxfacR_tG28iu-riTquHZK9fRHN1aRAswJNUXAdRD36dd-YlxoqskAzQkgQvm1BWUQ/exec";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PURPOSES = new Set(["signup", "email_change"]);

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const clean = (value: unknown, maxLength: number) => String(value || "").trim().slice(0, maxLength);

const callMailService = async (payload: Record<string, unknown>) => {
  const response = await fetch(Deno.env.get("GAS_EMAIL_URL") || Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") || DEFAULT_GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...payload, secret: requiredEnv("DRIVE_CRUD_SECRET") }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.otp) throw new Error("Email verification is temporarily unavailable.");
  return data.otp;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return corsPreflightResponse();
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const runtime = await readRuntimeConfig(admin);
    if (runtime.mode === "maintenance") return jsonResponse(maintenanceError(runtime), 503);

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = clean(body.action, 20).toLowerCase();
    const email = clean(body.recipientEmail, 254).toLowerCase();
    const purpose = clean(body.purpose, 30).toLowerCase();
    if (!EMAIL_PATTERN.test(email) || !PURPOSES.has(purpose)) {
      return jsonResponse({ error: "A valid email verification request is required." }, 400);
    }

    if (purpose === "email_change") {
      const authorization = request.headers.get("Authorization") || "";
      const userClient = createClient(supabaseUrl, requiredEnv("SUPABASE_ANON_KEY"), {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false },
      });
      const { data, error } = await userClient.auth.getUser();
      if (error || !data.user) return jsonResponse({ error: "Authentication required." }, 401);
    }

    if (action === "request") {
      const address = getClientAddress(request);
      const [recipientLimit, addressLimit] = await Promise.all([
        consumeRateLimit(admin, {
          key: email, purpose: `email-otp-recipient-${purpose}`, limit: 3, windowSeconds: 15 * 60, salt: serviceKey,
        }),
        consumeRateLimit(admin, {
          key: address, purpose: `email-otp-address-${purpose}`, limit: 10, windowSeconds: 60 * 60, salt: serviceKey,
        }),
      ]);
      if (!recipientLimit.allowed || !addressLimit.allowed) {
        return jsonResponse({ error: "Too many verification requests. Please try again later." }, 429);
      }
      const otp = await callMailService({
        action: "request_otp",
        recipientEmail: email,
        userName: clean(body.userName, 100) || "Perk user",
        purpose,
      });
      return jsonResponse({ otpToken: otp.otpToken, expiresInSeconds: otp.expiresInSeconds, referenceId: otp.referenceId });
    }

    if (action === "verify") {
      const otpToken = clean(body.otpToken, 100);
      const otpCode = clean(body.otpCode, 10);
      if (!otpToken || !/^\d{6}$/.test(otpCode)) return jsonResponse({ error: "A valid verification code is required." }, 400);
      const otp = await callMailService({ action: "verify_otp", otpToken, otpCode, recipientEmail: email, purpose });
      return jsonResponse({ verified: otp.verified === true, recipientEmail: email, purpose });
    }

    return jsonResponse({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("email-otp failed", error);
    return jsonResponse({ error: "Email verification is temporarily unavailable." }, 500);
  }
});
