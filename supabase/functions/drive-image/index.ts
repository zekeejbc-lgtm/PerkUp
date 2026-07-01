import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

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
  /\/d\/([a-zA-Z0-9_-]+)/,
];

type GasImageResponse = {
  success?: boolean;
  error?: string;
  url?: string;
  webViewLink?: string;
  fileId?: string;
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
    // Fall through to regex extraction.
  }

  for (const pattern of DRIVE_FILE_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }

  return /^[a-zA-Z0-9_-]+$/.test(url) ? url : "";
};

export function normalizeDriveImageUrl(url: string): string {
  const trimmedUrl = String(url || "").trim();
  const fileId = extractDriveFileId(trimmedUrl);
  return fileId ? `https://lh3.googleusercontent.com/d/$$${fileId}=w4000` : trimmedUrl;
}

const buildUploadFileName = (body: Record<string, unknown>, userId: string) => {
  const originalName = cleanText(body.fileName, 120);
  const extension = originalName.match(/\.[a-zA-Z0-9]{1,12}$/)?.[0]?.toLowerCase() || "";
  return `${safeSegment(body.owner || userId)}_${safeSegment(body.purpose || "image")}_${timestampSegment()}${extension}`;
};

const callDriveScript = async (payload: Record<string, unknown>) => {
  const response = await fetch(Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") || DEFAULT_GAS_UPLOAD_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Google Drive action failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as GasImageResponse;
  if (!data.success) {
    throw new Error(data.error || "Google Drive action failed.");
  }

  return data;
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

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = cleanText(body.action || "upload", 20).toLowerCase();

    if (action === "upload") {
      const mimeType = cleanText(body.mimeType, 80).toLowerCase();
      const base64 = String(body.base64 || "");
      if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) return jsonResponse({ error: "Unsupported image type." }, 400);
      if (!base64.startsWith("data:image/")) return jsonResponse({ error: "Missing image data." }, 400);
      const estimatedBytes = Math.ceil((base64.length - (base64.indexOf(",") + 1)) * 0.75);
      if (estimatedBytes > MAX_IMAGE_BYTES) return jsonResponse({ error: "Image must be 6 MB or smaller." }, 413);

      const uploaded = await callDriveScript({
        action: "upload",
        fileName: buildUploadFileName(body, authData.user.id),
        mimeType,
        base64,
      });
      const uploadedUrl = uploaded.url || uploaded.webViewLink || "";
      const fileId = uploaded.fileId || extractDriveFileId(uploadedUrl);
      if (!fileId) return jsonResponse({ error: "Drive did not return a valid file ID." }, 502);
      const normalizedUrl = normalizeDriveImageUrl(uploadedUrl);
      const { error: registryError } = await admin.from("drive_files").upsert({
        file_id: fileId,
        owner_id: authData.user.id,
        purpose: cleanText(body.purpose || "image", 80),
        url: normalizedUrl,
      });
      if (registryError) {
        console.error("Could not register uploaded Drive file", registryError);
        const secret = Deno.env.get("DRIVE_CRUD_SECRET");
        if (secret) {
          await callDriveScript({ action: "delete", secret, fileId }).catch((cleanupError) => {
            console.error("Could not roll back unregistered Drive file", cleanupError);
          });
        }
        return jsonResponse({ error: "Uploaded image could not be registered." }, 500);
      }
      return jsonResponse({
        fileId,
        url: normalizedUrl,
      });
    }

    if (action === "delete") {
      const secret = requiredEnv("DRIVE_CRUD_SECRET");
      const fileId = extractDriveFileId(body.fileId || body.url);
      if (!fileId) return jsonResponse({ error: "Missing Drive file ID." }, 400);

      const { data: actorRow, error: actorError } = await admin
        .from("users")
        .select("data")
        .eq("id", authData.user.id)
        .maybeSingle();
      if (actorError) throw actorError;
      const isAdmin = ["admin", "assistant_admin"].includes(String(actorRow?.data?.role || ""));
      const { data: fileRow, error: fileError } = await admin
        .from("drive_files")
        .select("owner_id")
        .eq("file_id", fileId)
        .maybeSingle();
      if (fileError) throw fileError;
      if (!isAdmin && fileRow?.owner_id !== authData.user.id) {
        return jsonResponse({ error: "You are not allowed to delete this image." }, 403);
      }

      await callDriveScript({
        action: "delete",
        secret,
        fileId,
      });
      await admin.from("drive_files").delete().eq("file_id", fileId);
      return jsonResponse({ deleted: true, fileId });
    }

    return jsonResponse({ error: "Unsupported Drive action." }, 400);
  } catch (error) {
    console.error("drive-image failed", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Drive image action failed." }, 500);
  }
});
