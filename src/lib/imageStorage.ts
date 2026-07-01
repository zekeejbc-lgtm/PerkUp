import { supabase } from "./supabase";

const GOOGLE_DRIVE_FILE_ID_PATTERNS = [
  /\/file\/d\/([a-zA-Z0-9_-]+)/,
  /[?&]id=([a-zA-Z0-9_-]+)/,
  /[?&]fileId=([a-zA-Z0-9_-]+)/,
  /\/d\/(?:\$\$)?([a-zA-Z0-9_-]+)/,
  /\/d\/([a-zA-Z0-9_-]+)/,
];

type UploadOptions = {
  purpose: string;
  owner?: string | null;
};

type DriveImageResponse = {
  fileId?: string;
  url?: string;
  deleted?: boolean;
};

export function extractDriveFileId(url: string): string | null {
  if (!url) return null;

  try {
    const parsedUrl = new URL(url);
    const queryId = parsedUrl.searchParams.get("id") || parsedUrl.searchParams.get("fileId");
    if (queryId && /^[a-zA-Z0-9_-]+$/.test(queryId)) return queryId;
  } catch {
    // Fall back to regex extraction for partial or already-escaped URLs.
  }

  for (const pattern of GOOGLE_DRIVE_FILE_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

export function normalizeDriveImageUrl(url: string): string {
  const trimmedUrl = String(url || "").trim();
  const fileId = extractDriveFileId(trimmedUrl);
  return fileId ? `https://lh3.googleusercontent.com/d/${fileId}=w4000` : trimmedUrl;
}

export function getDisplayImageUrl(url: string): string {
  if (!url) return "";
  return normalizeDriveImageUrl(url);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

function safeSegment(value?: string | null): string {
  return (
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "unknown"
  );
}

function timestampSegment(date = new Date()): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function buildUploadFileName(file: File, options: UploadOptions): string {
  const extension = file.name.match(/\.[a-zA-Z0-9]{1,12}$/)?.[0]?.toLowerCase() || "";
  return `${safeSegment(options.owner)}_${safeSegment(options.purpose)}_${timestampSegment()}${extension}`;
}

export async function uploadImageFileToDriveSecure(file: File, options: UploadOptions): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image uploads are supported.");
  }

  const base64 = await fileToDataUrl(file);
  const { data, error } = await supabase.functions.invoke<DriveImageResponse>("drive-image", {
    body: {
      action: "upload",
      fileName: buildUploadFileName(file, options),
      mimeType: file.type,
      base64,
      owner: options.owner,
      purpose: options.purpose,
    },
  });

  if (error || !data?.url) {
    throw new Error(error?.message || "Google Drive upload failed.");
  }

  return normalizeDriveImageUrl(data.url);
}

export async function deleteImageFromDriveSecure(url: string): Promise<void> {
  const fileId = extractDriveFileId(url);
  if (!fileId) return;

  const { error } = await supabase.functions.invoke<DriveImageResponse>("drive-image", {
    body: {
      action: "delete",
      fileId,
    },
  });

  if (error) {
    throw new Error(error.message || "Google Drive delete failed.");
  }
}
