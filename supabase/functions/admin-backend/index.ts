import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

const DEFAULT_GAS_UPLOAD_URL =
  "https://script.google.com/macros/s/AKfycbxfacR_tG28iu-riTquHZK9fRHN1aRAswJNUXAdRD36dd-YlxoqskAzQkgQvm1BWUQ/exec";

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const cleanText = (value: unknown, maxLength: number) =>
  String(value || "").trim().slice(0, maxLength);

const timestamp = () => ({
  seconds: Math.floor(Date.now() / 1000),
  nanoseconds: 0,
});

type UserProfile = {
  role?: string;
  storeId?: string;
  email?: string;
  username?: string;
};

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
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: "Authentication required." }, 401);

    const { data: actorRow, error: actorError } = await admin
      .from("users")
      .select("data")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (actorError) throw actorError;

    const actor = (actorRow?.data || {}) as UserProfile;
    const actorIsAdmin = actor.role === "admin" || actor.role === "assistant_admin";
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = cleanText(body.action, 40);

    if (action === "create_store") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const email = cleanText(body.email, 254).toLowerCase();
      const password = String(body.password || "");
      const name = cleanText(body.name, 80);
      const storeInput = body.store && typeof body.store === "object"
        ? body.store as Record<string, unknown>
        : {};
      const storeName = cleanText(storeInput.name, 120);
      if (!email || password.length < 8 || !name || !storeName) {
        return jsonResponse({ error: "Owner name, store name, valid email, and an 8-character password are required." }, 400);
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name, name },
      });
      if (createError || !created.user) {
        return jsonResponse({ error: createError?.message || "Owner account creation failed." }, 400);
      }

      const ownerId = created.user.id;
      const storeId = crypto.randomUUID();
      const profile = {
        email,
        name,
        role: "store_owner",
        createdAt: timestamp(),
        updatedAt: timestamp(),
      };
      const store = {
        ...storeInput,
        name: storeName,
        ownerId,
        status: ["pending", "active", "suspended"].includes(String(storeInput.status))
          ? String(storeInput.status)
          : "pending",
        createdAt: timestamp(),
        updatedAt: timestamp(),
      };

      const { error: profileError } = await admin.from("users").insert({ id: ownerId, data: profile });
      if (profileError) {
        await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
        throw profileError;
      }
      const { error: storeError } = await admin.from("stores").insert({ id: storeId, data: store });
      if (storeError) {
        await admin.from("users").delete().eq("id", ownerId);
        await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
        throw storeError;
      }

      const applicationId = cleanText(body.applicationId, 100);
      if (applicationId) {
        const { data: applicationRow } = await admin
          .from("applications")
          .select("data")
          .eq("id", applicationId)
          .maybeSingle();
        if (applicationRow) {
          await admin.from("applications").update({
            data: {
              ...applicationRow.data,
              status: "approved",
              approvedStoreId: storeId,
              approvedAt: timestamp(),
            },
          }).eq("id", applicationId);
          const { data: applicationFile } = await admin
            .from("application_files")
            .select("file_id,url")
            .eq("application_id", applicationId)
            .maybeSingle();
          if (applicationFile) {
            await admin.from("drive_files").upsert({
              file_id: applicationFile.file_id,
              owner_id: ownerId,
              purpose: "store-logo",
              url: applicationFile.url,
            });
            await admin.from("application_files").delete().eq("file_id", applicationFile.file_id);
          }
        }
      }

      return jsonResponse({ store: { id: storeId, ...store }, owner: { id: ownerId, ...profile } });
    }

    if (action === "reject_application") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const applicationId = cleanText(body.applicationId, 100);
      const { data: applicationRow, error: applicationError } = await admin
        .from("applications")
        .select("data")
        .eq("id", applicationId)
        .maybeSingle();
      if (applicationError) throw applicationError;
      if (!applicationRow) return jsonResponse({ error: "Application was not found." }, 404);

      const { data: fileRows, error: filesError } = await admin
        .from("application_files")
        .select("file_id")
        .eq("application_id", applicationId);
      if (filesError) throw filesError;
      for (const file of fileRows || []) {
        await deleteDriveFile(file.file_id).catch((error) => {
          console.error("Could not delete rejected application file", file.file_id, error);
        });
      }
      await admin.from("application_files").delete().eq("application_id", applicationId);
      const { error: updateError } = await admin.from("applications").update({
        data: {
          ...applicationRow.data,
          status: "rejected",
          logoUrl: "",
          rejectedAt: timestamp(),
          updatedAt: timestamp(),
        },
      }).eq("id", applicationId);
      if (updateError) throw updateError;
      return jsonResponse({ rejected: true });
    }

    if (action === "create_account") {
      const role = cleanText(body.role, 30);
      const storeId = cleanText(body.storeId, 100);
      const email = cleanText(body.email, 254).toLowerCase();
      const password = String(body.password || "");
      const name = cleanText(body.name, 80);

      const canCreate =
        actorIsAdmin ||
        (actor.role === "store_owner" && role === "staff" && storeId && await ownsStore(admin, storeId, authData.user.id));
      const allowedRole =
        ["store_owner", "staff"].includes(role) ||
        (actorIsAdmin && role === "assistant_admin");
      if (!canCreate || !allowedRole) {
        return jsonResponse({ error: "You are not allowed to create this account." }, 403);
      }
      if (!email || password.length < 8 || !name) {
        return jsonResponse({ error: "Name, valid email, and an 8-character password are required." }, 400);
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name, name },
      });
      if (createError || !created.user) {
        return jsonResponse({ error: createError?.message || "Account creation failed." }, 400);
      }

      const profile = {
        email,
        name,
        role,
        ...(storeId ? { storeId } : {}),
        createdAt: timestamp(),
        updatedAt: timestamp(),
      };
      const { error: profileError } = await admin.from("users").insert({
        id: created.user.id,
        data: profile,
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
        throw profileError;
      }

      return jsonResponse({ user: { id: created.user.id, ...profile } });
    }

    if (action === "reset_password") {
      const userId = cleanText(body.userId, 100);
      const password = String(body.password || "");
      const target = await getUserProfile(admin, userId);
      const canReset =
        actorIsAdmin ||
        (actor.role === "store_owner" &&
          target?.role === "staff" &&
          Boolean(target.storeId) &&
          await ownsStore(admin, String(target.storeId), authData.user.id));
      if (!canReset) return jsonResponse({ error: "You are not allowed to reset this password." }, 403);
      if (password.length < 8) return jsonResponse({ error: "Password must be at least 8 characters." }, 400);

      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      await mergeUserData(admin, userId, {
        forcePasswordReset: Boolean(body.forcePasswordReset),
        passwordResetAt: timestamp(),
      });
      return jsonResponse({ updated: true });
    }

    if (action === "delete_user") {
      const userId = cleanText(body.userId, 100);
      const target = await getUserProfile(admin, userId);
      const canDelete =
        actorIsAdmin ||
        (actor.role === "store_owner" &&
          target?.role === "staff" &&
          Boolean(target.storeId) &&
          await ownsStore(admin, String(target.storeId), authData.user.id));
      if (!canDelete) return jsonResponse({ error: "You are not allowed to delete this account." }, 403);
      await admin.from("users").delete().eq("id", userId);
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error && !error.message.toLowerCase().includes("not found")) throw error;
      return jsonResponse({ deleted: true });
    }

    if (action === "verify_account_deletion_otp") {
      if (actor.role !== "customer") {
        return jsonResponse({ error: "Customer access required." }, 403);
      }
      const otpToken = cleanText(body.otpToken, 100);
      const otpCode = cleanText(body.otpCode, 10);
      if (!otpToken || !/^\d{6}$/.test(otpCode) || !authData.user.email) {
        return jsonResponse({ error: "A valid deletion OTP is required." }, 400);
      }
      await verifyDeletionOtp(otpToken, otpCode, authData.user.email);
      const expiresAt = Date.now() + 5 * 60 * 1000;
      const deletionProof = await createDeletionProof(
        serviceKey,
        authData.user.id,
        expiresAt,
      );
      return jsonResponse({ deletionProof, expiresAt });
    }

    if (action === "delete_my_account") {
      if (actor.role !== "customer") {
        return jsonResponse({
          error: "Self-service deletion is currently available for customer accounts only.",
        }, 403);
      }

      const userId = authData.user.id;
      const username = cleanText(body.username, 80).toLowerCase();
      const password = String(body.password || "");
      const deletionProof = cleanText(body.deletionProof, 1000);
      if (!actor.username || username !== String(actor.username).trim().toLowerCase()) {
        return jsonResponse({ error: "The username does not match this account." }, 403);
      }
      if (!await verifyDeletionProof(serviceKey, deletionProof, userId)) {
        return jsonResponse({ error: "Deletion verification expired. Request a new OTP." }, 403);
      }
      if (!authData.user.email || !password) {
        return jsonResponse({ error: "Your current password is required." }, 400);
      }
      const passwordClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false },
      });
      const { data: passwordData, error: passwordError } =
        await passwordClient.auth.signInWithPassword({
          email: authData.user.email,
          password,
        });
      if (passwordError || passwordData.user?.id !== userId) {
        return jsonResponse({ error: "The password is incorrect." }, 403);
      }

      const deletedAt = timestamp();

      // Keep only an unlinkable store-facing tombstone. All reward progress is erased.
      const { data: cardRows, error: cardReadError } = await admin
        .from("cards")
        .select("id,data")
        .eq("data->>customerId", userId);
      if (cardReadError) throw cardReadError;
      for (const card of cardRows || []) {
        const { error } = await admin.from("cards").update({
          data: {
            storeId: card.data?.storeId,
            joinedAt: card.data?.joinedAt,
            customerId: `deleted:${crypto.randomUUID()}`,
            customerName: "Deleted account",
            accountDeleted: true,
            deletedAt,
            status: "deleted",
            stars: 0,
            promoProgress: {},
          },
        }).eq("id", card.id);
        if (error) throw error;
      }

      const { error: scanError } = await admin
        .from("promotions_scanned")
        .delete()
        .eq("data->>customerId", userId);
      if (scanError) throw scanError;
      const { error: feedbackError } = await admin
        .from("feedback")
        .delete()
        .eq("data->>customerId", userId);
      if (feedbackError) throw feedbackError;
      const { error: referralError } = await admin
        .from("store_referral_redemptions")
        .delete()
        .eq("customer_id", userId);
      if (referralError) throw referralError;

      const { data: files, error: filesError } = await admin
        .from("drive_files")
        .select("file_id")
        .eq("owner_id", userId);
      if (filesError) throw filesError;
      for (const file of files || []) {
        await permanentlyDeleteDriveFile(file.file_id);
        const { error: driveRowError } = await admin
          .from("drive_files")
          .delete()
          .eq("file_id", file.file_id)
          .eq("owner_id", userId);
        if (driveRowError) throw driveRowError;
      }

      const { error: customerError } = await admin.from("customers").delete().eq("id", userId);
      if (customerError) throw customerError;
      const { error: profileError } = await admin.from("users").delete().eq("id", userId);
      if (profileError) throw profileError;

      const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
      if (authDeleteError && !authDeleteError.message.toLowerCase().includes("not found")) {
        throw authDeleteError;
      }

      return jsonResponse({
        deleted: true,
        retained: "A de-identified deleted-account marker for each affected loyalty card",
      });
    }

    if (action === "adjust_card_stars") {
      const cardId = cleanText(body.cardId, 100);
      const delta = Math.trunc(Number(body.delta));
      if (!cardId || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100) {
        return jsonResponse({ error: "A valid card and point adjustment are required." }, 400);
      }
      const { data: cardRow, error: cardError } = await admin
        .from("cards")
        .select("data")
        .eq("id", cardId)
        .maybeSingle();
      if (cardError) throw cardError;
      if (!cardRow) return jsonResponse({ error: "Card was not found." }, 404);
      const storeId = cleanText(cardRow.data?.storeId, 100);
      const customerId = cleanText(cardRow.data?.customerId, 100);
      if (!actorIsAdmin && !(storeId && await ownsStore(admin, storeId, authData.user.id))) {
        return jsonResponse({ error: "You are not allowed to adjust this card." }, 403);
      }
      const currentStars = Number(cardRow.data?.stars || 0);
      const effectiveDelta = Math.max(delta, -currentStars);
      if (effectiveDelta !== 0) {
        const { error: incrementError } = await admin.rpc("increment_loyalty_totals", {
          p_customer_id: customerId,
          p_card_id: cardId,
          p_points: effectiveDelta,
        });
        if (incrementError) throw incrementError;
      }
      return jsonResponse({ stars: Math.max(0, currentStars + effectiveDelta) });
    }

    if (action === "adjust_card_promotion") {
      const cardId = cleanText(body.cardId, 100);
      const promotionId = cleanText(body.promotionId, 100);
      const delta = Math.trunc(Number(body.delta));
      if (!cardId || !promotionId || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100) {
        return jsonResponse({ error: "A valid card, promotion, and adjustment are required." }, 400);
      }
      const { data: cardRow, error: cardError } = await admin
        .from("cards")
        .select("data")
        .eq("id", cardId)
        .maybeSingle();
      if (cardError) throw cardError;
      if (!cardRow) return jsonResponse({ error: "Card was not found." }, 404);
      const storeId = cleanText(cardRow.data?.storeId, 100);
      if (!actorIsAdmin && !(storeId && await ownsStore(admin, storeId, authData.user.id))) {
        return jsonResponse({ error: "You are not allowed to adjust this card." }, 403);
      }
      const { data: promotionRow, error: promotionError } = await admin
        .from("promotions")
        .select("data")
        .eq("id", promotionId)
        .eq("data->>storeId", storeId)
        .maybeSingle();
      if (promotionError) throw promotionError;
      if (!promotionRow) return jsonResponse({ error: "Promotion was not found for this store." }, 404);
      const progress = cardRow.data?.promoProgress && typeof cardRow.data.promoProgress === "object"
        ? { ...cardRow.data.promoProgress as Record<string, unknown> }
        : {};
      const nextProgress = Math.max(0, Number(progress[promotionId] || 0) + delta);
      progress[promotionId] = nextProgress;
      const { error: updateError } = await admin.from("cards").update({
        data: { ...cardRow.data, promoProgress: progress, updatedAt: timestamp() },
      }).eq("id", cardId);
      if (updateError) throw updateError;
      return jsonResponse({ progress: nextProgress });
    }

    if (action === "delete_store") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const storeId = cleanText(body.storeId, 100);
      if (!storeId) return jsonResponse({ error: "Store is required." }, 400);

      const { data: storeRow, error: storeError } = await admin
        .from("stores")
        .select("data")
        .eq("id", storeId)
        .maybeSingle();
      if (storeError) throw storeError;
      if (!storeRow) return jsonResponse({ error: "Store was not found." }, 404);

      const ownerId = cleanText(storeRow.data?.ownerId, 100);
      const { data: staffRows, error: usersError } = await admin
        .from("users")
        .select("id")
        .eq("data->>storeId", storeId);
      if (usersError) throw usersError;
      const userIds = Array.from(new Set([
        ...(staffRows || []).map((row) => String(row.id)),
        ...(ownerId ? [ownerId] : []),
      ]));

      const driveFileIds = new Set<string>();
      collectDriveFileIds(storeRow.data, driveFileIds);
      for (const table of ["promotions_scanned", "feedback", "cards", "products", "promotions"]) {
        if (table === "products" || table === "promotions") {
          const { data: rows, error: readError } = await admin
            .from(table)
            .select("data")
            .eq("data->>storeId", storeId);
          if (readError) throw readError;
          for (const row of rows || []) collectDriveFileIds(row.data, driveFileIds);
        }
        const { error } = await admin.from(table).delete().eq("data->>storeId", storeId);
        if (error) throw error;
      }
      const { error: deleteStoreError } = await admin.from("stores").delete().eq("id", storeId);
      if (deleteStoreError) throw deleteStoreError;
      if (userIds.length) {
        const { error: deleteProfilesError } = await admin.from("users").delete().in("id", userIds);
        if (deleteProfilesError) throw deleteProfilesError;
        for (const userId of userIds) {
          await admin.auth.admin.deleteUser(userId).catch((error) => {
            console.error("Could not delete Auth user", userId, error);
          });
        }
      }
      for (const fileId of driveFileIds) {
        await deleteDriveFile(fileId).catch((error) => {
          console.error("Could not delete Drive file", fileId, error);
        });
        await admin.from("drive_files").delete().eq("file_id", fileId);
      }

      return jsonResponse({
        deleted: true,
        deletedUsers: userIds.length,
        deletedFiles: driveFileIds.size,
      });
    }

    return jsonResponse({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("admin-backend failed", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Backend operation failed." }, 500);
  }
});

