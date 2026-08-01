import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import {
  checkPartnerContactAvailability,
  getPartnerApplicationDatabaseError,
  getPartnerContactConflict,
  getPartnerContactValidationError,
  normalizePartnerEmail,
  normalizePartnerPhone,
} from "../_shared/partner-contact.ts";
import { maintenanceError, readRuntimeConfig } from "../_shared/runtime.ts";

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

class ApplicationValidationError extends Error {}

const cleanOptionalUrl = (value: unknown, label: string, facebookOnly = false) => {
  const rawValue = cleanText(value, 1000);
  if (!rawValue) return "";

  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    throw new ApplicationValidationError(`${label} must be a complete URL starting with http:// or https://.`);
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new ApplicationValidationError(`${label} must be a valid public website URL.`);
  }
  if (facebookOnly) {
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (hostname !== "facebook.com" && !hostname.endsWith(".facebook.com") && hostname !== "fb.com" && !hostname.endsWith(".fb.com")) {
      throw new ApplicationValidationError(`${label} must link to Facebook.`);
    }
  }
  return url.toString();
};

const getBusinessSlug = (businessName: string) => {
  const words = businessName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);

  if (words.length === 0) return "SHOP";

  const compact = words.join("");
  return compact.padEnd(4, "X").slice(0, 6);
};

const formatApplicationTrackingCode = (applicationId: string, businessName: string) => {
  const compactId = applicationId.replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (!compactId) return `PKUP-${getBusinessSlug(businessName)}-PENDING`;
  return `PKUP-${getBusinessSlug(businessName)}-${compactId.slice(0, 4)}-${compactId.slice(-4)}`;
};

const parseApplicationTrackingCode = (trackingCode: string) => {
  const match = trackingCode.toUpperCase().match(/^PKUP-[A-Z0-9]{4,6}-([A-Z0-9]{4})-([A-Z0-9]{4})$/);
  return match ? { firstGroup: match[1], lastGroup: match[2] } : null;
};

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const timestamp = () => ({
  seconds: Math.floor(Date.now() / 1000),
  nanoseconds: 0,
});

