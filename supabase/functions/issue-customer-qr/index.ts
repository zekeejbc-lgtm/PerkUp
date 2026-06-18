import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const TOKEN_PREFIX = "perkup:v1:";
const TOKEN_TTL_SECONDS = 10 * 60;

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

const sha256Hex = async (value: string) => {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
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
    if ((userRow?.data as { role?: string } | null)?.role !== "customer") {
      return jsonResponse({ error: "Only customer accounts can generate customer QR codes." }, 403);
    }

    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const token = `${TOKEN_PREFIX}${base64Url(randomBytes)}`;
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();

    const { error: insertError } = await admin.from("customer_qr_tokens").insert({
      token_hash: tokenHash,
      customer_id: authData.user.id,
      expires_at: expiresAt,
    });
    if (insertError) throw insertError;

    await admin
      .from("customer_qr_tokens")
      .delete()
      .eq("customer_id", authData.user.id)
      .lt("expires_at", new Date().toISOString());

    return jsonResponse({
      token,
      expiresAt,
      ttlSeconds: TOKEN_TTL_SECONDS,
    });
  } catch (error) {
    console.error("issue-customer-qr failed", error);
    return jsonResponse({ error: "Could not issue QR code." }, 500);
  }
});
