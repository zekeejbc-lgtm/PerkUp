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
    const promotionId = String(body.promotionId || "").trim();
    const points = normalizePoints(body.points);
    const previewOnly = Boolean(body.previewOnly);

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
        profilePic: null,
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
