import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { sessionNeedsMfa } from "../_shared/auth.ts";
import { maintenanceError, readRuntimeConfig } from "../_shared/runtime.ts";

const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbxfacR_tG28iu-riTquHZK9fRHN1aRAswJNUXAdRD36dd-YlxoqskAzQkgQvm1BWUQ/exec";
const ACTIONS = new Set(["hide", "show", "remove"]);
const DRIVE_ID_PATTERNS = [
  /[?&](?:id|fileId)=([a-zA-Z0-9_-]+)/,
  /\/d\/(?:\$\$)?([a-zA-Z0-9_-]+)/,
];

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const cleanText = (value: unknown, maxLength: number) =>
  String(value || "").trim().slice(0, maxLength);

const extractDriveFileId = (value: unknown) => {
  const url = cleanText(value, 1200);
  for (const pattern of DRIVE_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
};

const permanentlyDeleteDriveFile = async (fileId: string) => {
  const response = await fetch(Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") || DEFAULT_GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "permanent_delete",
      secret: requiredEnv("DRIVE_CRUD_SECRET"),
      fileId,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error || `Drive delete failed with HTTP ${response.status}.`);
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const authorization = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, requiredEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const admin = createClient(supabaseUrl, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    const runtime = await readRuntimeConfig(admin);
    if (runtime.mode === "maintenance") return jsonResponse(maintenanceError(runtime), 503);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: "Authentication required." }, 401);
    if (await sessionNeedsMfa(userClient, authorization)) {
      return jsonResponse({ error: "Complete multi-factor authentication to continue.", code: "mfa_required" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = cleanText(body.action, 12).toLowerCase();
    const reviewId = cleanText(body.reviewId, 80);
    if (!ACTIONS.has(action) || !reviewId) return jsonResponse({ error: "Choose a valid review moderation action." }, 400);

    const [{ data: actor, error: actorError }, { data: review, error: reviewError }] = await Promise.all([
      admin.from("users").select("data").eq("id", authData.user.id).maybeSingle(),
      admin.from("store_reviews").select("id,data").eq("id", reviewId).maybeSingle(),
    ]);
    if (actorError) throw actorError;
    if (reviewError) throw reviewError;
    if (!actor || ["suspended", "banned"].includes(String(actor.data?.accountStatus || "active"))) {
      return jsonResponse({ error: "This account cannot moderate reviews." }, 403);
    }
    if (!review) return jsonResponse({ error: "Review not found." }, 404);

    const storeId = cleanText(review.data?.storeId, 80);
    const role = cleanText(actor.data?.role, 40);
    const isAdministrator = role === "admin" || role === "assistant_admin";
    let ownsStore = false;
    if (!isAdministrator && role === "store_owner" && storeId) {
      const { data: ownedStore, error: storeError } = await admin
        .from("stores")
        .select("id")
        .eq("id", storeId)
        .eq("data->>ownerId", authData.user.id)
        .maybeSingle();
      if (storeError) throw storeError;
      ownsStore = Boolean(ownedStore);
    }
    if (!isAdministrator && !ownsStore) {
      return jsonResponse({ error: "You are not allowed to moderate this review." }, 403);
    }

    if (action === "hide" || action === "show") {
      const nextData = { ...(review.data || {}) };
      if (action === "hide") {
        nextData.hidden = true;
        nextData.hiddenAt = new Date().toISOString();
        nextData.hiddenBy = authData.user.id;
      } else {
        delete nextData.hidden;
        delete nextData.hiddenAt;
        delete nextData.hiddenBy;
      }
      const { error: updateError } = await admin.from("store_reviews").update({ data: nextData }).eq("id", reviewId);
      if (updateError) throw updateError;
      return jsonResponse({ action, reviewId, hidden: action === "hide" });
    }

    const imageUrls = Array.isArray(review.data?.imageUrls)
      ? review.data.imageUrls.map((value: unknown) => cleanText(value, 1200)).filter(Boolean)
      : [];
    const { error: deleteError } = await admin.from("store_reviews").delete().eq("id", reviewId);
    if (deleteError) throw deleteError;

    let cleanupFailures = 0;
    for (const imageUrl of imageUrls) {
      const fileId = extractDriveFileId(imageUrl);
      if (!fileId) continue;
      try {
        await permanentlyDeleteDriveFile(fileId);
        const { error: registryError } = await admin.from("drive_files").delete().eq("file_id", fileId);
        if (registryError) throw registryError;
      } catch (cleanupError) {
        cleanupFailures += 1;
        console.error("Review image cleanup failed", { reviewId, fileId, cleanupError });
      }
    }
    return jsonResponse({ action, reviewId, removed: true, cleanupFailures });
  } catch (error) {
    console.error("store-review-moderation failed", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Review moderation failed." }, 500);
  }
});
