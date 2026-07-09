import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

const DEFAULT_GAS_UPLOAD_URL =
  "https://script.google.com/macros/s/AKfycbxfacR_tG28iu-riTquHZK9fRHN1aRAswJNUXAdRD36dd-YlxoqskAzQkgQvm1BWUQ/exec";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const cleanText = (value: unknown, maxLength: number) =>
  String(value || "").trim().slice(0, maxLength);

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const timestamp = () => ({
  seconds: Math.floor(Date.now() / 1000),
  nanoseconds: 0,
});

const callDrive = async (payload: Record<string, unknown>) => {
  const response = await fetch(Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") || DEFAULT_GAS_UPLOAD_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || `Drive request failed with HTTP ${response.status}.`);
  return data as { fileId?: string; url?: string; webViewLink?: string };
};

const callEmail = async (payload: Record<string, unknown>) => {
  const secret = Deno.env.get("DRIVE_CRUD_SECRET");
  if (!secret) throw new Error("DRIVE_CRUD_SECRET is not configured.");
  const response = await fetch(Deno.env.get("GAS_EMAIL_URL") || Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") || DEFAULT_GAS_UPLOAD_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...payload, secret }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.email) throw new Error(data.error || `Email request failed with HTTP ${response.status}.`);
  return data;
};

const extractFileId = (url: string) =>
  url.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] ||
  url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ||
  "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  let uploadedFileId = "";
  try {
    const admin = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = cleanText(body.action, 40).toLowerCase();

    if (action === "track") {
      const trackingNumber = cleanText(body.trackingNumber, 120);
      if (!trackingNumber) return jsonResponse({ error: "Tracking number is required." }, 400);

      const { data: applicationRow, error: applicationError } = await admin
        .from("applications")
        .select("id,data")
        .eq("id", trackingNumber)
        .maybeSingle();
      if (applicationError) throw applicationError;
      if (!applicationRow) return jsonResponse({ found: false }, 404);

      const applicationData = applicationRow.data || {};
      return jsonResponse({
        found: true,
        application: {
          trackingNumber: applicationRow.id,
          businessName: cleanText(applicationData.businessName, 120),
          subscriptionLevel: cleanText(applicationData.subscriptionLevel, 80),
          status: cleanText(applicationData.status || "pending", 40),
          createdAt: applicationData.createdAt || null,
          updatedAt: applicationData.updatedAt || null,
          approvedStoreId: cleanText(applicationData.approvedStoreId, 120),
        },
      });
    }

    const forwarded = req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
      "unknown";
    const clientHash = await sha256(`${forwarded}:${requiredEnv("SUPABASE_URL")}`);
    const now = new Date();
    const { data: limitRow, error: limitError } = await admin
      .from("partner_application_limits")
      .select("window_started_at,request_count")
      .eq("client_hash", clientHash)
      .maybeSingle();
    if (limitError) throw limitError;
    const windowStarted = limitRow ? new Date(limitRow.window_started_at) : null;
    const inWindow = windowStarted && now.getTime() - windowStarted.getTime() < RATE_WINDOW_MS;
    if (inWindow && Number(limitRow.request_count) >= RATE_LIMIT) {
      return jsonResponse({ error: "Too many applications were submitted. Please try again later." }, 429);
    }
    const { error: rateWriteError } = await admin.from("partner_application_limits").upsert({
      client_hash: clientHash,
      window_started_at: inWindow ? windowStarted!.toISOString() : now.toISOString(),
      request_count: inWindow ? Number(limitRow?.request_count || 0) + 1 : 1,
    });
    if (rateWriteError) throw rateWriteError;

    const businessName = cleanText(body.businessName, 120);
    const applicantName = cleanText(body.applicantName, 80);
    const email = cleanText(body.email, 254).toLowerCase();
    const phoneNumber = cleanText(body.phoneNumber, 40);
    const description = cleanText(body.description, 1000);
    const address = cleanText(body.address, 300);
    const subscriptionLevel = cleanText(body.subscriptionLevel, 80);
    const coordinates = Array.isArray(body.coordinates) ? body.coordinates.map(Number) : [];

    if (!businessName || !applicantName || !email || !phoneNumber || !description || !address) {
      return jsonResponse({ error: "All required application fields must be completed." }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: "A valid email address is required." }, 400);
    }
    if (coordinates.length !== 2 || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1]) ||
      coordinates[0] < -90 || coordinates[0] > 90 || coordinates[1] < -180 || coordinates[1] > 180) {
      return jsonResponse({ error: "A valid map location is required." }, 400);
    }

    let logoUrl = "";
    const logo = body.logo && typeof body.logo === "object" ? body.logo as Record<string, unknown> : null;
    if (logo) {
      const mimeType = cleanText(logo.mimeType, 80).toLowerCase();
      const base64 = String(logo.base64 || "");
      if (!ALLOWED_MIME_TYPES.has(mimeType)) return jsonResponse({ error: "Logo must be PNG, JPEG, or WebP." }, 400);
      if (!base64.startsWith("data:image/")) return jsonResponse({ error: "Logo image data is invalid." }, 400);
      const encoded = base64.slice(base64.indexOf(",") + 1);
      if (Math.ceil(encoded.length * 0.75) > MAX_LOGO_BYTES) {
        return jsonResponse({ error: "Logo must be 2 MB or smaller." }, 413);
      }
      const uploaded = await callDrive({
        action: "upload",
        fileName: `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "partner"}_application-logo`,
        mimeType,
        base64,
      });
      const rawUrl = uploaded.url || uploaded.webViewLink || "";
      uploadedFileId = uploaded.fileId || extractFileId(rawUrl);
      if (!uploadedFileId) throw new Error("Drive did not return a valid file ID.");
      logoUrl = `https://lh3.googleusercontent.com/d/${uploadedFileId}=w4000`;
    }

    const applicationId = crypto.randomUUID();
    const applicationData = {
      businessName,
      applicantName,
      email,
      phoneNumber,
      description,
      logoUrl,
      address,
      coordinates,
      lat: coordinates[0],
      lng: coordinates[1],
      subscriptionLevel,
      status: "pending",
      createdAt: timestamp(),
      updatedAt: timestamp(),
    };
    const { error: insertError } = await admin.from("applications").insert({
      id: applicationId,
      data: applicationData,
    });
    if (insertError) throw insertError;
    if (uploadedFileId) {
      const { error: fileError } = await admin.from("application_files").insert({
        file_id: uploadedFileId,
        application_id: applicationId,
        url: logoUrl,
      });
      if (fileError) {
        await admin.from("applications").delete().eq("id", applicationId);
        throw fileError;
      }
    }
    const emailNotification = { sent: false, error: "" };
    try {
      await callEmail({
        action: "application_received",
        recipientEmail: email,
        userName: applicantName,
        application: {
          trackingNumber: applicationId,
          businessName,
          subscriptionLevel,
        },
      });
      emailNotification.sent = true;
    } catch (emailError) {
      emailNotification.error = emailError instanceof Error ? emailError.message : "Application email could not be sent.";
      console.error("Application tracking email failed", { applicationId, error: emailNotification.error });
    }
    return jsonResponse({ applicationId, submitted: true, notification: emailNotification });
  } catch (error) {
    if (uploadedFileId) {
      const secret = Deno.env.get("DRIVE_CRUD_SECRET");
      if (secret) await callDrive({ action: "delete", secret, fileId: uploadedFileId }).catch(console.error);
    }
    console.error("partner-application failed", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Application submission failed." }, 500);
  }
});
