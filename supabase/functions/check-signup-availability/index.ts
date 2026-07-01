import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-z][a-z0-9._]{2,22}[a-z0-9]$/;
const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "api",
  "help",
  "perkup",
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

const hasLivePhoneOwner = async (
  admin: ReturnType<typeof createClient>,
  phone: string,
) => {
  const { data: phoneRows, error: phoneError } = await admin
    .from("customer_phones")
    .select("customer_id")
    .eq("phone", phone)
    .limit(1);
  if (phoneError) throw phoneError;

  const customerId = phoneRows?.[0]?.customer_id as string | undefined;
  if (!customerId) return false;

  const { data: userRow, error: userError } = await admin
    .from("users")
    .select("id")
    .eq("id", customerId)
    .maybeSingle();
  if (userError) throw userError;

  if (!userRow) {
    const { error: cleanupError } = await admin
      .from("customer_phones")
      .delete()
      .eq("phone", phone)
      .eq("customer_id", customerId);
    if (cleanupError) throw cleanupError;
    return false;
  }

  return true;
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
    const username = normalizeUsername(body.username);
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

    const admin = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    let emailAvailable: boolean | undefined;
    if (email) {
      emailAvailable = true;
      const perPage = 1000;
      for (let page = 1; ; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
        if (error) throw error;
        if (data.users.some((user) => user.email?.trim().toLowerCase() === email)) {
          emailAvailable = false;
          break;
        }
        if (data.users.length < perPage) break;
      }
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
      phoneAvailable = !(await hasLivePhoneOwner(admin, phone));
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
