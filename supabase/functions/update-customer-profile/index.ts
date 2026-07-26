import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { sessionNeedsMfa } from "../_shared/auth.ts";
import { maintenanceError, readRuntimeConfig } from "../_shared/runtime.ts";

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

const normalizeUsername = (value: unknown) =>
  String(value || "").trim().toLowerCase();
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
    return "Username must start with a letter and use only letters, numbers, dots, or underscores.";
  }
  if (username.includes("..") || username.includes("__") || username.includes("._") || username.includes("_.")) {
    return "Username cannot use repeated or mixed separators.";
  }
  if (RESERVED_USERNAMES.has(username)) return "Username is reserved.";
  return "";
};

const cleanText = (value: unknown, maxLength: number) =>
  String(value || "").trim().slice(0, maxLength);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization") || "";

    const body = await req.json().catch(() => ({}));
    const rawUsername = String(body.username || "");
    if (/\s/.test(rawUsername)) {
      return jsonResponse({ error: "Username cannot contain spaces." }, 400);
    }
    const username = normalizeUsername(rawUsername);
    const phone = normalizePhone(body.phone);
    const usernameError = validateUsername(username);
    if (usernameError) return jsonResponse({ error: usernameError }, 400);
    if (phone.length < 10 || phone.length > 15) {
      return jsonResponse({ error: "Enter a valid phone number." }, 400);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
    const runtime = await readRuntimeConfig(admin);
    if (runtime.mode === "maintenance") return jsonResponse(maintenanceError(runtime), 503);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: "Authentication required." }, 401);
    if (await sessionNeedsMfa(userClient, authorization)) {
      return jsonResponse({ error: "Complete multi-factor authentication to continue.", code: "mfa_required" }, 403);
    }

    const { data: userRow, error: userError } = await admin
      .from("users")
      .select("data")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (userError) throw userError;

    const existingUser = (userRow?.data || {}) as Record<string, unknown>;
    if (["suspended", "banned"].includes(String(existingUser.accountStatus || "active"))) {
      return jsonResponse({ error: `This account is ${existingUser.accountStatus}.` }, 403);
    }
    if (existingUser.role && existingUser.role !== "customer") {
      return jsonResponse({ error: "Only customer accounts can update customer usernames." }, 403);
    }

    const { data: ownerRows, error: ownerError } = await admin
      .from("customer_usernames")
      .select("customer_id")
      .eq("username", username)
      .limit(1);
    if (ownerError) throw ownerError;
    const ownerId = ownerRows?.[0]?.customer_id as string | undefined;
    if (ownerId && ownerId !== authData.user.id) {
      return jsonResponse({ error: "Username is already taken." }, 409);
    }
    const { data: phoneRows, error: phoneOwnerError } = await admin
      .from("customer_phones")
      .select("customer_id")
      .eq("phone", phone)
      .limit(1);
    if (phoneOwnerError) throw phoneOwnerError;
    const phoneOwnerId = phoneRows?.[0]?.customer_id as string | undefined;
    if (phoneOwnerId && phoneOwnerId !== authData.user.id) {
      return jsonResponse({ error: "Phone number is already associated with an account." }, 409);
    }

    const payload = {
      name: cleanText(body.name, 80),
      username,
      phone: cleanText(body.phone, 40),
      number: cleanText(body.phone, 40),
      bio: cleanText(body.bio, 240),
      birthday: cleanText(body.birthday, 40),
      avatarUrl: cleanText(body.avatarUrl, 500),
      photoURL: cleanText(body.avatarUrl, 500),
      updatedAt: {
        seconds: Math.floor(Date.now() / 1000),
        nanoseconds: 0,
      },
    };

    const mergedUser = {
      ...existingUser,
      ...payload,
      role: "customer",
      email: existingUser.email || authData.user.email || "",
      createdAt: existingUser.createdAt || {
        seconds: Math.floor(Date.now() / 1000),
        nanoseconds: 0,
      },
    };

    const { data: customerRow, error: customerReadError } = await admin
      .from("customers")
      .select("data")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (customerReadError) throw customerReadError;

    const mergedCustomer = {
      ...((customerRow?.data || {}) as Record<string, unknown>),
      ...payload,
      userId: authData.user.id,
      lifetimeStars: (customerRow?.data as Record<string, unknown> | undefined)?.lifetimeStars || 0,
    };

    const { error: userUpdateError } = await admin
      .from("users")
      .upsert({ id: authData.user.id, data: mergedUser });
    if (userUpdateError) throw userUpdateError;

    const { error: customerUpdateError } = await admin
      .from("customers")
      .upsert({ id: authData.user.id, data: mergedCustomer });
    if (customerUpdateError) throw customerUpdateError;

    const previousUsername = normalizeUsername(existingUser.username);
    if (previousUsername && previousUsername !== username) {
      const { data: updatedUsernameRow, error: usernameUpdateError } = await admin
        .from("customer_usernames")
        .update({ username })
        .eq("customer_id", authData.user.id)
        .select("username")
        .maybeSingle();
      if (usernameUpdateError) {
        if (usernameUpdateError.code === "23505") {
          return jsonResponse({ error: "Username is already taken." }, 409);
        }
        throw usernameUpdateError;
      }
      if (!updatedUsernameRow) {
        const { error: usernameInsertError } = await admin
          .from("customer_usernames")
          .insert({ username, customer_id: authData.user.id });
        if (usernameInsertError) {
          if (usernameInsertError.code === "23505") {
            return jsonResponse({ error: "Username is already taken." }, 409);
          }
          throw usernameInsertError;
        }
      }
    } else if (!ownerId) {
      const { error: usernameInsertError } = await admin
        .from("customer_usernames")
        .insert({ username, customer_id: authData.user.id });
      if (usernameInsertError) {
        if (usernameInsertError.code === "23505") {
          return jsonResponse({ error: "Username is already taken." }, 409);
        }
        throw usernameInsertError;
      }
    }

    const { data: phoneRegistryRow, error: phoneUpdateError } = await admin
      .from("customer_phones")
      .update({ phone })
      .eq("customer_id", authData.user.id)
      .select("phone")
      .maybeSingle();
    if (phoneUpdateError) {
      if (phoneUpdateError.code === "23505") {
        return jsonResponse({ error: "Phone number is already associated with an account." }, 409);
      }
      throw phoneUpdateError;
    }
    if (!phoneRegistryRow) {
      const { error: phoneInsertError } = await admin
        .from("customer_phones")
        .insert({ phone, customer_id: authData.user.id });
      if (phoneInsertError) {
        if (phoneInsertError.code === "23505") {
          return jsonResponse({ error: "Phone number is already associated with an account." }, 409);
        }
        throw phoneInsertError;
      }
    }

    return jsonResponse({ profile: mergedUser });
  } catch (error) {
    console.error("update-customer-profile failed", error);
    return jsonResponse({ error: "Could not update customer profile." }, 500);
  }
});
