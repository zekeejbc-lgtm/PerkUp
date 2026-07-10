import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

const LEGACY_TOKEN_PREFIX = "perkup:v1:";
const RETIRED_SIGNED_TOKEN_PREFIX = "perkup:v2:";
const SIGNED_TOKEN_PREFIX = "perkup:v3:";
const MAX_POINTS_PER_SCAN = 100;
const USERNAME_PATTERN = /^[a-z][a-z0-9._]{2,22}[a-z0-9]$/;
const PHILIPPINE_UTC_OFFSET = "+08:00";
const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const normalizePoints = (points: unknown) =>
  Math.min(Math.max(Math.trunc(Number(points) || 1), 1), MAX_POINTS_PER_SCAN);

const promotionDateMillis = (value: unknown) => {
  const rawValue = String(value || "").trim();
  if (!rawValue) return Number.NaN;
  const dateText = LOCAL_DATE_TIME_PATTERN.test(rawValue)
    ? `${rawValue}${PHILIPPINE_UTC_OFFSET}`
    : rawValue;
  const millis = new Date(dateText).getTime();
  return Number.isFinite(millis) ? millis : Number.NaN;
};

const timestamp = () => ({
  seconds: Math.floor(Date.now() / 1000),
  nanoseconds: 0,
});

const normalizeUsername = (value: unknown) =>
  String(value || "").trim().replace(/^@+/, "").toLowerCase();

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

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

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

