import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

const PERMANENT_TOKEN_PREFIX = "perkup:v2:";
const USERNAME_PATTERN = /^[a-z][a-z0-9._]{2,22}[a-z0-9]$/;

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const signPayload = async (payload: string, secret: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64Url(new Uint8Array(signature));
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const shouldRotateQr = Boolean(body.rotate);
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization") || "";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: "Authentication required." }, 401);

    const { data: userRow, error: userError } = await admin
      .from("users")
      .select("data")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (userError) throw userError;

    const existingUser = (userRow?.data || {}) as Record<string, unknown>;
    if (existingUser.role !== "customer") {
      return jsonResponse({ error: "Only customer accounts can generate customer QR codes." }, 403);
    }

    const profile = existingUser as {
      name?: string;
      username?: string;
      phone?: string;
      number?: string;
      birthday?: string;
      qrVersion?: number;
    };
    const username = String(profile.username || "").trim().toLowerCase();
    const missingFields = [
      String(profile.name || "").trim() ? "" : "name",
      USERNAME_PATTERN.test(username) ? "" : "username",
      String(profile.phone || profile.number || "").trim() ? "" : "phone number",
      String(profile.birthday || "").trim() ? "" : "birthday",
    ].filter(Boolean);

    if (missingFields.length > 0) {
      return jsonResponse(
        { error: `Complete your profile before generating a QR code. Missing: ${missingFields.join(", ")}.` },
        422,
      );
    }

    const { data: usernameRow, error: usernameError } = await admin
      .from("customer_usernames")
      .select("customer_id")
      .eq("username", username)
      .maybeSingle();
    if (usernameError) throw usernameError;
    if (usernameRow?.customer_id !== authData.user.id) {
      return jsonResponse({ error: "Save a unique username before generating a QR code." }, 422);
    }

    let qrVersion = Number.isFinite(Number(profile.qrVersion)) ? Number(profile.qrVersion) : 1;
    if (shouldRotateQr) {
      qrVersion += 1;
      const nextUser = {
        ...existingUser,
        qrVersion,
        updatedAt: {
          seconds: Math.floor(Date.now() / 1000),
          nanoseconds: 0,
        },
      };
      const { error: updateError } = await admin
        .from("users")
        .update({ data: nextUser })
        .eq("id", authData.user.id);
      if (updateError) throw updateError;
    }

    const payload = `${authData.user.id}.${qrVersion}`;
    const encodedPayload = base64Url(new TextEncoder().encode(payload));
    const signature = await signPayload(payload, serviceKey);
    const token = `${PERMANENT_TOKEN_PREFIX}${encodedPayload}.${signature}`;

    return jsonResponse({
      token,
      expiresAt: null,
      ttlSeconds: null,
    });
  } catch (error) {
    console.error("issue-customer-qr failed", error);
    return jsonResponse({ error: "Could not issue QR code." }, 500);
  }
});