const callDrive = async (payload: Record<string, unknown>) => {
  const secret = Deno.env.get("DRIVE_CRUD_SECRET");
  if (!secret) throw new Error("DRIVE_CRUD_SECRET is not configured.");
  const response = await fetch(Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") || DEFAULT_GAS_UPLOAD_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...payload, secret }),
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

const createPartnerContactLookup = (admin: any) => {
  let applicationContactsPromise: Promise<Record<string, unknown>[]> | null = null;
  const getApplicationContacts = () => {
    if (!applicationContactsPromise) {
      applicationContactsPromise = (async () => {
        const contacts: Record<string, unknown>[] = [];
        const pageSize = 1000;
        for (let from = 0; ; from += pageSize) {
          const { data, error } = await admin
            .from("applications")
            .select("data")
            .range(from, from + pageSize - 1);
          if (error) throw error;
          const rows = (data || []) as Array<{ data?: Record<string, unknown> }>;
          contacts.push(...rows.map((row) => row.data || {}));
          if (rows.length < pageSize) break;
        }
        return contacts;
      })();
    }
    return applicationContactsPromise;
  };

  return {
    isAuthEmailUsed: async (email: string) => {
      const perPage = 1000;
      for (let page = 1; ; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
        if (error) throw error;
        if (data.users.some((user: { email?: string }) => normalizePartnerEmail(user.email) === email)) {
          return true;
        }
        if (data.users.length < perPage) return false;
      }
    },
    isCustomerPhoneUsed: async (phone: string) => {
      const { data, error } = await admin
        .from("customer_phones")
        .select("phone")
        .eq("phone", phone)
        .limit(1);
      if (error) throw error;
      return Boolean(data?.length);
    },
    isApplicationEmailUsed: async (email: string) =>
      (await getApplicationContacts()).some((data) => normalizePartnerEmail(data.email) === email),
    isApplicationPhoneUsed: async (phone: string) =>
      (await getApplicationContacts()).some((data) => normalizePartnerPhone(data.phoneNumber) === phone),
  };
};

const getContactInput = (body: Record<string, unknown>) => ({
  email: normalizePartnerEmail(body.email).slice(0, 254),
  phone: normalizePartnerPhone(body.phoneNumber),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  let uploadedFileId = "";
  try {
    const admin = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    const runtime = await readRuntimeConfig(admin);
    if (runtime.mode === "maintenance") return jsonResponse(maintenanceError(runtime), 503);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = cleanText(body.action, 40).toLowerCase();

    if (action === "check_availability") {
      const { email, phone } = getContactInput(body);
      const validationError = getPartnerContactValidationError(email, phone);
      if (validationError) return jsonResponse({ error: validationError }, 400);

      const availability = await checkPartnerContactAvailability(
        email,
        phone,
        createPartnerContactLookup(admin),
      );
      return jsonResponse(availability);
    }

    if (action === "track") {
      const trackingNumber = cleanText(body.trackingNumber, 120);
      if (!trackingNumber) return jsonResponse({ error: "Application code is required." }, 400);

      let { data: applicationRow, error: applicationError } = await admin
        .from("applications")
        .select("id,public_id,data")
        .eq("public_id", trackingNumber.toUpperCase())
        .maybeSingle();
      if (applicationError) throw applicationError;
      if (!applicationRow) {
        const result = await admin
          .from("applications")
          .select("id,public_id,data")
          .eq("id", trackingNumber)
          .maybeSingle();
        if (result.error) throw result.error;
        applicationRow = result.data;
      }
      if (!applicationRow) {
        const result = await admin
          .from("applications")
          .select("id,public_id,data")
          .eq("data->>trackingCode", trackingNumber.toUpperCase())
          .maybeSingle();
        if (result.error) throw result.error;
        applicationRow = result.data;
      }
      if (!applicationRow) {
        const parsedCode = parseApplicationTrackingCode(trackingNumber);
        if (parsedCode) {
          const result = await admin
            .from("applications")
            .select("id,public_id,data")
            .ilike("id", `${parsedCode.firstGroup}%${parsedCode.lastGroup}`)
            .limit(10);
          if (result.error) throw result.error;
          applicationRow = (result.data || []).find((row) => {
            const businessName = cleanText(row.data?.businessName, 120);
            return formatApplicationTrackingCode(row.id, businessName) === trackingNumber.toUpperCase();
          }) || null;
        }
      }
      if (!applicationRow) return jsonResponse({ found: false }, 404);

      const applicationData = applicationRow.data || {};
      const businessName = cleanText(applicationData.businessName, 120);
      const trackingCode = cleanText(
        applicationData.trackingCode || formatApplicationTrackingCode(applicationRow.id, businessName),
        120,
      );
      return jsonResponse({
        found: true,
        application: {
          trackingNumber: applicationRow.public_id || trackingCode,
          legacyTrackingNumber: trackingCode,
          applicationId: applicationRow.id,
          businessName,
          subscriptionLevel: cleanText(applicationData.subscriptionLevel, 80),
          status: cleanText(applicationData.status || "pending", 40),
          logoUrl: cleanText(applicationData.logoUrl, 1000),
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
    if (inWindow && Number(limitRow?.request_count || 0) >= RATE_LIMIT) {
      return jsonResponse({ error: "Too many applications were submitted. Please try again later." }, 429);
    }
    const { error: rateWriteError } = await admin.from("partner_application_limits").upsert({
      client_hash: clientHash,
      window_started_at: inWindow ? windowStarted!.toISOString() : now.toISOString(),
      request_count: inWindow ? Number(limitRow?.request_count || 0) + 1 : 1,
    });
    if (rateWriteError) throw rateWriteError;

    const businessName = cleanText(body.businessName, 120);
    const category = cleanText(body.category, 120);
    const applicantName = cleanText(body.applicantName, 80);
    const { email, phone } = getContactInput(body);
    const phoneNumber = `+${phone}`;
    const description = cleanText(body.description, 1000);
    const address = cleanText(body.address, 300);
    const subscriptionLevel = cleanText(body.subscriptionLevel, 80);
    const coordinates = Array.isArray(body.coordinates) ? body.coordinates.map(Number) : [];

    if (!businessName || !category || !applicantName || !email || !phoneNumber || !description || !address || !subscriptionLevel) {
      return jsonResponse({ error: "All required application fields must be completed." }, 400);
    }
    const contactValidationError = getPartnerContactValidationError(email, phone);
    if (contactValidationError) return jsonResponse({ error: contactValidationError }, 400);
    if (coordinates.length !== 2 || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1]) ||
      coordinates[0] < -90 || coordinates[0] > 90 || coordinates[1] < -180 || coordinates[1] > 180) {
      return jsonResponse({ error: "A valid map location is required." }, 400);
    }
    const personalFacebookUrl = cleanOptionalUrl(body.personalFacebookUrl, "Personal Facebook URL", true);
    const businessFacebookUrl = cleanOptionalUrl(body.businessFacebookUrl, "Business Facebook URL", true);
    const businessWebsiteUrl = cleanOptionalUrl(body.businessWebsiteUrl, "Business website URL");
    const availability = await checkPartnerContactAvailability(
      email,
      phone,
      createPartnerContactLookup(admin),
    );
    const contactConflict = getPartnerContactConflict(
      availability.emailAvailable,
      availability.phoneAvailable,
    );
    if (contactConflict) {
      return jsonResponse({ error: contactConflict.message, code: contactConflict.code }, 409);
    }

    let logoUrl = "";
    const logo = body.logo && typeof body.logo === "object" ? body.logo as Record<string, unknown> : null;
    if (!logo) return jsonResponse({ error: "A business logo is required." }, 400);
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
    const trackingCode = formatApplicationTrackingCode(applicationId, businessName);
    const applicationData = {
      businessName,
      category,
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
      personalFacebookUrl,
      businessFacebookUrl,
      businessWebsiteUrl,
      trackingCode,
      status: "pending",
      createdAt: timestamp(),
      updatedAt: timestamp(),
    };
    const { data: insertedApplication, error: insertError } = await admin.from("applications").insert({
      id: applicationId,
      data: applicationData,
    }).select("public_id").single();
    if (insertError) throw insertError;
    const publicApplicationId = cleanText(insertedApplication?.public_id, 20);
    if (!publicApplicationId) throw new Error("Application public ID was not assigned.");
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
          trackingNumber: publicApplicationId,
          businessName,
          subscriptionLevel,
        },
      });
      emailNotification.sent = true;
    } catch (emailError) {
      emailNotification.error = emailError instanceof Error ? emailError.message : "Application email could not be sent.";
      console.error("Application tracking email failed", { applicationId, error: emailNotification.error });
    }
    return jsonResponse({
      applicationId,
      publicId: publicApplicationId,
      trackingNumber: publicApplicationId,
      legacyTrackingNumber: trackingCode,
      submitted: true,
      notification: emailNotification,
    });
  } catch (error) {
    if (uploadedFileId) {
      const secret = Deno.env.get("DRIVE_CRUD_SECRET");
      if (secret) await callDrive({ action: "delete", secret, fileId: uploadedFileId }).catch(console.error);
    }
    if (error instanceof ApplicationValidationError) {
      return jsonResponse({ error: error.message }, 400);
    }
    const publicError = getPartnerApplicationDatabaseError(error);
    if (publicError.status === 500) console.error("partner-application failed", error);
    return jsonResponse({ error: publicError.error, code: publicError.code }, publicError.status);
  }
});