const signedReceiptId = async (payload: string, secret: string) => {
  const encodedPayload = base64Url(new TextEncoder().encode(payload));
  const signature = base64Url(await signPayload(payload, secret));
  return `perkstamp:v1:${encodedPayload}.${signature}`;
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
  const tokenPrefix = scanToken.startsWith(SIGNED_TOKEN_PREFIX)
    ? SIGNED_TOKEN_PREFIX
    : scanToken.startsWith(RETIRED_SIGNED_TOKEN_PREFIX)
      ? RETIRED_SIGNED_TOKEN_PREFIX
      : "";
  if (!tokenPrefix) return null;
  if (tokenPrefix === RETIRED_SIGNED_TOKEN_PREFIX) {
    return { customerId: "", qrVersion: 0, expired: true };
  }

  try {
    const tokenBody = scanToken.slice(tokenPrefix.length);
    const [encodedPayload, encodedSignature] = tokenBody.split(".");
    if (!encodedPayload || !encodedSignature) return null;

    const payload = new TextDecoder().decode(base64UrlToBytes(encodedPayload));
    const [customerId, versionText, expiresAtText] = payload.split(".");
    const qrVersion = Number(versionText);
    if (!customerId || !Number.isInteger(qrVersion) || qrVersion < 1) return null;

    const expectedSignature = await signPayload(payload, secret);
    const actualSignature = base64UrlToBytes(encodedSignature);
    if (!timingSafeEqual(actualSignature, expectedSignature)) return null;

    const expiresAtSeconds = Number(expiresAtText);
    const expired = tokenPrefix === RETIRED_SIGNED_TOKEN_PREFIX
      || !Number.isInteger(expiresAtSeconds)
      || expiresAtSeconds <= Math.floor(Date.now() / 1000);
    return { customerId, qrVersion, expired };
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
    const isSignedToken = scanToken.startsWith(SIGNED_TOKEN_PREFIX)
      || scanToken.startsWith(RETIRED_SIGNED_TOKEN_PREFIX);
    const isLegacyToken = scanToken.startsWith(LEGACY_TOKEN_PREFIX);
    if (!isManualLookup && !isSignedToken && !isLegacyToken) {
      return jsonResponse({ error: "Invalid PerkUp QR code." }, 400);
    }
    if (isManualLookup && !isValidUsername(manualUsername)) {
      return jsonResponse({ error: "Invalid: no customer found." }, 404);
    }
    if (!storeId) return jsonResponse({ error: "Store is required." }, 400);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const signingSecret = requiredEnv("QR_SIGNING_SECRET");
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

    const staff = staffRow?.data as { role?: string; storeId?: string; name?: string } | null;
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
    const store = storeRow?.data as {
      name?: string;
      lat?: number | string;
      lng?: number | string;
      stampIcon?: string;
      stampColor?: string;
      stampLabel?: string;
    } | null;
    const storeStampStyle = {
      stampIcon: String(store?.stampIcon || "star"),
      stampColor: String(store?.stampColor || "#1b1b1b"),
      stampLabel: String(store?.stampLabel || "Stamp"),
    };
    let promotionTitle: string | null = null;
    let promotionRequiredStamps = 10;
    let promotionMaxRedemptions = 0;

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
        requiredStamps?: number | string;
        title?: string;
        geofenceEnabled?: boolean;
        geofenceLat?: number | string | null;
        geofenceLng?: number | string | null;
        geofenceRadiusMeters?: number | string | null;
      } | null;

      if (!promotion || String(promotion.storeId || "") !== storeId) {
        return jsonResponse({ error: "Promotion is not available for this store." }, 403);
      }
      promotionTitle = String(promotion.title || "Promotion");
      promotionRequiredStamps = Math.max(Number(promotion.requiredStamps || 10), 1);
      promotionMaxRedemptions = Number(promotion.maxRedemptions || 0);
      if (promotion.active === false) {
        return jsonResponse({ error: "Promotion is not active." }, 409);
      }
      if (promotion.startDate && promotionDateMillis(promotion.startDate) > Date.now()) {
        return jsonResponse({ error: "Promotion has not started yet." }, 409);
      }
      if (promotion.endDate && promotionDateMillis(promotion.endDate) <= Date.now()) {
        return jsonResponse({ error: "Promotion has already ended." }, 410);
      }

      const geofenceLat = Number(promotion.geofenceLat);
      const geofenceLng = Number(promotion.geofenceLng);
      const geofenceRadiusMeters = Math.max(Number(promotion.geofenceRadiusMeters || 500), 25);
      if (promotion.geofenceEnabled && (!Number.isFinite(geofenceLat) || !Number.isFinite(geofenceLng))) {
        return jsonResponse({ error: "Promotion geofence is not configured correctly." }, 409);
      }
      if (promotion.geofenceEnabled && Number.isFinite(geofenceLat) && Number.isFinite(geofenceLng)) {
        if (!scannerLocation) {
          return jsonResponse({ error: "Scanner location is required for this scan." }, 400);
        }
        const distance = distanceInMeters(scannerLocation, { lat: geofenceLat, lng: geofenceLng });
        if (distance > geofenceRadiusMeters) {
          return jsonResponse({ error: `Scanner is outside the allowed geofence (${Math.round(distance)}m away).` }, 403);
        }
      }

    }

    let customerId = "";
    let tokenHash = "";
    let verifiedSignedToken: Awaited<ReturnType<typeof verifySignedCustomerToken>> = null;

    if (isManualLookup) {
      const { data: usernameRow, error: usernameError } = await admin
        .from("customer_usernames")
        .select("customer_id")
        .eq("username", manualUsername)
        .maybeSingle();
      if (usernameError) throw usernameError;

      customerId = String(usernameRow?.customer_id || "");

      // Older customer records can predate the username registry. Search the
      // canonical profile data and repair the registry when there is one match.
      if (!customerId) {
        const { data: matchingUsers, error: matchingUsersError } = await admin
          .from("users")
          .select("id")
          .eq("data->>role", "customer")
          .ilike("data->>username", manualUsername)
          .limit(2);
        if (matchingUsersError) throw matchingUsersError;

        if ((matchingUsers || []).length === 1) {
          customerId = String(matchingUsers![0].id);
          const { error: registryError } = await admin
            .from("customer_usernames")
            .upsert(
              { username: manualUsername, customer_id: customerId },
              { onConflict: "username" },
            );
          if (registryError) console.warn("Could not repair customer username registry", registryError);
        }
      }

      if (!customerId) return jsonResponse({ error: "Invalid: no customer found." }, 404);
    } else if (isSignedToken) {
      verifiedSignedToken = await verifySignedCustomerToken(scanToken, signingSecret);
      if (!verifiedSignedToken) return jsonResponse({ error: "Invalid PerkUp QR code." }, 400);
      if (verifiedSignedToken.expired) return jsonResponse({ error: "QR is expired." }, 410);

      customerId = verifiedSignedToken.customerId;
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
        return jsonResponse({ error: "QR is expired. Ask the customer to refresh it." }, 410);
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
      const activeQrVersion = Number.isFinite(Number(customer?.qrVersion)) ? Number(customer?.qrVersion) : 1;
      if (!verifiedSignedToken || verifiedSignedToken.qrVersion !== activeQrVersion) {
        return jsonResponse({ error: "QR is expired. Ask the customer for their latest QR." }, 410);
      }
    }
    if (!customer) {
      return jsonResponse({ error: "Invalid: no customer found." }, 404);
    }

    const customerUsername = normalizeUsername(customer?.username || manualUsername);
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
          ...storeStampStyle,
          status,
          promoProgress: cardRow.data?.promoProgress && typeof cardRow.data.promoProgress === "object"
            ? cardRow.data.promoProgress
            : {},
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
    const existingPromoProgress = promotionId
      ? Number((existingCard?.data?.promoProgress as Record<string, unknown> | undefined)?.[promotionId] || 0)
      : 0;
    const existingStars = promotionId ? existingPromoProgress : Number(existingCard?.data?.stars || 0);
    let responseCards = activeCards.map(({ data: _data, ...card }) => card);

    if (promotionId) {
      const customerAlreadyCompleted = (cardRows || []).some((row) => {
        const cardData = (row as { data?: Record<string, unknown> }).data || {};
        if (String(cardData.customerId || "") !== customerId) return false;
        const progress = Number((cardData.promoProgress as Record<string, unknown> | undefined)?.[promotionId] || 0);
        return progress >= promotionRequiredStamps;
      });

      if (existingPromoProgress >= promotionRequiredStamps || customerAlreadyCompleted) {
        return jsonResponse({ error: "This customer has already completed this promotion." }, 409);
      }

      if (promotionMaxRedemptions > 0) {
        const completedCustomerIds = new Set<string>();
        let anonymousCompletedCards = 0;

        for (const row of cardRows || []) {
          const cardData = (row as { data?: Record<string, unknown> }).data || {};
          const progress = Number((cardData.promoProgress as Record<string, unknown> | undefined)?.[promotionId] || 0);
          if (progress < promotionRequiredStamps) continue;

          const completedCustomerId = String(cardData.customerId || "").trim();
          if (completedCustomerId) completedCustomerIds.add(completedCustomerId);
          else anonymousCompletedCards += 1;
        }

        if (completedCustomerIds.size + anonymousCompletedCards >= promotionMaxRedemptions) {
          return jsonResponse({ error: "Promotion has run out of available completed cards." }, 409);
        }
      }
    }

    if (!previewOnly) {
      const ticketId = crypto.randomUUID();
      const ticketNumber = `PK-${Date.now().toString(36).toUpperCase()}-${ticketId.slice(0, 4).toUpperCase()}`;
      const issuedAt = new Date().toISOString();
      const receiptPayload = [
        ticketId,
        customerId,
        storeId,
        authData.user.id,
        String(points),
        issuedAt,
        promotionId || "store-visit",
      ].join(".");
      const cryptographicId = await signedReceiptId(receiptPayload, serviceKey);

      if (promotionId) {
        const nextProgressValue = Math.max(existingPromoProgress + points, 0);
        if (existingCard) {
          const promoProgress = existingCard.data?.promoProgress && typeof existingCard.data.promoProgress === "object"
            ? { ...(existingCard.data.promoProgress as Record<string, unknown>) }
            : {};
          promoProgress[promotionId] = nextProgressValue;

          const nextCardData = {
            ...existingCard.data,
            promoProgress,
            lastPromotionStampReceiptId: cryptographicId,
            updatedAt: timestamp(),
          };
          const { error: updateError } = await admin
            .from("cards")
            .update({ data: nextCardData })
            .eq("id", existingCard.id)
            .eq("data->>customerId", customerId)
            .eq("data->>storeId", storeId);
          if (updateError) throw updateError;

          responseCards = activeCards.map(({ data: _data, ...card }) =>
            card.id === existingCard.id
              ? { ...card, promoProgress, updatedAt: nextCardData.updatedAt }
              : card
          );
        } else {
          const newCardId = crypto.randomUUID();
          const joinedAt = timestamp();
          const promoProgress = { [promotionId]: nextProgressValue };
          const newCardData = {
            storeId,
            customerId,
            storeName: String(store?.name || "Store"),
            stars: 0,
            promoProgress,
            ...storeStampStyle,
            lastPromotionStampReceiptId: cryptographicId,
            joinedAt,
            updatedAt: joinedAt,
            status: "active",
          };
          const { error: insertCardError } = await admin.from("cards").insert({
            id: newCardId,
            data: newCardData,
          });
          if (insertCardError) throw insertCardError;

          responseCards = [
            ...responseCards,
            {
              id: newCardId,
              label: String(store?.name || "Store"),
              storeName: String(store?.name || "Store"),
              stars: 0,
              ...storeStampStyle,
              status: "active",
              promoProgress,
              joinedAt,
              updatedAt: joinedAt,
            },
          ];
        }
      } else {
        if (existingCard) {
          const { error: updateError } = await admin.rpc("increment_loyalty_totals", {
            p_customer_id: customerId,
            p_card_id: existingCard.id,
            p_points: points,
            p_stamp_receipt_id: cryptographicId,
          });
          if (updateError) throw updateError;
          responseCards = activeCards.map(({ data: _data, ...card }) =>
            card.id === existingCard.id ? { ...card, stars: Number(card.stars || 0) + points } : card
          );
        } else {
          const newCardId = crypto.randomUUID();
          const joinedAt = timestamp();
          const { error: insertCardError } = await admin.from("cards").insert({
            id: newCardId,
            data: {
              storeId,
              customerId,
              storeName: String(store?.name || "Store"),
              stars: points,
              ...storeStampStyle,
              lastStampReceiptId: cryptographicId,
              joinedAt,
              status: "active",
            },
          });
          if (insertCardError) throw insertCardError;
          const { error: totalError } = await admin.rpc("increment_loyalty_totals", {
            p_customer_id: customerId,
            p_card_id: null,
            p_points: points,
            p_stamp_receipt_id: cryptographicId,
          });
          if (totalError) throw totalError;

          responseCards = [
            ...responseCards,
            {
              id: newCardId,
              label: String(store?.name || "Store"),
              storeName: String(store?.name || "Store"),
              stars: points,
              ...storeStampStyle,
              status: "active",
              promoProgress: {},
              joinedAt,
              updatedAt: joinedAt,
            },
          ];
        }
      }

      const staffName = String(staff?.name || "Store staff");
      const scanLog = {
        ticketNumber,
        cryptographicId,
        status: "issued",
        customerId,
        staffId: authData.user.id,
        staffName,
        storeId,
        storeName: String(store?.name || "Store"),
        promotionId: promotionId || null,
        promotionTitle,
        type: "points",
        points,
        scannerLocation,
        issuedAt,
        timestamp: {
          seconds: Math.floor(Date.now() / 1000),
          nanoseconds: 0,
        },
      };
      const { error: logError } = await admin.from("promotions_scanned").insert({
        id: ticketId,
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

      return jsonResponse({
        customer: {
          id: customerId,
          username: customerUsername,
          maskedName: maskName(customer?.name || customerUsername || "Customer"),
          birthday: customer?.birthday || null,
          profilePic: customer?.profilePic || customer?.avatarUrl || customer?.photoURL || null,
          existingStars,
          newStars: existingStars + points,
          cards: responseCards,
        },
        points,
        ticket: {
          id: ticketId,
          ticketNumber,
          cryptographicId,
          status: "issued",
          staffId: authData.user.id,
          staffName,
          storeId,
          storeName: String(store?.name || "Store"),
          promotionId: promotionId || null,
          promotionTitle,
          points,
          issuedAt,
        },
      });
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
        cards: responseCards,
      },
      points,
    });
  } catch (error) {
    console.error("redeem-customer-scan failed", error);
    return jsonResponse({ error: "Could not process customer scan." }, 500);
  }
});
