import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

const LEGACY_TOKEN_PREFIX = "perkup:v1:";
const SIGNED_TOKEN_PREFIX = "perkup:v2:";
const MAX_POINTS_PER_SCAN = 100;
const USERNAME_PATTERN = /^[a-z][a-z0-9._]{2,22}[a-z0-9]$/;

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const normalizePoints = (points: unknown) =>
  Math.min(Math.max(Math.trunc(Number(points) || 1), 1), MAX_POINTS_PER_SCAN);

const normalizeUsername = (value: unknown) =>
  String(value || "").trim().toLowerCase();

const isValidUsername = (username: string) =>
  USERNAME_PATTERN.test(username) &&
  !username.includes("..") &&
  !username.includes("__") &&
  !username.includes("._") &&
  !username.includes("_.");

const normalizeScannerLocation = (value: unknown) => {
  if (!value || typeof value !== "object") return null;
  const location = value as { lat?: unknown; lng?: unknown; accuracy?: unknown };
  const lat = Number(location.lat);
  const lng = Number(location.lng);
  const accuracy = Number(location.accuracy);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    lat,
    lng,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
  };
};

const distanceInMeters = (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => {
  const earthRadiusMeters = 6371e3;
  const lat1 = from.lat * Math.PI / 180;
  const lat2 = to.lat * Math.PI / 180;
  const dLat = (to.lat - from.lat) * Math.PI / 180;
  const dLon = (to.lng - from.lng) * Math.PI / 180;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
};

const maskName = (value: string) => {
  const compact = value.trim().replace(/\s+/g, "");
  if (!compact) return "C***R";
  if (compact.length === 1) return `${compact[0].toUpperCase()}***`;
  return `${compact[0].toUpperCase()}***${compact[compact.length - 1].toUpperCase()}`;
};

const sha256Hex = async (value: string) => {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const base64UrlToBytes = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const signPayload = async (payload: string, secret: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
};

const timingSafeEqual = (left: Uint8Array, right: Uint8Array) => {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
};

const verifySignedCustomerToken = async (scanToken: string, secret: string) => {
  if (!scanToken.startsWith(SIGNED_TOKEN_PREFIX)) return null;

  try {
    const tokenBody = scanToken.slice(SIGNED_TOKEN_PREFIX.length);
    const [encodedPayload, encodedSignature] = tokenBody.split(".");
    if (!encodedPayload || !encodedSignature) return null;

    const payload = new TextDecoder().decode(base64UrlToBytes(encodedPayload));
    const [customerId, versionText] = payload.split(".");
    const qrVersion = Number(versionText);
    if (!customerId || !Number.isInteger(qrVersion) || qrVersion < 1) return null;

    const expectedSignature = await signPayload(payload, secret);
    const actualSignature = base64UrlToBytes(encodedSignature);
    if (!timingSafeEqual(actualSignature, expectedSignature)) return null;

    return { customerId, qrVersion };
  } catch {
    return null;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const scanToken = String(body.scanToken || "").trim();
    const manualUsername = normalizeUsername(body.manualUsername);
    const storeId = String(body.storeId || "").trim();
    const selectedCardId = String(body.selectedCardId || "").trim();
    const promotionId = String(body.promotionId || "").trim();
    const points = normalizePoints(body.points);
    const previewOnly = Boolean(body.previewOnly);
    const scannerLocation = normalizeScannerLocation(body.scannerLocation);

    const isManualLookup = Boolean(manualUsername);
    const isSignedToken = scanToken.startsWith(SIGNED_TOKEN_PREFIX);
    const isLegacyToken = scanToken.startsWith(LEGACY_TOKEN_PREFIX);
    if (!isManualLookup && !isSignedToken && !isLegacyToken) {
      return jsonResponse({ error: "Invalid PerkUp QR code." }, 400);
    }
    if (isManualLookup && !isValidUsername(manualUsername)) {
      return jsonResponse({ error: "Customer username could not be verified." }, 404);
    }
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

    const { data: storeRow, error: storeError } = await admin
      .from("stores")
      .select("data")
      .eq("id", storeId)
      .maybeSingle();
    if (storeError) throw storeError;
    const store = storeRow?.data as { name?: string; lat?: number | string; lng?: number | string } | null;

    if (promotionId) {
      const { data: promotionRow, error: promotionError } = await admin
        .from("promotions")
        .select("data")
        .eq("id", promotionId)
        .maybeSingle();
      if (promotionError) throw promotionError;

      const promotion = promotionRow?.data as {
        storeId?: string;
        active?: boolean;
        startDate?: string;
        endDate?: string;
        maxRedemptions?: number | null;
        geofenceEnabled?: boolean;
        geofenceLat?: number | string | null;
        geofenceLng?: number | string | null;
        geofenceRadiusMeters?: number | string | null;
      } | null;

      if (!promotion || String(promotion.storeId || "") !== storeId) {
        return jsonResponse({ error: "Promotion is not available for this store." }, 403);
      }
      if (promotion.active === false) {
        return jsonResponse({ error: "Promotion is not active." }, 409);
      }
      if (promotion.startDate && new Date(promotion.startDate).getTime() > Date.now()) {
        return jsonResponse({ error: "Promotion has not started yet." }, 409);
      }
      if (promotion.endDate && new Date(promotion.endDate).getTime() <= Date.now()) {
        return jsonResponse({ error: "Promotion has already ended." }, 410);
      }

      const geofenceLat = promotion.geofenceEnabled ? Number(promotion.geofenceLat) : Number(store?.lat);
      const geofenceLng = promotion.geofenceEnabled ? Number(promotion.geofenceLng) : Number(store?.lng);
      const geofenceRadiusMeters = promotion.geofenceEnabled
        ? Math.max(Number(promotion.geofenceRadiusMeters || 500), 25)
        : 500;
      if (promotion.geofenceEnabled && (!Number.isFinite(geofenceLat) || !Number.isFinite(geofenceLng))) {
        return jsonResponse({ error: "Promotion geofence is not configured correctly." }, 409);
      }
      if (Number.isFinite(geofenceLat) && Number.isFinite(geofenceLng)) {
        if (!scannerLocation) {
          return jsonResponse({ error: "Scanner location is required for this scan." }, 400);
        }
        const distance = distanceInMeters(scannerLocation, { lat: geofenceLat, lng: geofenceLng });
        if (distance > geofenceRadiusMeters) {
          return jsonResponse({ error: `Scanner is outside the allowed geofence (${Math.round(distance)}m away).` }, 403);
        }
      }

      const maxRedemptions = Number(promotion.maxRedemptions || 0);
      if (maxRedemptions > 0) {
        const { count, error: countError } = await admin
          .from("promotions_scanned")
          .select("id", { count: "exact", head: true })
          .eq("data->>promotionId", promotionId);
        if (countError) throw countError;
        if (Number(count || 0) >= maxRedemptions) {
          return jsonResponse({ error: "Promotion has run out of available redemptions." }, 409);
        }
      }
    }

    if (!promotionId) {
      const storeLat = Number(store?.lat);
      const storeLng = Number(store?.lng);
      if (Number.isFinite(storeLat) && Number.isFinite(storeLng)) {
        if (!scannerLocation) {
          return jsonResponse({ error: "Scanner location is required for this scan." }, 400);
        }
        const distance = distanceInMeters(scannerLocation, { lat: storeLat, lng: storeLng });
        if (distance > 500) {
          return jsonResponse({ error: `Scanner is outside the allowed store geofence (${Math.round(distance)}m away).` }, 403);
        }
      }
    }

    let customerId = "";
    let tokenHash = "";

    if (isManualLookup) {
      const { data: usernameRow, error: usernameError } = await admin
        .from("customer_usernames")
        .select("customer_id")
        .eq("username", manualUsername)
        .maybeSingle();
      if (usernameError) throw usernameError;
      if (!usernameRow?.customer_id) {
        return jsonResponse({ error: "Customer username could not be verified." }, 404);
      }
      customerId = usernameRow.customer_id as string;
    } else if (isSignedToken) {
      const verifiedToken = await verifySignedCustomerToken(scanToken, serviceKey);
      if (!verifiedToken) return jsonResponse({ error: "QR code signature could not be verified." }, 400);

      customerId = verifiedToken.customerId;
    } else {
      tokenHash = await sha256Hex(scanToken);
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
      customerId = tokenRow.customer_id as string;
    }
    const { data: customerRow, error: customerError } = await admin
      .from("users")
      .select("data")
      .eq("id", customerId)
      .maybeSingle();
    if (customerError) throw customerError;

    const customer = customerRow?.data as {
      name?: string;
      username?: string;
      birthday?: string;
      profilePic?: string;
      avatarUrl?: string;
      photoURL?: string;
      qrVersion?: number;
    } | null;
    if (isSignedToken) {
      const verifiedToken = await verifySignedCustomerToken(scanToken, serviceKey);
      const activeQrVersion = Number.isFinite(Number(customer?.qrVersion)) ? Number(customer?.qrVersion) : 1;
      if (!verifiedToken || verifiedToken.qrVersion !== activeQrVersion) {
        return jsonResponse({ error: "QR code has been replaced. Ask the customer for their latest QR." }, 410);
      }
    }
    const customerUsername = normalizeUsername(customer?.username || manualUsername);
    if (!customer || customerUsername !== (manualUsername || customerUsername)) {
      return jsonResponse({ error: "Customer username could not be verified." }, 404);
    }
    const { data: cardRows, error: cardQueryError } = await admin
      .from("cards")
      .select("id,data")
      .eq("data->>storeId", storeId)
      .eq("data->>customerId", customerId);
    if (cardQueryError) throw cardQueryError;

    const cards = ((cardRows || []) as { id: string; data: Record<string, unknown> }[])
      .map((cardRow) => {
        const status = String(cardRow.data?.status || "active").toLowerCase();
        return {
          id: cardRow.id,
          label: String(cardRow.data?.cardName || cardRow.data?.title || cardRow.data?.storeName || "Loyalty Card"),
          storeName: String(cardRow.data?.storeName || store?.name || "Store"),
          stars: Number(cardRow.data?.stars || 0),
          status,
          joinedAt: cardRow.data?.joinedAt || cardRow.data?.createdAt || null,
          updatedAt: cardRow.data?.updatedAt || null,
          data: cardRow.data,
        };
      });
    const activeCards = cards.filter((card) => card.status === "active");
    const selectedCard = selectedCardId
      ? activeCards.find((card) => card.id === selectedCardId)
      : activeCards[0];

    if (selectedCardId && !selectedCard) {
      return jsonResponse({ error: "Selected card is not active for this customer and store." }, 400);
    }

    const existingCard = selectedCard
      ? { id: selectedCard.id, data: selectedCard.data }
      : undefined;
    const existingStars = Number(existingCard?.data?.stars || 0);

    if (!previewOnly) {
      if (existingCard) {
        const { error: updateError } = await admin.rpc("increment_loyalty_totals", {
          p_customer_id: customerId,
          p_card_id: existingCard.id,
          p_points: points,
        });
        if (updateError) throw updateError;
      } else {
        const { error: insertCardError } = await admin.from("cards").insert({
          id: crypto.randomUUID(),
          data: {
            storeId,
            customerId,
            storeName: String(store?.name || "Store"),
            stars: points,
            joinedAt: {
              seconds: Math.floor(Date.now() / 1000),
              nanoseconds: 0,
            },
            status: "active",
          },
        });
        if (insertCardError) throw insertCardError;
        const { error: totalError } = await admin.rpc("increment_loyalty_totals", {
          p_customer_id: customerId,
          p_card_id: null,
          p_points: points,
        });
        if (totalError) throw totalError;
      }

      const scanLog = {
        customerId,
        staffId: authData.user.id,
        storeId,
        promotionId: promotionId || null,
        type: "points",
        points,
        scannerLocation,
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

      if (isLegacyToken) {
        const { error: consumeError } = await admin
          .from("customer_qr_tokens")
          .update({ used_at: new Date().toISOString() })
          .eq("token_hash", tokenHash);
        if (consumeError) throw consumeError;
      }
    }

    return jsonResponse({
      customer: {
        id: customerId,
        username: customerUsername,
        maskedName: maskName(customer?.name || customerUsername || "Customer"),
        birthday: customer?.birthday || null,
        profilePic: customer?.profilePic || customer?.avatarUrl || customer?.photoURL || null,
        existingStars,
        newStars: previewOnly ? existingStars : existingStars + points,
        cards: activeCards.map(({ data: _data, ...card }) => card),
      },
      points,
    });
  } catch (error) {
    console.error("redeem-customer-scan failed", error);
    return jsonResponse({ error: "Could not process customer scan." }, 500);
  }
});
