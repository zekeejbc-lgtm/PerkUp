import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { maintenanceError, readRuntimeConfig } from "../_shared/runtime.ts";
import { consumeRateLimit, getClientAddress } from "../_shared/rate-limit.ts";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-z][a-z0-9._]{2,22}[a-z0-9]$/;
const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "api",
  "help",
  "perk",
  "staff",
  "store",
  "support",
]);

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const normalizeEmail = (value: unknown) => String(value || "").trim().toLowerCase();
const normalizeUsername = (value: unknown) => String(value || "").trim().toLowerCase();
const normalizePhone = (value: unknown) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("09")) return `63${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("9")) return `63${digits}`;
  return digits;
};

const validateUsername = (username: string) => {
  if (!username) return "Username is required.";
  if (username.length < 4) return "Username must be at least 4 characters.";
  if (username.length > 24) return "Username must be 24 characters or fewer.";
  if (!USERNAME_PATTERN.test(username)) {
    return "Start with a letter; use letters, numbers, dots, or underscores.";
  }
  if (username.includes("..") || username.includes("__") || username.includes("._") || username.includes("_.")) {
    return "Do not repeat or mix separators.";
  }
  if (RESERVED_USERNAMES.has(username)) return "This username is reserved.";
  return "";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const rawUsername = String(body.username || "");
    if (/\s/.test(rawUsername)) {
      return jsonResponse({ error: "Username cannot contain spaces." }, 400);
    }
    const username = normalizeUsername(rawUsername);
    const phone = normalizePhone(body.phone);

    if (!email && !username && !phone) {
      return jsonResponse({ error: "Provide an email address, username, or phone number." }, 400);
    }
    if (email && !EMAIL_PATTERN.test(email)) {
      return jsonResponse({ error: "Enter a valid email address." }, 400);
    }

    const usernameError = username ? validateUsername(username) : "";
    if (usernameError) return jsonResponse({ error: usernameError }, 400);
    if (phone && (phone.length < 10 || phone.length > 15)) {
      return jsonResponse({ error: "Enter a valid phone number." }, 400);
    }

    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(
      requiredEnv("SUPABASE_URL"),
      serviceKey,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const runtime = await readRuntimeConfig(admin);
    if (runtime.mode === "maintenance") return jsonResponse(maintenanceError(runtime), 503);
    const limit = await consumeRateLimit(admin, {
      key: getClientAddress(req),
      purpose: "signup-availability-address",
      limit: 20,
      windowSeconds: 15 * 60,
      salt: serviceKey,
    });
    if (!limit.allowed) return jsonResponse({ error: "Too many availability checks. Please try again later." }, 429);

    let emailAvailable: boolean | undefined;
    if (email) {
      // Do not disclose whether a login exists. Supabase signup and the
      // verified profile-creation transaction enforce uniqueness later.
      emailAvailable = true;
    }

    let usernameAvailable: boolean | undefined;
    if (username) {
      const { data: registryRows, error } = await admin
        .from("customer_usernames")
        .select("username")
        .eq("username", username)
        .limit(1);
      if (error) throw error;
      const { data: legacyRows, error: legacyError } = await admin
        .from("users")
        .select("id")
        .eq("data->>role", "customer")
        .ilike("data->>username", username)
        .limit(1);
      if (legacyError) throw legacyError;
      usernameAvailable = !registryRows?.length && !legacyRows?.length;
    }

    let phoneAvailable: boolean | undefined;
    if (phone) {
      // Phone membership is likewise private and is checked only during the
      // final verified registration transaction.
      phoneAvailable = true;
    }

    return jsonResponse({
      ...(email ? { emailAvailable } : {}),
      ...(username ? { usernameAvailable } : {}),
      ...(phone ? { phoneAvailable } : {}),
    });
  } catch (error) {
    console.error("check-signup-availability failed", error);
    return jsonResponse({ error: "Could not check account availability." }, 500);
  }
});
