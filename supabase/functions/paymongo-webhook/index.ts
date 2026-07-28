import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { jsonResponse } from "../_shared/cors.ts";

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const safeEqual = (left: string, right: string) => {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
};

const signPayload = async (secret: string, payload: string) => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  return Array.from(signature).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const parseSignature = (header: string) => {
  const values = new Map<string, string>();
  for (const item of header.split(",")) {
    const [key, ...rest] = item.trim().split("=");
    if (key && rest.length) values.set(key, rest.join("="));
  }
  return values;
};

const errorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const details = [record.message, record.details, record.hint, record.code]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    if (details.length) return details.join(" | ");
  }
  const text = String(error || "").trim();
  return text && text !== "[object Object]" ? text : fallback;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const rawBody = await req.text();
  try {
    const mode = (Deno.env.get("PAYMONGO_MODE") || "test").toLowerCase();
    if (mode !== "test" && mode !== "live") throw new Error("PAYMONGO_MODE must be test or live.");
    const signatureValues = parseSignature(req.headers.get("paymongo-signature") || "");
    const timestamp = signatureValues.get("t") || "";
    const providedSignature = signatureValues.get(mode === "live" ? "li" : "te") || "";
    const timestampNumber = Number(timestamp);
    if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 300) {
      return jsonResponse({ error: "Webhook timestamp is invalid or stale." }, 401);
    }
    const expectedSignature = await signPayload(
      requiredEnv("PAYMONGO_WEBHOOK_SECRET"),
      `${timestamp}.${rawBody}`,
    );
    if (!safeEqual(providedSignature, expectedSignature)) {
      return jsonResponse({ error: "Webhook signature is invalid." }, 401);
    }

    const payload = JSON.parse(rawBody);
    const eventId = String(payload?.data?.id || "").trim();
    const eventAttributes = payload?.data?.attributes || {};
    const eventType = String(eventAttributes?.type || "").trim();
    const livemode = Boolean(eventAttributes?.livemode);
    if (!eventId || !eventType) return jsonResponse({ error: "Webhook event is malformed." }, 400);
    if ((mode === "live") !== livemode) return jsonResponse({ error: "Webhook mode does not match configuration." }, 400);

    const supabase = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const initialStatus = eventType === "link.payment.paid" ? "received" : "ignored";
    const { error: eventInsertError } = await supabase.from("paymongo_webhook_events").insert({
      event_id: eventId,
      event_type: eventType,
      livemode,
      status: initialStatus,
      payload,
      processed_at: initialStatus === "ignored" ? new Date().toISOString() : null,
    });
    if (eventInsertError?.code === "23505") {
      const { data: existingEvent, error: existingEventError } = await supabase
        .from("paymongo_webhook_events")
        .select("status")
        .eq("event_id", eventId)
        .maybeSingle();
      if (existingEventError) throw existingEventError;
      if (existingEvent?.status === "processed" || existingEvent?.status === "ignored") {
        return jsonResponse({ ok: true, duplicate: true });
      }
    }
    if (eventInsertError && eventInsertError.code !== "23505") throw eventInsertError;
    if (eventType !== "link.payment.paid") return jsonResponse({ ok: true, ignored: true });

    const linkResource = eventAttributes?.data || {};
    const linkAttributes = linkResource?.attributes || linkResource;
    const linkId = String(linkResource?.id || linkAttributes?.id || "").trim();
    const amount = Number(linkAttributes?.amount);
    const currency = String(linkAttributes?.currency || "").toUpperCase();
    if (!linkId || !Number.isInteger(amount) || amount < 1 || !currency) {
      throw new Error("PayMongo paid-link event is missing invoice matching fields.");
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from("billing_invoices")
      .select("id")
      .eq("paymongo_link_id", linkId)
      .maybeSingle();
    if (invoiceError) throw invoiceError;
    if (!invoice) {
      await supabase.from("paymongo_webhook_events").update({
        status: "ignored",
        error_message: "No Perk invoice matched the PayMongo link.",
        processed_at: new Date().toISOString(),
      }).eq("event_id", eventId);
      return jsonResponse({ ok: true, unmatched: true });
    }

    const paymentWrapper = Array.isArray(linkAttributes?.payments)
      ? linkAttributes.payments[0]
      : linkAttributes?.payment || null;
    const paymentResource = paymentWrapper?.data || paymentWrapper || {};
    const paymentAttributes = paymentResource?.attributes || paymentResource;
    const paidAtSeconds = Number(
      linkAttributes?.paid_at ||
      paymentAttributes?.paid_at ||
      eventAttributes?.created_at ||
      Math.floor(Date.now() / 1000),
    );
    const paidAt = new Date(paidAtSeconds > 10_000_000_000 ? paidAtSeconds : paidAtSeconds * 1000).toISOString();
    const { data: fulfillment, error: fulfillmentError } = await supabase.rpc("fulfill_billing_invoice", {
      p_invoice_id: invoice.id,
      p_paymongo_event_id: eventId,
      p_paymongo_link_id: linkId,
      p_amount_centavos: amount,
      p_currency: currency,
      p_livemode: livemode,
      p_paid_at: paidAt,
    });
    if (fulfillmentError) throw fulfillmentError;

    const paymentUpdate: Record<string, unknown> = {
      gross_amount_centavos: amount,
    };
    const paymentId = String(paymentResource?.id || paymentAttributes?.id || "").trim();
    const paymentMethod = String(
      paymentAttributes?.source?.type ||
      paymentAttributes?.payment_method_used ||
      paymentAttributes?.payment_method ||
      "",
    ).trim();
    const fee = Number(paymentAttributes?.fee);
    const netAmount = Number(paymentAttributes?.net_amount);
    if (paymentId) paymentUpdate.paymongo_payment_id = paymentId;
    if (paymentMethod) paymentUpdate.payment_method = paymentMethod;
    if (Number.isInteger(fee) && fee >= 0) paymentUpdate.fee_centavos = fee;
    if (Number.isInteger(netAmount) && netAmount >= 0) paymentUpdate.net_amount_centavos = netAmount;
    const { error: paymentUpdateError } = await supabase
      .from("billing_invoices")
      .update(paymentUpdate)
      .eq("id", invoice.id);
    if (paymentUpdateError) throw paymentUpdateError;

    await supabase.from("paymongo_webhook_events").update({
      status: "processed",
      error_message: null,
      processed_at: new Date().toISOString(),
    }).eq("event_id", eventId);
    return jsonResponse({ ok: true, fulfillment });
  } catch (error) {
    const message = errorMessage(error, "Webhook processing failed.");
    console.error("PayMongo webhook processing failed", { error: message });
    try {
      const parsed = JSON.parse(rawBody);
      const eventId = String(parsed?.data?.id || "").trim();
      if (eventId) {
        const supabase = createClient(
          requiredEnv("SUPABASE_URL"),
          requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
          { auth: { persistSession: false } },
        );
        await supabase.from("paymongo_webhook_events").update({
          status: "failed",
          error_message: message.slice(0, 1000),
        }).eq("event_id", eventId);
      }
    } catch {
      // The event may have failed before it was safe to persist.
    }
    return jsonResponse({ error: "Webhook processing failed." }, 500);
  }
});
