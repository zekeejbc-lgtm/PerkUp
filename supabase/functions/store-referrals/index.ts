import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

const REFERRAL_POINTS = 1;
const MAX_SIGNUP_REDEMPTION_AGE_MS = 60 * 60 * 1000;
const REFERRAL_CODE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const timestampFromMillis = (millis: number) => ({
  seconds: Math.floor(millis / 1000),
  nanoseconds: 0,
});

const nowTimestamp = () => timestampFromMillis(Date.now());

const timestampMillis = (value: unknown) => {
  if (!value || typeof value !== "object") return 0;
  const timestamp = value as { seconds?: unknown; nanoseconds?: unknown };
  const seconds = Number(timestamp.seconds);
  const nanoseconds = Number(timestamp.nanoseconds || 0);
  if (!Number.isFinite(seconds)) return 0;
  return seconds * 1000 + Math.floor(nanoseconds / 1_000_000);
};

const normalizeCode = (value: unknown) =>
  String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

const codePrefix = (storeName: unknown) => {
  const letters = String(storeName || "STORE").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (letters || "STORE").slice(0, 4).padEnd(4, "X");
};

const randomSegment = (length = 4) => {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
};

const generateReferralCode = (storeName: unknown) => `${codePrefix(storeName)}${randomSegment(6)}`;

const referralCodeExpiresAtMillis = (storeData: Record<string, unknown>) => {
  const explicitExpiry = timestampMillis(storeData.referralCodeExpiresAt);
  if (explicitExpiry) return explicitExpiry;
  const createdAt = timestampMillis(storeData.referralCodeCreatedAt);
  return createdAt ? createdAt + REFERRAL_CODE_TTL_MS : 0;
};

const activeReferralCode = (storeData: Record<string, unknown>) => {
  const code = normalizeCode(storeData.referralCode);
  const expiresAtMillis = referralCodeExpiresAtMillis(storeData);
  if (!code || !expiresAtMillis || expiresAtMillis <= Date.now()) return null;
  return { code, expiresAtMillis };
};

const countStorePromotions = async (admin: ReturnType<typeof createClient>, storeId: string) => {
  const { count, error } = await admin
    .from("promotions")
    .select("id", { count: "exact", head: true })
    .eq("data->>storeId", storeId);
  if (error) throw error;
  return Number(count || 0);
};

const countStoreReferralRedemptions = async (
  admin: ReturnType<typeof createClient>,
  storeId: string,
) => {
  const { count, error } = await admin
    .from("store_referral_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId);
  if (error) throw error;
  return Number(count || 0);
};

const findStoreByReferralCode = async (admin: ReturnType<typeof createClient>, referralCode: string) => {
  const { data, error } = await admin
    .from("stores")
    .select("id,data")
    .eq("data->>referralCode", referralCode)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; data: Record<string, unknown> } | null;
};

