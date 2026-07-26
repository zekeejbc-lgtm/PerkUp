import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { sessionNeedsMfa } from "../_shared/auth.ts";
import { maintenanceError, readRuntimeConfig } from "../_shared/runtime.ts";

const DEFAULT_GAS_UPLOAD_URL =
  "https://script.google.com/macros/s/AKfycbxfacR_tG28iu-riTquHZK9fRHN1aRAswJNUXAdRD36dd-YlxoqskAzQkgQvm1BWUQ/exec";

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const DRIVE_FILE_ID_PATTERNS = [
  /\/file\/d\/([a-zA-Z0-9_-]+)/,
  /[?&]id=([a-zA-Z0-9_-]+)/,
  /[?&]fileId=([a-zA-Z0-9_-]+)/,
  /\/d\/(?:\$\$)?([a-zA-Z0-9_-]+)/,
  /\/d\/([a-zA-Z0-9_-]+)/,
];

type GasImageResponse = {
  success?: boolean;
  error?: string;
  url?: string;
  webViewLink?: string;
  fileId?: string;
  file?: Record<string, unknown>;
};

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const cleanText = (value: unknown, maxLength: number) =>
  String(value || "").trim().slice(0, maxLength);

const safeSegment = (value: unknown) =>
  cleanText(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "unknown";

const timestampSegment = (date = new Date()) => {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
};

const extractDriveFileId = (value: unknown) => {
  const url = String(value || "").trim();
  if (!url) return "";

  try {
    const parsedUrl = new URL(url);
    const queryId = parsedUrl.searchParams.get("id") || parsedUrl.searchParams.get("fileId");
    if (queryId && /^[a-zA-Z0-9_-]+$/.test(queryId)) return queryId;
  } catch {
    // Fall through
  }

  for (const pattern of DRIVE_FILE_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }

  return /^[a-zA-Z0-9_-]+$/.test(url) ? url : "";
};

// Fixing the URL format here to the standard Google Drive direct-view embed format
const normalizeDriveImageUrl = (url: string) => {
  const fileId = extractDriveFileId(url);
  return fileId ? `https://lh3.googleusercontent.com/d/${fileId}=w4000` : url;
};

const buildUploadFileName = (body: Record<string, unknown>, userId: string) => {
  const originalName = cleanText(body.fileName, 120);
  const extension = originalName.match(/\.[a-zA-Z0-9]{1,12}$/)?.[0]?.toLowerCase() || "";
  return `${safeSegment(body.owner || userId)}_${safeSegment(body.purpose || "image")}_${timestampSegment()}${extension}`;
};

const callDriveScript = async (payload: Record<string, unknown>) => {
  console.log(`[GAS Call] Sending payload to Google Apps Script... Action: ${payload.action}`);
  const response = await fetch(Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") || DEFAULT_GAS_UPLOAD_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.error(`[GAS Error] HTTP Status: ${response.status}`);
    throw new Error(`Google Drive action failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as GasImageResponse;
  console.log(`[GAS Response] Received data from Google:`, JSON.stringify(data));
  
  if (!data.success) {
    console.error(`[GAS Error] Google Script returned success: false. Error: ${data.error}`);
    throw new Error(data.error || "Google Drive action failed.");
  }

  return data;
};

Deno.serve(async (req) => {
  console.log(`\n--- NEW REQUEST STARTED ---`);
  console.log(`[Req] Method: ${req.method}, URL: ${req.url}`);

  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    console.log(`[Auth] Checking Supabase credentials and authenticating user...`);
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
    const runtime = await readRuntimeConfig(admin);
    if (runtime.mode === "maintenance") return jsonResponse(maintenanceError(runtime), 503);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      console.error(`[Auth Error] User authentication failed.`, authError);
      return jsonResponse({ error: "Authentication required." }, 401);
    }
    if (await sessionNeedsMfa(userClient, authorization)) {
      return jsonResponse({ error: "Complete multi-factor authentication to continue.", code: "mfa_required" }, 403);
    }
    console.log(`[Auth] Authenticated user ID: ${authData.user.id}`);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = cleanText(body.action || "upload", 20).toLowerCase();
    console.log(`[Action] Requested Action: '${action}'`);

    const { data: actorRow, error: actorError } = await admin
      .from("users")
      .select("data")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (actorError) throw actorError;
    if (["suspended", "banned"].includes(String(actorRow?.data?.accountStatus || "active"))) {
      return jsonResponse({ error: `This account is ${actorRow?.data?.accountStatus}.` }, 403);
    }
    if (actorRow?.data?.isDemo === true) {
      return jsonResponse({ error: "External file uploads are disabled inside demo sandboxes." }, 403);
    }
    const isAdmin = ["admin", "assistant_admin", "auditor"].includes(String(actorRow?.data?.role || ""));

    const getAuthorizedFile = async (fileId: string) => {
      const { data: fileRow, error: fileError } = await admin
        .from("drive_files")
        .select("file_id,owner_id,purpose,url,created_at")
        .eq("file_id", fileId)
        .maybeSingle();
      if (fileError) throw fileError;
      if (!fileRow) return { error: jsonResponse({ error: "Image was not found." }, 404), fileRow: null };
      if (!isAdmin && fileRow.owner_id !== authData.user.id) {
        return { error: jsonResponse({ error: "You are not allowed to manage this image." }, 403), fileRow: null };
      }
      return { error: null, fileRow };
    };

    if (action === "upload") {
      const mimeType = cleanText(body.mimeType, 80).toLowerCase();
      console.log(`[Validation] Checking image type: ${mimeType}`);
      if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) return jsonResponse({ error: "Unsupported image type." }, 400);
      
      const base64 = String(body.base64 || "");
      if (!base64.startsWith("data:image/")) return jsonResponse({ error: "Missing image data." }, 400);
      
      const estimatedBytes = Math.ceil((base64.length - (base64.indexOf(",") + 1)) * 0.75);
      console.log(`[Validation] Estimated file size: ${(estimatedBytes / 1024 / 1024).toFixed(2)} MB`);
      if (estimatedBytes > MAX_IMAGE_BYTES) return jsonResponse({ error: "Image must be 6 MB or smaller." }, 413);

      const fileName = buildUploadFileName(body, authData.user.id);
      console.log(`[Upload] Uploading file as: ${fileName}`);

      const uploaded = await callDriveScript({
        action: "upload",
        secret: requiredEnv("DRIVE_CRUD_SECRET"),
        fileName,
        mimeType,
        base64,
      });

      const uploadedUrl = uploaded.url || uploaded.webViewLink || "";
      const fileId = uploaded.fileId || extractDriveFileId(uploadedUrl);
      console.log(`[Process] Extracted File ID: '${fileId}' from URL: '${uploadedUrl}'`);

      if (!fileId) {
        console.error(`[Process Error] Could not extract a valid fileId from Google Drive.`);
        return jsonResponse({ error: "Drive did not return a valid file ID." }, 502);
      }

      const normalizedUrl = normalizeDriveImageUrl(uploadedUrl);
      console.log(`[Process] Translated to permanent Image URL: ${normalizedUrl}`);

      console.log(`[Database] Attempting to save new record into Supabase 'drive_files' table...`);
      const requestedOwnerId = cleanText(body.ownerId, 36);
      if (requestedOwnerId && requestedOwnerId !== authData.user.id && !isAdmin) {
        await callDriveScript({
          action: "permanent_delete",
          secret: requiredEnv("DRIVE_CRUD_SECRET"),
          fileId,
        }).catch(console.error);
        return jsonResponse({ error: "Only an administrator can assign an image to another owner." }, 403);
      }

      const { error: registryError } = await admin.from("drive_files").upsert({
        file_id: fileId,
        owner_id: requestedOwnerId || authData.user.id,
        purpose: cleanText(body.purpose || "image", 80),
        url: normalizedUrl,
      });

      if (registryError) {
        console.error("[Database Error] Supabase upsert failed!", registryError);
        const secret = Deno.env.get("DRIVE_CRUD_SECRET");
        if (secret) {
          console.log(`[Rollback] Attempting to delete stranded file from Google Drive...`);
          await callDriveScript({ action: "permanent_delete", secret, fileId }).catch((cleanupError) => {
            console.error("[Rollback Error] Could not roll back unregistered Drive file", cleanupError);
          });
        }
        return jsonResponse({ error: "Uploaded image could not be registered." }, 500);
      }

      console.log(`[Success] Image successfully uploaded and registered! Request complete.\n`);
      return jsonResponse({
        fileId,
        url: normalizedUrl,
      });
    }

    if (action === "read" || action === "get") {
      const secret = requiredEnv("DRIVE_CRUD_SECRET");
      const fileId = extractDriveFileId(body.fileId || body.url);
      if (!fileId) return jsonResponse({ error: "Missing Drive file ID." }, 400);
      const authorized = await getAuthorizedFile(fileId);
      if (authorized.error) return authorized.error;

      const driveFile = await callDriveScript({ action: "read", secret, fileId });
      return jsonResponse({ fileId, url: authorized.fileRow!.url, registry: authorized.fileRow, file: driveFile.file });
    }

    if (action === "update") {
      const secret = requiredEnv("DRIVE_CRUD_SECRET");
      const fileId = extractDriveFileId(body.fileId || body.url);
      if (!fileId) return jsonResponse({ error: "Missing Drive file ID." }, 400);
      const authorized = await getAuthorizedFile(fileId);
      if (authorized.error) return authorized.error;

      const fileName = cleanText(body.fileName, 120);
      const description = cleanText(body.description, 500);
      if (!fileName && typeof body.description === "undefined") {
        return jsonResponse({ error: "Provide a file name or description to update." }, 400);
      }
      const updated = await callDriveScript({
        action: "update",
        secret,
        fileId,
        ...(fileName ? { fileName } : {}),
        ...(typeof body.description !== "undefined" ? { description } : {}),
      });
      const updatedUrl = normalizeDriveImageUrl(updated.url || authorized.fileRow!.url);
      const { error: registryUpdateError } = await admin
        .from("drive_files")
        .update({ url: updatedUrl })
        .eq("file_id", fileId);
      if (registryUpdateError) throw registryUpdateError;
      return jsonResponse({ fileId, url: updatedUrl, updated: true, file: updated });
    }

    if (action === "delete") {
      console.log(`[Delete] Initiating delete protocol for file...`);
      // Delete logic remains the same...
      // (Truncating logs here to keep it concise, upload is our main focus right now)
      const secret = requiredEnv("DRIVE_CRUD_SECRET");
      const fileId = extractDriveFileId(body.fileId || body.url);
      if (!fileId) return jsonResponse({ error: "Missing Drive file ID." }, 400);

      const authorized = await getAuthorizedFile(fileId);
      if (authorized.error) return authorized.error;

      await callDriveScript({ action: "permanent_delete", secret, fileId });
      const { error: registryDeleteError } = await admin.from("drive_files").delete().eq("file_id", fileId);
      if (registryDeleteError) throw registryDeleteError;
      console.log(`[Delete Success] File ${fileId} removed from Drive and database.`);
      return jsonResponse({ deleted: true, fileId });
    }

    return jsonResponse({ error: "Unsupported Drive action." }, 400);
  } catch (error) {
    console.error("[Fatal Error] Uncaught exception in drive-image function:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Drive image action failed." }, 500);
  }
});
