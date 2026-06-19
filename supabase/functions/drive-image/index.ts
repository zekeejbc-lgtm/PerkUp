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

const normalizeDriveImageUrl = (url: string) => {
  const fileId = extractDriveFileId(url);
  return fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w4000` : url;
};

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
    const authorization = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
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

      const uploaded = await callDriveScript({
        action: "upload",
        fileName: buildUploadFileName(body, authData.user.id),
        mimeType,
        base64,
      });
      const uploadedUrl = uploaded.url || uploaded.webViewLink || "";
      return jsonResponse({
        fileId: uploaded.fileId || extractDriveFileId(uploadedUrl),
        url: normalizeDriveImageUrl(uploadedUrl),
      });
    }

    if (action === "delete") {
      const secret = requiredEnv("DRIVE_CRUD_SECRET");
      const fileId = extractDriveFileId(body.fileId || body.url);
      if (!fileId) return jsonResponse({ error: "Missing Drive file ID." }, 400);

      await callDriveScript({
        action: "delete",
        secret,
        fileId,
      });
      return jsonResponse({ deleted: true, fileId });
    }

    return jsonResponse({ error: "Unsupported Drive action." }, 400);
  } catch (error) {
    console.error("drive-image failed", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Drive image action failed." }, 500);
  }
});
