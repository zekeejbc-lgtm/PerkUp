import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

const DEFAULT_GAS_UPLOAD_URL =
  "https://script.google.com/macros/s/AKfycbxfacR_tG28iu-riTquHZK9fRHN1aRAswJNUXAdRD36dd-YlxoqskAzQkgQvm1BWUQ/exec";
const DEFAULT_APP_URL = "https://perk-up-navy.vercel.app";

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

const isStrongPassword = (password: string, name: string, email: string) => {
  const normalized = password.toLowerCase();
  const personalTerms = [
    ...name.toLowerCase().split(/[^a-z0-9]+/),
    email.toLowerCase().split("@")[0],
  ].filter((term) => term.length >= 3);
  return password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password) &&
    personalTerms.every((term) => !normalized.includes(term));
};

type UserProfile = {
  role?: string;
  storeId?: string;
  email?: string;
  name?: string;
  username?: string;
  forcePasswordReset?: boolean;
  branchLimit?: number;
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
      if (!email || !name || !storeName || !isStrongPassword(password, name, email)) {
        return jsonResponse({ error: "Use a 12+ character password with upper and lowercase letters, a number, a symbol, and no owner name or email." }, 400);
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
        storeId,
        branchLimit: Math.max(1, Math.min(100, Math.trunc(Number(storeInput.branchLimit || 1)))),
        forcePasswordReset: Boolean(body.forcePasswordReset),
        createdAt: timestamp(),
        updatedAt: timestamp(),
      };
      const store = {
        ...storeInput,
        name: storeName,
        businessName: cleanText(storeInput.businessName, 120) || storeName,
        branchName: cleanText(storeInput.branchName, 80) || "Main",
        isPrimaryBranch: true,
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

      let notification = { sent: false, error: "" };
      try {
        const ownerPortalUrl =
          `${(Deno.env.get("APP_URL") || DEFAULT_APP_URL).replace(/\/+$/, "")}/owner`;
        const { data: loginLinkData, error: loginLinkError } =
          await admin.auth.admin.generateLink({
            type: "magiclink",
            email,
            options: { redirectTo: ownerPortalUrl },
          });
        if (loginLinkError || !loginLinkData.properties?.action_link) {
          throw loginLinkError || new Error("One-time owner login link could not be generated.");
        }

        await sendStoreCreatedEmail({
          recipientEmail: email,
          userName: name,
          store,
          requirePasswordChange: Boolean(body.forcePasswordReset),
          loginLink: loginLinkData.properties.action_link,
        });
        notification = { sent: true, error: "" };
      } catch (emailError) {
        notification.error = emailError instanceof Error ? emailError.message : "Store email could not be sent.";
        console.error("Store creation email failed", { storeId, ownerId, error: notification.error });
      }

      return jsonResponse({
        store: { id: storeId, ...store },
        owner: { id: ownerId, ...profile },
        notification,
      });
    }

    if (action === "create_branch") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const ownerId = cleanText(body.ownerId, 100);
      const storeInput = body.store && typeof body.store === "object"
        ? body.store as Record<string, unknown>
        : {};
      const branchName = cleanText(storeInput.branchName || storeInput.name, 80);
      const branchAddress = cleanText(storeInput.address || storeInput.location, 300);
      const branchLatitude = Number(storeInput.lat);
      const branchLongitude = Number(storeInput.lng);
      const hasValidCoordinates = storeInput.lat !== null && storeInput.lat !== undefined &&
        storeInput.lat !== "" && storeInput.lng !== null && storeInput.lng !== undefined &&
        storeInput.lng !== "" && Number.isFinite(branchLatitude) &&
        branchLatitude >= -90 && branchLatitude <= 90 &&
        Number.isFinite(branchLongitude) &&
        branchLongitude >= -180 && branchLongitude <= 180;
      if (!ownerId || !branchName || !branchAddress || !hasValidCoordinates) {
        return jsonResponse({ error: "An owner, branch label, address, and valid map location are required." }, 400);
      }
      const ownerProfile = await getUserProfile(admin, ownerId);
      if (!ownerProfile || ownerProfile.role !== "store_owner") {
        return jsonResponse({ error: "Store owner was not found." }, 404);
      }
      const { count, error: countError } = await admin
        .from("stores")
        .select("id", { count: "exact", head: true })
        .eq("data->>ownerId", ownerId);
      if (countError) throw countError;
      const branchLimit = Math.max(1, Math.min(100, Math.trunc(Number(ownerProfile.branchLimit || 1))));
      if ((count || 0) >= branchLimit) {
        return jsonResponse({ error: `This owner has reached the ${branchLimit}-branch limit.` }, 409);
      }
      const { data: primaryStore, error: primaryError } = await admin
        .from("stores")
        .select("id,data")
        .eq("data->>ownerId", ownerId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (primaryError) throw primaryError;
      if (!primaryStore) return jsonResponse({ error: "Primary store was not found." }, 404);
      const businessName = cleanText(primaryStore.data?.businessName || primaryStore.data?.name, 120);
      const storeName = `${businessName} - ${branchName}`;
      const storeId = crypto.randomUUID();
      const store = {
        ...storeInput,
        name: storeName,
        businessName,
        branchName,
        address: branchAddress,
        location: branchAddress,
        lat: branchLatitude,
        lng: branchLongitude,
        parentStoreId: cleanText(primaryStore.data?.parentStoreId, 100) || String(primaryStore.id),
        isPrimaryBranch: false,
        ownerId,
        status: ["pending", "active", "suspended"].includes(String(storeInput.status))
          ? String(storeInput.status)
          : "active",
        createdAt: timestamp(),
        updatedAt: timestamp(),
      };
      const { error: storeError } = await admin.from("stores").insert({ id: storeId, data: store });
      if (storeError) throw storeError;
      return jsonResponse({ store: { id: storeId, ...store } });
    }

    if (action === "decide_branch_request") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const requestId = cleanText(body.requestId, 100);
      const decision = cleanText(body.decision, 20);
      if (!requestId || !["approved", "denied"].includes(decision)) {
        return jsonResponse({ error: "A branch request and valid decision are required." }, 400);
      }

      const { data: requestRow, error: requestError } = await admin
        .from("branch_requests")
        .select("id,data")
        .eq("id", requestId)
        .maybeSingle();
      if (requestError) throw requestError;
      if (!requestRow) return jsonResponse({ error: "Branch request was not found." }, 404);

      const request = (requestRow.data || {}) as Record<string, unknown>;
      if (request.status !== "pending") {
        return jsonResponse({ error: "This branch request has already been reviewed." }, 409);
      }

      const reviewedAt = timestamp();
      if (decision === "denied") {
        const deniedRequest = {
          ...request,
          status: "denied",
          reviewedAt,
          reviewedBy: authData.user.id,
          updatedAt: reviewedAt,
        };
        const { data: deniedRows, error: denyError } = await admin
          .from("branch_requests")
          .update({ data: deniedRequest })
          .eq("id", requestId)
          .eq("data->>status", "pending")
          .select("id");
        if (denyError) throw denyError;
        if (!deniedRows?.length) return jsonResponse({ error: "This branch request has already been reviewed." }, 409);
        return jsonResponse({ request: { id: requestId, ...deniedRequest } });
      }

      const ownerId = cleanText(request.ownerId, 100);
      const branchName = cleanText(request.branchName, 80);
      const branchAddress = cleanText(request.address, 300);
      const branchLatitude = Number(request.lat);
      const branchLongitude = Number(request.lng);
      if (!ownerId || !branchName || !branchAddress || !Number.isFinite(branchLatitude) ||
        branchLatitude < -90 || branchLatitude > 90 || !Number.isFinite(branchLongitude) ||
        branchLongitude < -180 || branchLongitude > 180) {
        return jsonResponse({ error: "The branch request has incomplete or invalid location details." }, 400);
      }

      const ownerProfile = await getUserProfile(admin, ownerId);
      if (!ownerProfile || ownerProfile.role !== "store_owner") {
        return jsonResponse({ error: "Store owner was not found." }, 404);
      }
      const { count, error: countError } = await admin
        .from("stores")
        .select("id", { count: "exact", head: true })
        .eq("data->>ownerId", ownerId);
      if (countError) throw countError;
      const branchLimit = Math.max(1, Math.min(100, Math.trunc(Number(ownerProfile.branchLimit || 1))));
      if ((count || 0) >= branchLimit) {
        return jsonResponse({ error: `This owner has reached the ${branchLimit}-branch limit.` }, 409);
      }

      const { data: primaryStore, error: primaryError } = await admin
        .from("stores")
        .select("id,data")
        .eq("data->>ownerId", ownerId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (primaryError) throw primaryError;
      if (!primaryStore) return jsonResponse({ error: "Primary store was not found." }, 404);

      const primaryData = (primaryStore.data || {}) as Record<string, unknown>;
      const businessName = cleanText(primaryData.businessName || primaryData.name, 120);
      const storeId = crypto.randomUUID();
      const processingRequest = {
        ...request,
        status: "processing",
        updatedAt: reviewedAt,
      };
      const { data: claimedRows, error: claimError } = await admin
        .from("branch_requests")
        .update({ data: processingRequest })
        .eq("id", requestId)
        .eq("data->>status", "pending")
        .select("id");
      if (claimError) throw claimError;
      if (!claimedRows?.length) {
        return jsonResponse({ error: "This branch request has already been reviewed." }, 409);
      }
      const store = {
        name: `${businessName} - ${branchName}`,
        businessName,
        branchName,
        address: branchAddress,
        location: branchAddress,
        lat: branchLatitude,
        lng: branchLongitude,
        parentStoreId: cleanText(primaryData.parentStoreId, 100) || String(primaryStore.id),
        isPrimaryBranch: false,
        ownerId,
        status: "active",
        logoUrl: primaryData.logoUrl || "",
        category: primaryData.category || "",
        subscriptionLevel: primaryData.subscriptionLevel || "",
        subscriptionStart: primaryData.subscriptionStart || null,
        subscriptionEnd: primaryData.subscriptionEnd || null,
        paymentSchedule: primaryData.paymentSchedule || "",
        createdAt: reviewedAt,
        updatedAt: reviewedAt,
      };
      const { error: storeError } = await admin.from("stores").insert({ id: storeId, data: store });
      if (storeError) {
        await admin.from("branch_requests").update({ data: request }).eq("id", requestId).eq("data->>status", "processing");
        throw storeError;
      }

      const approvedRequest = {
        ...request,
        status: "approved",
        storeId,
        reviewedAt,
        reviewedBy: authData.user.id,
        updatedAt: reviewedAt,
      };
      const { error: approveError } = await admin
        .from("branch_requests")
        .update({ data: approvedRequest })
        .eq("id", requestId)
        .eq("data->>status", "processing");
      if (approveError) {
        await admin.from("stores").delete().eq("id", storeId);
        throw approveError;
      }
      return jsonResponse({
        request: { id: requestId, ...approvedRequest },
        store: { id: storeId, ...store },
      });
    }

    if (action === "set_branch_limit") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const ownerId = cleanText(body.ownerId, 100);
      const branchLimit = Math.trunc(Number(body.branchLimit));
      if (!ownerId || !Number.isInteger(branchLimit) || branchLimit < 1 || branchLimit > 100) {
        return jsonResponse({ error: "Branch limit must be between 1 and 100." }, 400);
      }
      const ownerProfile = await getUserProfile(admin, ownerId);
      if (!ownerProfile || ownerProfile.role !== "store_owner") {
        return jsonResponse({ error: "Store owner was not found." }, 404);
      }
      await mergeUserData(admin, ownerId, { branchLimit });
      return jsonResponse({ updated: true, branchLimit });
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
      if (!email || !name || !isStrongPassword(password, name, email)) {
        return jsonResponse({ error: "Use a 12+ character password with upper and lowercase letters, a number, a symbol, and no account name or email." }, 400);
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
        forcePasswordReset: Boolean(body.forcePasswordReset),
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

      let notification = { sent: false, error: "" };
      if (role === "staff") {
        try {
          const staffPortalUrl =
            `${(Deno.env.get("APP_URL") || DEFAULT_APP_URL).replace(/\/+$/, "")}/staff`;
          const { data: loginLinkData, error: loginLinkError } =
            await admin.auth.admin.generateLink({
              type: "magiclink",
              email,
              options: { redirectTo: staffPortalUrl },
            });
          if (loginLinkError || !loginLinkData.properties?.action_link) {
            throw loginLinkError || new Error("One-time staff login link could not be generated.");
          }
          const { data: storeRow, error: storeError } = await admin
            .from("stores")
            .select("data")
            .eq("id", storeId)
            .maybeSingle();
          if (storeError) throw storeError;
          await sendStaffCreatedEmail({
            recipientEmail: email,
            userName: name,
            storeName: cleanText(storeRow?.data?.name, 120) || "your store",
            requirePasswordChange: Boolean(body.forcePasswordReset),
            loginLink: loginLinkData.properties.action_link,
          });
          notification = { sent: true, error: "" };
        } catch (emailError) {
          notification.error = emailError instanceof Error ? emailError.message : "Staff email could not be sent.";
          console.error("Staff creation email failed", { userId: created.user.id, storeId, error: notification.error });
        }
      }

      return jsonResponse({ user: { id: created.user.id, ...profile }, notification });
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

    if (action === "complete_first_login_password_change") {
      if (!actor.forcePasswordReset) {
        return jsonResponse({ error: "A first-login password change is not required." }, 400);
      }
      const password = String(body.password || "");
      const accountName = cleanText(actor.name, 80);
      const accountEmail = cleanText(actor.email || authData.user.email, 254).toLowerCase();
      if (!isStrongPassword(password, accountName, accountEmail)) {
        return jsonResponse({ error: "Use a 12+ character password with upper and lowercase letters, a number, a symbol, and no account name or email." }, 400);
      }
      const { error: passwordError } = await admin.auth.admin.updateUserById(authData.user.id, { password });
      if (passwordError) throw passwordError;
      await mergeUserData(admin, authData.user.id, {
        forcePasswordReset: false,
        passwordChangedAt: timestamp(),
        updatedAt: timestamp(),
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
      const { count: remainingBranchCount, error: branchCountError } = ownerId
        ? await admin
          .from("stores")
          .select("id", { count: "exact", head: true })
          .eq("data->>ownerId", ownerId)
          .neq("id", storeId)
        : { count: 0, error: null };
      if (branchCountError) throw branchCountError;
      const deleteOwner = Boolean(ownerId) && (remainingBranchCount || 0) === 0;
      const userIds = Array.from(new Set([
        ...(staffRows || []).map((row) => String(row.id)),
        ...(deleteOwner ? [ownerId] : []),
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

const emailDate = (value: unknown) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "seconds" in value) {
    const seconds = Number((value as { seconds?: unknown }).seconds);
    if (Number.isFinite(seconds)) {
      return new Intl.DateTimeFormat("en-PH", {
        dateStyle: "long",
        timeZone: "Asia/Manila",
      }).format(new Date(seconds * 1000));
    }
  }
  return "";
};

const paymentScheduleLabel = (value: unknown) => {
  const schedule = cleanText(value, 60);
  if (schedule === "every_30_days") return "Every 30 days from subscription start";
  return schedule.replaceAll("_", " ");
};

const sendStoreCreatedEmail = async ({
  recipientEmail,
  userName,
  store,
  requirePasswordChange,
  loginLink,
}: {
  recipientEmail: string;
  userName: string;
  store: Record<string, unknown>;
  requirePasswordChange: boolean;
  loginLink: string;
}) => {
  const url = Deno.env.get("GAS_EMAIL_URL") ||
    Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") ||
    DEFAULT_GAS_UPLOAD_URL;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "store_created",
      secret: requiredEnv("DRIVE_CRUD_SECRET"),
      recipientEmail,
      userName,
      requirePasswordChange,
      loginLink,
      store: {
        name: cleanText(store.name, 120),
        location: cleanText(store.location || store.address, 240),
        logoUrl: cleanText(store.logoUrl, 2000),
        subscriptionLevel: cleanText(store.subscriptionLevel, 80),
        paymentSchedule: paymentScheduleLabel(store.paymentSchedule),
        subscriptionStart: emailDate(store.subscriptionStart),
        subscriptionEnd: emailDate(store.subscriptionEnd),
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.email) {
    throw new Error(data.error || `Store email failed with HTTP ${response.status}.`);
  }
};

const sendStaffCreatedEmail = async ({
  recipientEmail,
  userName,
  storeName,
  requirePasswordChange,
  loginLink,
}: {
  recipientEmail: string;
  userName: string;
  storeName: string;
  requirePasswordChange: boolean;
  loginLink: string;
}) => {
  const url = Deno.env.get("GAS_EMAIL_URL") ||
    Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") ||
    DEFAULT_GAS_UPLOAD_URL;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "staff_created",
      secret: requiredEnv("DRIVE_CRUD_SECRET"),
      recipientEmail,
      userName,
      storeName,
      requirePasswordChange,
      loginLink,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.email) {
    throw new Error(data.error || `Staff email failed with HTTP ${response.status}.`);
  }
};