const ownsStore = async (admin: any, storeId: string, ownerId: string) => {
  const { data, error } = await admin
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .eq("data->>ownerId", ownerId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
};

const getUserProfile = async (admin: any, userId: string): Promise<UserProfile | null> => {
  const { data, error } = await admin.from("users").select("data").eq("id", userId).maybeSingle();
  if (error) throw error;
  return (data?.data as UserProfile | undefined) || null;
};

const mergeUserData = async (admin: any, userId: string, patch: Record<string, unknown>) => {
  const profile = await getUserProfile(admin, userId);
  if (!profile) throw new Error("User profile was not found.");
  const { error } = await admin.from("users").update({
    data: { ...profile, ...patch, updatedAt: timestamp() },
  }).eq("id", userId);
  if (error) throw error;
};

const DRIVE_FILE_ID_PATTERNS = [
  /\/file\/d\/([a-zA-Z0-9_-]+)/,
  /[?&]id=([a-zA-Z0-9_-]+)/,
  /[?&]fileId=([a-zA-Z0-9_-]+)/,
  /\/d\/([a-zA-Z0-9_-]+)/,
];

const collectDriveFileIds = (value: unknown, result: Set<string>) => {
  if (typeof value === "string") {
    for (const pattern of DRIVE_FILE_ID_PATTERNS) {
      const match = value.match(pattern);
      if (match?.[1]) result.add(match[1]);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectDriveFileIds(entry, result));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((entry) => collectDriveFileIds(entry, result));
  }
};

const deleteDriveFile = async (fileId: string) => {
  const secret = requiredEnv("DRIVE_CRUD_SECRET");
  const url = Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") || DEFAULT_GAS_UPLOAD_URL;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "delete", secret, fileId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || `Drive delete failed with HTTP ${response.status}.`);
};

const permanentlyDeleteDriveFile = async (fileId: string) => {
  const secret = requiredEnv("DRIVE_CRUD_SECRET");
  const url = Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") || DEFAULT_GAS_UPLOAD_URL;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "permanent_delete", secret, fileId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.permanentlyDeleted) {
    throw new Error(data.error || `Drive permanent deletion failed with HTTP ${response.status}.`);
  }
};

