import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { consumeRateLimit, getClientAddress, randomToken, sha256 } from "../_shared/rate-limit.ts";
import { maintenanceError, readRuntimeConfig } from "../_shared/runtime.ts";

const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbxfacR_tG28iu-riTquHZK9fRHN1aRAswJNUXAdRD36dd-YlxoqskAzQkgQvm1BWUQ/exec";
const DEFAULT_APP_URL = "https://www.perktoday.com";
const CONSENT_NOTICE_VERSION = "privacy-2026-08-02";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};
const clean = (value: unknown, maxLength: number) => String(value || "").trim().slice(0, maxLength);
const appUrl = () => (Deno.env.get("APP_URL") || DEFAULT_APP_URL).replace(/\/+$/, "");

const sendMail = async (payload: Record<string, unknown>) => {
  const response = await fetch(Deno.env.get("GAS_EMAIL_URL") || Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") || DEFAULT_GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...payload, secret: requiredEnv("DRIVE_CRUD_SECRET") }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.email) throw new Error("Subscription email could not be sent.");
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return corsPreflightResponse();
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(requiredEnv("SUPABASE_URL"), serviceKey, { auth: { persistSession: false } });
    const runtime = await readRuntimeConfig(admin);
    if (runtime.mode === "maintenance") return jsonResponse(maintenanceError(runtime), 503);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = clean(body.action, 20).toLowerCase();

    if (action === "subscribe") {
      const email = clean(body.email, 254).toLowerCase();
      if (!EMAIL_PATTERN.test(email)) return jsonResponse({ error: "Enter a valid email address." }, 400);
      if (body.consent !== true) return jsonResponse({ error: "Consent is required before subscribing." }, 400);

      const address = getClientAddress(request);
      const [emailLimit, addressLimit] = await Promise.all([
        consumeRateLimit(admin, { key: email, purpose: "newsletter-email", limit: 3, windowSeconds: 24 * 60 * 60, salt: serviceKey }),
        consumeRateLimit(admin, { key: address, purpose: "newsletter-address", limit: 10, windowSeconds: 60 * 60, salt: serviceKey }),
      ]);
      if (!emailLimit.allowed || !addressLimit.allowed) {
        return jsonResponse({ error: "Too many subscription requests. Please try again later." }, 429);
      }

      const { data: existing, error: existingError } = await admin.from("newsletter_subscribers")
        .select("id,status").ilike("email", email).maybeSingle();
      if (existingError) throw existingError;
      if (existing?.status === "active") {
        return jsonResponse({ accepted: true, message: "If confirmation is needed, an email will arrive shortly." }, 202);
      }

      const token = randomToken();
      const tokenHash = await sha256(token);
      const requestKeyHash = await sha256(`newsletter:${address}:${serviceKey}`);
      const requestedAt = new Date().toISOString();
      const record = {
        email,
        status: "pending",
        consent_source: clean(body.source, 80) || "website-footer",
        consent_notice_version: CONSENT_NOTICE_VERSION,
        consented_at: null,
        confirmation_requested_at: requestedAt,
        confirmed_at: null,
        unsubscribed_at: null,
        confirmation_token_hash: tokenHash,
        unsubscribe_token_hash: null,
        request_key_hash: requestKeyHash,
        updated_at: requestedAt,
      };
      if (existing) {
        const { error } = await admin.from("newsletter_subscribers").update(record).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await admin.from("newsletter_subscribers").insert(record);
        if (error?.code === "23505") {
          const { data: raced, error: racedError } = await admin.from("newsletter_subscribers")
            .select("id,status").ilike("email", email).maybeSingle();
          if (racedError) throw racedError;
          if (raced?.status === "active") {
            return jsonResponse({ accepted: true, message: "If confirmation is needed, an email will arrive shortly." }, 202);
          }
          if (!raced) throw error;
          const { error: retryError } = await admin.from("newsletter_subscribers").update(record).eq("id", raced.id);
          if (retryError) throw retryError;
        } else if (error) {
          throw error;
        }
      }

      await sendMail({
        action: "newsletter_confirmation",
        recipientEmail: email,
        confirmationLink: `${appUrl()}/newsletter#confirm=${encodeURIComponent(token)}`,
      });
      return jsonResponse({ accepted: true, message: "Check your email to confirm your subscription." }, 202);
    }

    if (action === "confirm") {
      const token = clean(body.token, 200);
      if (!/^[A-Za-z0-9_-]{40,200}$/.test(token)) return jsonResponse({ error: "The confirmation link is invalid." }, 400);
      const tokenHash = await sha256(token);
      const { data: subscriber, error } = await admin.from("newsletter_subscribers")
        .select("id,email,status,confirmation_requested_at").eq("confirmation_token_hash", tokenHash).maybeSingle();
      if (error) throw error;
      if (!subscriber || subscriber.status !== "pending"
        || !subscriber.confirmation_requested_at
        || new Date(subscriber.confirmation_requested_at).getTime() < Date.now() - 7 * 86400000) {
        return jsonResponse({ error: "The confirmation link is invalid or expired." }, 400);
      }
      const unsubscribeToken = randomToken();
      const now = new Date().toISOString();
      const { data: confirmed, error: updateError } = await admin.from("newsletter_subscribers").update({
        status: "active", consented_at: now, confirmed_at: now, confirmation_token_hash: null,
        unsubscribe_token_hash: await sha256(unsubscribeToken), updated_at: now,
      }).eq("id", subscriber.id).eq("status", "pending").eq("confirmation_token_hash", tokenHash)
        .select("email").maybeSingle();
      if (updateError) throw updateError;
      if (!confirmed) return jsonResponse({ error: "The confirmation link is invalid or expired." }, 400);
      await sendMail({
        action: "newsletter_confirmed",
        recipientEmail: confirmed.email,
        unsubscribeLink: `${appUrl()}/newsletter#unsubscribe=${encodeURIComponent(unsubscribeToken)}`,
      });
      return jsonResponse({ confirmed: true });
    }

    if (action === "unsubscribe") {
      const token = clean(body.token, 200);
      if (!/^[A-Za-z0-9_-]{40,200}$/.test(token)) return jsonResponse({ error: "The unsubscribe link is invalid." }, 400);
      const now = new Date().toISOString();
      const { error } = await admin.from("newsletter_subscribers").update({
        status: "unsubscribed", unsubscribed_at: now, confirmation_token_hash: null,
        unsubscribe_token_hash: null, updated_at: now,
      }).eq("unsubscribe_token_hash", await sha256(token)).eq("status", "active");
      if (error) throw error;
      return jsonResponse({ unsubscribed: true });
    }

    return jsonResponse({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("newsletter failed", error);
    return jsonResponse({ error: "Newsletter request failed. Please try again later." }, 500);
  }
});
