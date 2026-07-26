import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { sessionNeedsMfa } from "../_shared/auth.ts";
import { maintenanceError, readRuntimeConfig } from "../_shared/runtime.ts";

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const clean = (value: unknown, max = 500) => String(value || "").trim().slice(0, max);

const claimResponse = (row: Record<string, unknown>) => ({
  id: row.id,
  publicId: row.public_id,
  promotionId: row.promotion_id,
  storeId: row.store_id,
  redeemCode: row.redeem_code,
  qrToken: row.qr_token,
  status: row.status,
  claimedAt: row.claimed_at,
  expiresAt: row.expires_at,
  redeemedAt: row.redeemed_at,
  redemptionMethod: row.redemption_method,
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
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
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const runtime = await readRuntimeConfig(admin);
    if (runtime.mode === "maintenance") return jsonResponse(maintenanceError(runtime), 503);
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: "Authentication required." }, 401);
    if (await sessionNeedsMfa(userClient, authorization)) {
      return jsonResponse({ error: "Complete multi-factor authentication to continue.", code: "mfa_required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = clean(body.action, 30);
    const { data: profileRow, error: profileError } = await admin
      .from("users").select("data").eq("id", authData.user.id).maybeSingle();
    if (profileError) throw profileError;
    const profile = (profileRow?.data || {}) as Record<string, unknown>;
    if (["suspended", "banned"].includes(String(profile.accountStatus || "active"))) {
      return jsonResponse({ error: `This account is ${profile.accountStatus}.` }, 403);
    }

    if (action === "list") {
      if (profile.role !== "customer") return jsonResponse({ error: "Customer account required." }, 403);
      await admin.from("promotion_claims").update({ status: "expired" })
        .eq("customer_id", authData.user.id).eq("status", "claimed").lte("expires_at", new Date().toISOString());
      const { data, error } = await admin.from("promotion_claims").select("*")
        .eq("customer_id", authData.user.id).order("claimed_at", { ascending: false });
      if (error) throw error;
      return jsonResponse({ claims: (data || []).map(claimResponse) });
    }

    if (action === "claim") {
      if (profile.role !== "customer") return jsonResponse({ error: "Customer account required." }, 403);
      const promotionId = clean(body.promotionId, 100);
      if (!promotionId) return jsonResponse({ error: "Promotion is required." }, 400);
      const { data: promotionRow, error: promotionError } = await admin.from("promotions")
        .select("data").eq("id", promotionId).maybeSingle();
      if (promotionError) throw promotionError;
      const promotionStoreId = clean(promotionRow?.data?.storeId, 100);
      if (!promotionStoreId) return jsonResponse({ error: "Promotion was not found." }, 404);
      await assertDemoBoundary(admin, profile, promotionStoreId, authData.user.id);
      const { data, error } = await admin.rpc("claim_promotion_reward", {
        p_customer_id: authData.user.id,
        p_promotion_id: promotionId,
      });
      if (error) return jsonResponse({ error: error.message }, 409);
      return jsonResponse({ claim: claimResponse(data as Record<string, unknown>) });
    }

    if (action === "redeem") {
      const storeId = clean(body.storeId, 100);
      const lookup = clean(body.lookup, 500);
      const method = clean(body.method, 20);
      if (!storeId || !lookup || !["qr", "code", "manual"].includes(method)) {
        return jsonResponse({ error: "Store, claim identifier, and redemption method are required." }, 400);
      }

      let authorized = profile.role === "staff" && clean(profile.storeId, 100) === storeId;
      if (profile.role === "store_owner") {
        const { data: storeRow, error: storeError } = await admin.from("stores").select("id")
          .eq("id", storeId).eq("data->>ownerId", authData.user.id).maybeSingle();
        if (storeError) throw storeError;
        authorized = Boolean(storeRow);
      }
      if (!authorized) return jsonResponse({ error: "You are not authorized to redeem claims for this store." }, 403);

      let claim: { id?: string; customer_id?: string } | null = null;
      let resolvedLookup = lookup;
      const tokenResult = await admin.from("promotion_claims").select("customer_id")
        .eq("store_id", storeId).eq("status", "claimed").eq("redemption_token", lookup).maybeSingle();
      if (tokenResult.error) throw tokenResult.error;
      claim = tokenResult.data;
      if (!claim && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(lookup)) {
        const idResult = await admin.from("promotion_claims").select("customer_id")
          .eq("store_id", storeId).eq("status", "claimed").eq("id", lookup).maybeSingle();
        if (idResult.error) throw idResult.error;
        claim = idResult.data;
      }
      if (!claim && /^CLM-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(lookup.toUpperCase())) {
        const publicIdResult = await admin.from("promotion_claims").select("id,customer_id")
          .eq("store_id", storeId).eq("status", "claimed").eq("public_id", lookup.toUpperCase()).maybeSingle();
        if (publicIdResult.error) throw publicIdResult.error;
        claim = publicIdResult.data;
        if (claim?.id) resolvedLookup = claim.id;
      }
      await assertDemoBoundary(admin, profile, storeId, clean(claim?.customer_id, 100) || undefined);

      const { data, error } = await admin.rpc("redeem_promotion_reward", {
        p_store_id: storeId,
        p_staff_id: authData.user.id,
        p_lookup: resolvedLookup,
        p_method: method,
      });
      if (error) return jsonResponse({ error: error.message }, 409);
      return jsonResponse({ claim: claimResponse(data as Record<string, unknown>) });
    }

    return jsonResponse({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("promotion-claims failed", error);
    return jsonResponse({ error: "Could not process promotion claim." }, 500);
  }
});

const assertDemoBoundary = async (
  admin: any,
  actorProfile: Record<string, unknown>,
  storeId: string,
  customerId?: string,
) => {
  const { data: storeRow, error: storeError } = await admin.from("stores")
    .select("data").eq("id", storeId).maybeSingle();
  if (storeError) throw storeError;
  if (!storeRow) throw new Error("Store was not found.");

  const actorIsDemo = actorProfile.isDemo === true;
  const storeIsDemo = storeRow.data?.isDemo === true;
  const actorTenantId = clean(actorProfile.demoTenantId, 100);
  const storeTenantId = clean(storeRow.data?.demoTenantId, 100);
  const actorExpiry = Date.parse(clean(actorProfile.demoExpiresAt, 100));

  if (actorIsDemo) {
    if (
      !Number.isFinite(actorExpiry) ||
      actorExpiry <= Date.now() ||
      !actorTenantId ||
      !storeIsDemo ||
      actorTenantId !== storeTenantId
    ) {
      throw new Error("Demo accounts can only use an active promotion in their own sandbox.");
    }
  } else if (storeIsDemo) {
    throw new Error("Production accounts cannot process demo sandbox claims.");
  }

  if (!customerId) {
    if (actorIsDemo) throw new Error("The claim was not found in this demo sandbox.");
    return;
  }

  const { data: customerRow, error: customerError } = await admin.from("users")
    .select("data").eq("id", customerId).maybeSingle();
  if (customerError) throw customerError;
  const customerIsDemo = customerRow?.data?.isDemo === true;
  const customerTenantId = clean(customerRow?.data?.demoTenantId, 100);
  if (actorIsDemo && (!customerIsDemo || customerTenantId !== actorTenantId)) {
    throw new Error("Demo activity is limited to accounts in the same sandbox.");
  }
  if (!actorIsDemo && customerIsDemo) {
    throw new Error("Production accounts cannot change demo customer claims.");
  }
};