const deletionProofPayload = (userId: string, expiresAt: number) => `${userId}.${expiresAt}`;

const createDeletionProof = async (secret: string, userId: string, expiresAt: number) => {
  const payload = deletionProofPayload(userId, expiresAt);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${expiresAt}.${bytesToHex(new Uint8Array(signature))}`;
};

const verifyDeletionProof = async (secret: string, proof: string, userId: string) => {
  const [expiresText, signatureHex, ...rest] = proof.split(".");
  const expiresAt = Number(expiresText);
  if (rest.length || !Number.isFinite(expiresAt) || expiresAt < Date.now() || !/^[a-f0-9]{64}$/.test(signatureHex || "")) {
    return false;
  }
  const expected = await createDeletionProof(secret, userId, expiresAt);
  return timingSafeEqual(expected, proof);
};

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

const verifyDeletionOtp = async (otpToken: string, otpCode: string, email: string) => {
  const url = Deno.env.get("GAS_EMAIL_URL") ||
    Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") ||
    DEFAULT_GAS_UPLOAD_URL;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "verify_otp",
      otpToken,
      otpCode,
      recipientEmail: email,
      // The deployed GAS service currently supports this identity-verification purpose.
      // This endpoint only verifies the code; it never updates the user's email.
      purpose: "email_change",
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.otp?.verified) {
    throw new Error(data.error || "The deletion OTP is invalid or expired.");
  }
};
