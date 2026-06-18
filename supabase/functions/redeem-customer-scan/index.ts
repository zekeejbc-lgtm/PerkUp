import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const TOKEN_PREFIX = "perkup:v1:";
const MAX_POINTS_PER_SCAN = 100;

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const normalizePoints = (points: unknown) =>
  Math.min(Math.max(Math.trunc(Number(points) || 1), 1), MAX_POINTS_PER_SCAN);

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
    const body = await req.json().catch(() => ({}));
    const scanToken = String(body.scanToken || "").trim();
    const storeId = String(body.storeId || "").trim();
    const promotionId = String(body.promotionId || "").trim();
    const points = normalizePoints(body.points);
    const previewOnly = Boolean(body.previewOnly);

    if (!scanToken.startsWith(TOKEN_PREFIX)) return jsonResponse({ error: "Invalid PerkUp QR code." }, 400);
    if (!storeId) return jsonResponse({ error: "Store is required." }, 400);

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
    if (authError || !authData.user) return jsonResponse({ error: "Staff authentication required." }, 401);

    const { data: staffRow, error: staffError } = await admin
      .from("users")
      .select("data")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (staffError) throw staffError;

    const staff = staffRow?.data as { role?: string; storeId?: string } | null;
    const isAuthorizedStaff =
      staff?.role === "staff" && String(staff.storeId || "") === storeId;
    if (!isAuthorizedStaff) {
      return jsonResponse({ error: "This staff account is not authorized for this store." }, 403);
    }

    const tokenHash = await sha256Hex(scanToken);
    const { data: tokenRow, error: tokenError } = await admin
      .from("customer_qr_tokens")
      .select("customer_id, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (tokenError) throw tokenError;
    if (!tokenRow) return jsonResponse({ error: "QR code was not issued by PerkUp." }, 400);
    if (tokenRow.used_at) return jsonResponse({ error: "QR code has already been used." }, 409);
    if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
      return jsonResponse({ error: "QR code has expired. Ask the customer to refresh it." }, 410);
    }

    const customerId = tokenRow.customer_id as string;
    const { data: customerRow, error: customerError } = await admin
      .from("users")
      .select("data")
      .eq("id", customerId)
      .maybeSingle();
    if (customerError) throw customerError;

    const customer = customerRow?.data as { name?: string; profilePic?: string; avatarUrl?: string; photoURL?: string } | null;
    const { data: cardRows, error: cardQueryError } = await admin
      .from("cards")
      .select("id,data")
      .eq("data->>storeId", storeId)
      .eq("data->>customerId", customerId)
      .limit(1);
    if (cardQueryError) throw cardQueryError;

    const existingCard = cardRows?.[0] as { id: string; data: Record<string, unknown> } | undefined;
    const existingStars = Number(existingCard?.data?.stars || 0);

    if (!previewOnly) {
      if (existingCard) {
        const { error: updateError } = await admin
          .from("cards")
          .update({
            data: {
              ...existingCard.data,
              stars: existingStars + points,
              updatedAt: {
                seconds: Math.floor(Date.now() / 1000),
                nanoseconds: 0,
              },
            },
          })
          .eq("id", existingCard.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertCardError } = await admin.from("cards").insert({
          id: crypto.randomUUID(),
          data: {
            storeId,
            customerId,
            stars: points,
            joinedAt: {
              seconds: Math.floor(Date.now() / 1000),
              nanoseconds: 0,
            },
            status: "active",
          },
        });
        if (insertCardError) throw insertCardError;
      }

      const scanLog = {
        customerId,
        staffId: authData.user.id,
        storeId,
        promotionId: promotionId || null,
        type: "points",
        points,
        timestamp: {
          seconds: Math.floor(Date.now() / 1000),
          nanoseconds: 0,
        },
      };
      const { error: logError } = await admin.from("promotions_scanned").insert({
        id: crypto.randomUUID(),
        data: scanLog,
      });
      if (logError) throw logError;

      const { error: consumeError } = await admin
        .from("customer_qr_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("token_hash", tokenHash);
      if (consumeError) throw consumeError;
    }

    return jsonResponse({
      customer: {
        id: customerId,
        name: customer?.name || "Unknown Customer",
        profilePic: customer?.profilePic || customer?.avatarUrl || customer?.photoURL || null,
        existingStars,
        newStars: previewOnly ? existingStars : existingStars + points,
      },
      points,
    });
  } catch (error) {
    console.error("redeem-customer-scan failed", error);
    return jsonResponse({ error: "Could not process customer scan." }, 500);
  }
});