const getOrCreateReferralCode = async (
  admin: ReturnType<typeof createClient>,
  storeRow: { id: string; data: Record<string, unknown> },
) => {
  const existing = activeReferralCode(storeRow.data);
  if (existing) return existing;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = generateReferralCode(storeRow.data.name);
    const existingStore = await findStoreByReferralCode(admin, candidate);
    if (existingStore) continue;

    const createdAtMillis = Date.now();
    const expiresAtMillis = createdAtMillis + REFERRAL_CODE_TTL_MS;
    const nextData = {
      ...storeRow.data,
      referralCode: candidate,
      referralCodeCreatedAt: timestampFromMillis(createdAtMillis),
      referralCodeExpiresAt: timestampFromMillis(expiresAtMillis),
      updatedAt: nowTimestamp(),
    };
    const { error } = await admin
      .from("stores")
      .update({ data: nextData })
      .eq("id", storeRow.id);
    if (error) throw error;
    return { code: candidate, expiresAtMillis };
  }

  throw new Error("Could not generate a unique referral code.");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").trim();
    const storeId = String(body.storeId || "").trim();
    const referralCode = normalizeCode(body.referralCode);

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

    if (action === "validate") {
      if (!referralCode) return jsonResponse({ error: "Referral code is required." }, 400);
      const store = await findStoreByReferralCode(admin, referralCode);
      if (!store) return jsonResponse({ error: "Referral code was not found." }, 404);
      const activeCode = activeReferralCode(store.data);
      if (!activeCode || activeCode.code !== referralCode) {
        return jsonResponse({ error: "This referral code has expired." }, 410);
      }
      if (store.data.status && store.data.status !== "active") {
        return jsonResponse({ error: "This store referral code is not active." }, 409);
      }
      const promotionCount = await countStorePromotions(admin, store.id);
      if (promotionCount < 1) {
        return jsonResponse({ error: "This store needs at least one promotion before referrals can be redeemed." }, 409);
      }
      return jsonResponse({
        referralCode,
        storeId: store.id,
        storeName: String(store.data.name || "Store"),
        promotionCount,
        expiresAt: new Date(activeCode.expiresAtMillis).toISOString(),
      });
    }

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: "Authentication required." }, 401);

    if (action === "get-code" || action === "stats") {
      if (!storeId) return jsonResponse({ error: "Store is required." }, 400);

      const { data: ownerRow, error: ownerError } = await admin
        .from("users")
        .select("data")
        .eq("id", authData.user.id)
        .maybeSingle();
      if (ownerError) throw ownerError;
      const owner = ownerRow?.data as { role?: string } | null;
      if (owner?.role !== "store_owner") {
        return jsonResponse({ error: "Only store owners can access referral codes." }, 403);
      }

      const { data: storeRow, error: storeError } = await admin
        .from("stores")
        .select("id,data")
        .eq("id", storeId)
        .maybeSingle();
      if (storeError) throw storeError;
      const store = storeRow as { id: string; data: Record<string, unknown> } | null;
      if (!store || String(store.data.ownerId || "") !== authData.user.id) {
        return jsonResponse({ error: "Store is not available for this owner." }, 403);
      }

      const referralCount = await countStoreReferralRedemptions(admin, storeId);
      if (action === "stats") {
        return jsonResponse({ referralCount });
      }

      const promotionCount = await countStorePromotions(admin, storeId);
      if (promotionCount < 1) {
        return jsonResponse({ error: "Create at least one promotion before getting a referral code." }, 409);
      }

      const referral = await getOrCreateReferralCode(admin, store);
      return jsonResponse({
        referralCode: referral.code,
        promotionCount,
        referralCount,
        expiresAt: new Date(referral.expiresAtMillis).toISOString(),
      });
    }

    if (action === "redeem") {
      if (!referralCode) return jsonResponse({ error: "Referral code is required." }, 400);

      const { data: userRow, error: userError } = await admin
        .from("users")
        .select("data")
        .eq("id", authData.user.id)
        .maybeSingle();
      if (userError) throw userError;
      const profile = userRow?.data as { role?: string; name?: string; username?: string; createdAt?: unknown } | null;
      if (!profile || profile.role !== "customer") {
        return jsonResponse({ error: "Only customer accounts can redeem referral codes." }, 403);
      }
      const createdAtMillis = timestampMillis(profile.createdAt);
      if (!createdAtMillis || Date.now() - createdAtMillis > MAX_SIGNUP_REDEMPTION_AGE_MS) {
        return jsonResponse({ error: "Referral codes can only be redeemed during signup." }, 403);
      }

      const { data: existingRedemption, error: redemptionLookupError } = await admin
        .from("store_referral_redemptions")
        .select("id")
        .eq("customer_id", authData.user.id)
        .maybeSingle();
      if (redemptionLookupError) throw redemptionLookupError;
      if (existingRedemption) {
        return jsonResponse({ error: "This account has already redeemed a referral code." }, 409);
      }

      const store = await findStoreByReferralCode(admin, referralCode);
      if (!store) return jsonResponse({ error: "Referral code was not found." }, 404);
      const activeCode = activeReferralCode(store.data);
      if (!activeCode || activeCode.code !== referralCode) {
        return jsonResponse({ error: "This referral code has expired." }, 410);
      }
      if (store.data.status && store.data.status !== "active") {
        return jsonResponse({ error: "This store referral code is not active." }, 409);
      }

      const promotionCount = await countStorePromotions(admin, store.id);
      if (promotionCount < 1) {
        return jsonResponse({ error: "This store needs at least one promotion before referrals can be redeemed." }, 409);
      }

      const { error: insertRedemptionError } = await admin.from("store_referral_redemptions").insert({
        id: crypto.randomUUID(),
        customer_id: authData.user.id,
        store_id: store.id,
        referral_code: referralCode,
      });
      if (insertRedemptionError) {
        if (insertRedemptionError.code === "23505") {
          return jsonResponse({ error: "This account has already redeemed a referral code." }, 409);
        }
        throw insertRedemptionError;
      }

      const { data: cardRows, error: cardError } = await admin
        .from("cards")
        .select("id,data")
        .eq("data->>storeId", store.id)
        .eq("data->>customerId", authData.user.id)
        .limit(1);
      if (cardError) throw cardError;

      const existingCard = cardRows?.[0] as { id: string; data: Record<string, unknown> } | undefined;
      const existingStars = Number(existingCard?.data?.stars || 0);
      const cardData = {
        ...(existingCard?.data || {}),
        storeId: store.id,
        storeName: String(store.data.name || "Store"),
        customerId: authData.user.id,
        stars: existingStars + REFERRAL_POINTS,
        status: "active",
        referralCode,
        referralRedeemedAt: nowTimestamp(),
        updatedAt: nowTimestamp(),
      };

      if (existingCard) {
        const { error: updateCardError } = await admin
          .from("cards")
          .update({ data: cardData })
          .eq("id", existingCard.id);
        if (updateCardError) throw updateCardError;
      } else {
        const { error: insertCardError } = await admin.from("cards").insert({
          id: crypto.randomUUID(),
          data: {
            ...cardData,
            joinedAt: nowTimestamp(),
          },
        });
        if (insertCardError) throw insertCardError;
      }

      const { error: logError } = await admin.from("promotions_scanned").insert({
        id: crypto.randomUUID(),
        data: {
          customerId: authData.user.id,
          staffId: null,
          storeId: store.id,
          promotionId: null,
          type: "referral",
          points: REFERRAL_POINTS,
          referralCode,
          timestamp: nowTimestamp(),
        },
      });
      if (logError) throw logError;

      return jsonResponse({
        referralCode,
        storeId: store.id,
        storeName: String(store.data.name || "Store"),
        points: REFERRAL_POINTS,
        existingStars,
        newStars: existingStars + REFERRAL_POINTS,
        expiresAt: new Date(activeCode.expiresAtMillis).toISOString(),
      });
    }

    return jsonResponse({ error: "Unsupported referral action." }, 400);
  } catch (error) {
    console.error("store-referrals failed", error);
    return jsonResponse({ error: "Could not process referral request." }, 500);
  }
});
