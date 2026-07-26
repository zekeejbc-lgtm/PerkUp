import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { maintenanceError, readRuntimeConfig } from "../_shared/runtime.ts";

const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbxfacR_tG28iu-riTquHZK9fRHN1aRAswJNUXAdRD36dd-YlxoqskAzQkgQvm1BWUQ/exec";
const DEFAULT_APP_URL = "https://www.perktoday.com";
const VALID_CATEGORIES = new Set(["general", "bug", "feature", "business"]);

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const cleanText = (value: unknown, maxLength: number) =>
  String(value || "").trim().slice(0, maxLength);

const createReferenceNumber = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `FB-${date}-${token}`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = cleanText(body.action, 20).toLowerCase();
    const admin = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    const runtime = await readRuntimeConfig(admin);
    if (runtime.mode === "maintenance") return jsonResponse(maintenanceError(runtime), 503);

    if (action === "submit") {
      const name = cleanText(body.name, 100);
      const email = cleanText(body.email, 254).toLowerCase();
      const category = cleanText(body.category, 20).toLowerCase();
      const message = cleanText(body.message, 2000);

      if (message.length < 10 || !VALID_CATEGORIES.has(category)) {
        return jsonResponse({ error: "Choose a valid feedback type and enter at least 10 characters." }, 400);
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonResponse({ error: "Enter a valid email address or leave it blank." }, 400);
      }

      if (email) {
        const cooldownStart = new Date(Date.now() - 2 * 60_000).toISOString();
        const { count, error: cooldownError } = await admin
          .from("site_feedback_submissions")
          .select("id", { count: "exact", head: true })
          .eq("email", email)
          .gte("created_at", cooldownStart);
        if (cooldownError) throw cooldownError;
        if ((count || 0) > 0) {
          return jsonResponse({ error: "Please wait a moment before sending more feedback from this email." }, 429);
        }
      }

      let referenceNumber = "";
      let createdAt = "";
      for (let attempt = 0; attempt < 3; attempt += 1) {
        referenceNumber = createReferenceNumber();
        const { data, error } = await admin.from("site_feedback_submissions").insert({
          name: name || null,
          email: email || null,
          category,
          message,
          reference_number: referenceNumber,
        }).select("created_at").single();
        if (!error) {
          createdAt = data.created_at;
          break;
        }
        if (error.code !== "23505" || attempt === 2) throw error;
      }

      let receipt = { sent: false, error: "" };
      if (email) {
        try {
          await sendReceipt({ email, name, referenceNumber, category, message });
          receipt = { sent: true, error: "" };
        } catch (emailError) {
          receipt.error = emailError instanceof Error ? emailError.message : "Receipt email could not be sent.";
          console.error("Feedback receipt failed", { referenceNumber, error: receipt.error });
        }
      }

      return jsonResponse({
        feedback: { referenceNumber, status: "received", createdAt },
        receipt,
      }, 201);
    }

    if (action === "lookup") {
      const referenceNumber = cleanText(body.referenceNumber, 50).toUpperCase();
      if (!/^FB-[A-Z0-9-]{12,45}$/.test(referenceNumber)) {
        return jsonResponse({ error: "Enter a valid feedback reference number." }, 400);
      }

      const { data, error } = await admin
        .from("site_feedback_submissions")
        .select("reference_number,category,message,status,public_response,created_at,status_updated_at")
        .eq("reference_number", referenceNumber)
        .maybeSingle();
      if (error) throw error;
      if (!data) return jsonResponse({ error: "No feedback was found for that reference number." }, 404);

      return jsonResponse({
        feedback: {
          referenceNumber: data.reference_number,
          category: data.category,
          message: data.message,
          status: data.status,
          response: data.public_response || "",
          createdAt: data.created_at,
          updatedAt: data.status_updated_at,
        },
      });
    }

    return jsonResponse({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("public-feedback failed", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Feedback service failed." }, 500);
  }
});

const sendReceipt = async ({
  email,
  name,
  referenceNumber,
  category,
  message,
}: {
  email: string;
  name: string;
  referenceNumber: string;
  category: string;
  message: string;
}) => {
  const url = Deno.env.get("GAS_EMAIL_URL") || Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") || DEFAULT_GAS_URL;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "feedback_received",
      secret: requiredEnv("DRIVE_CRUD_SECRET"),
      recipientEmail: email,
      userName: name || "PerkUp visitor",
      feedback: {
        referenceNumber,
        category,
        message,
        trackingLink: `${(Deno.env.get("APP_URL") || DEFAULT_APP_URL).replace(/\/+$/, "")}/feedback?reference=${encodeURIComponent(referenceNumber)}#lookup`,
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.email) {
    throw new Error(data.error || `Receipt email failed with HTTP ${response.status}.`);
  }
};
