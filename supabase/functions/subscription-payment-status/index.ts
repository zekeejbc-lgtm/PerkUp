import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

const PAYMONGO_API = "https://api.paymongo.com/v1";

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
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

const createPaymentLink = async (invoice: any) => {
  const response = await fetch(`${PAYMONGO_API}/payment_links`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${btoa(`${requiredEnv("PAYMONGO_SECRET_KEY")}:`)}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `perkup-invoice-${invoice.id}`,
    },
    body: JSON.stringify({
      amount: invoice.amount_centavos,
      currency: invoice.currency,
      description: `PerkUp ${invoice.subscription?.plan_id || "subscription"} subscription`,
      remarks: `Invoice ${invoice.id}`,
      metadata: {
        invoice_id: invoice.id,
        subscription_id: invoice.subscription_id,
        store_id: invoice.store_id,
      },
      restriction: { completed_sessions: { limit: 1 } },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.errors?.[0]?.detail || payload?.error || `HTTP ${response.status}`;
    throw new Error(`PayMongo link creation failed: ${String(detail).slice(0, 500)}`);
  }
  const resource = payload?.data || {};
  const attributes = resource?.attributes || resource;
  const url = attributes?.checkout_url || attributes?.url || resource?.url;
  const referenceNumber = attributes?.reference_number || resource?.reference_number;
  if (!resource?.id || !url || !referenceNumber) throw new Error("PayMongo returned an incomplete Payment Link response.");
  return {
    id: String(resource.id),
    url: String(url),
    referenceNumber: String(referenceNumber),
    livemode: Boolean(attributes?.livemode ?? resource?.livemode),
  };
};

const sendPaymentLinkEmail = async (
  admin: ReturnType<typeof createClient>,
  invoice: any,
  link: { id: string; url: string; referenceNumber: string; livemode: boolean },
) => {
  const [{ data: existing }, { data: storeRow }, { data: ownerRow }] = await Promise.all([
    admin.from("billing_notifications").select("status").eq("invoice_id", invoice.id)
      .eq("channel", "email").eq("notification_type", "payment_due").maybeSingle(),
    admin.from("stores").select("data").eq("id", invoice.store_id).maybeSingle(),
    admin.from("users").select("data").eq("id", invoice.owner_user_id).maybeSingle(),
  ]);
  if (existing?.status === "sent") return;

  const recipient = String(invoice.subscription?.billing_email || ownerRow?.data?.email || "").trim().toLowerCase();
  if (!recipient) throw new Error("The store owner has no billing email.");
  const gasSecret = requiredEnv("DRIVE_CRUD_SECRET");
  const gasUrl = Deno.env.get("GAS_EMAIL_URL") || Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") ||
    "https://script.google.com/macros/s/AKfycbxfacR_tG28iu-riTquHZK9fRHN1aRAswJNUXAdRD36dd-YlxoqskAzQkgQvm1BWUQ/exec";
  try {
    const response = await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: gasSecret,
        action: "subscription_payment_due",
        recipientEmail: recipient,
        userName: String(ownerRow?.data?.name || "Store owner").trim(),
        invoice: {
          invoiceId: invoice.id,
          storeName: String(storeRow?.data?.businessName || storeRow?.data?.name || "your store").trim(),
          planName: invoice.subscription?.plan_id,
          amountCentavos: invoice.amount_centavos,
          currency: invoice.currency,
          dueAt: invoice.due_at,
          referenceNumber: link.referenceNumber,
          paymentLink: link.url,
          testMode: !link.livemode,
          initialPayment: invoice.invoice_type === "initial",
          intervalDays: Number(storeRow?.data?.billingIntervalDays || 30),
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success !== true) throw new Error(String(payload?.error || `Email service returned HTTP ${response.status}`));
    await admin.from("billing_notifications").upsert({
      invoice_id: invoice.id,
      channel: "email",
      notification_type: "payment_due",
      recipient,
      status: "sent",
      attempt_count: 1,
      sent_at: new Date().toISOString(),
      last_error: null,
    }, { onConflict: "invoice_id,channel,notification_type" });
  } catch (error) {
    await admin.from("billing_notifications").upsert({
      invoice_id: invoice.id,
      channel: "email",
      notification_type: "payment_due",
      recipient,
      status: "failed",
      attempt_count: 1,
      next_attempt_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      last_error: String(error instanceof Error ? error.message : error).slice(0, 1000),
    }, { onConflict: "invoice_id,channel,notification_type" });
    console.error("Payment-link email failed", { invoiceId: invoice.id, error });
  }
};

const paidPaymentFromPayload = (payload: any) => {
  const payments = Array.isArray(payload?.data) ? payload.data : [];
  for (const resource of payments) {
    const attributes = resource?.attributes || resource || {};
    if (String(attributes.status || "").toLowerCase() !== "paid") continue;
    const rawPaidAt = attributes.paid_at || attributes.updated_at || attributes.created_at;
    const numericPaidAt = Number(rawPaidAt);
    const parsedPaidAt = Number.isFinite(numericPaidAt)
      ? new Date(numericPaidAt > 10_000_000_000 ? numericPaidAt : numericPaidAt * 1000)
      : new Date(String(rawPaidAt || ""));
    return {
      id: String(resource?.id || attributes.payment_id || ""),
      amount: Number(attributes.amount),
      currency: String(attributes.currency || "").toUpperCase(),
      livemode: Boolean(attributes.livemode ?? resource?.livemode),
      paidAt: Number.isNaN(parsedPaidAt.getTime()) ? new Date().toISOString() : parsedPaidAt.toISOString(),
    };
  }
  return null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization) return jsonResponse({ error: "Authentication required." }, 401);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const userClient = createClient(supabaseUrl, requiredEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: "Authentication required." }, 401);

    const body = await req.json().catch(() => ({}));
    const storeId = String(body?.storeId || "").trim().slice(0, 100);
    if (!storeId) return jsonResponse({ error: "Store is required." }, 400);

    const admin = createClient(supabaseUrl, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    const { data: invoice, error: invoiceError } = await admin.from("billing_invoices")
      .select("id,subscription_id,store_id,owner_user_id,invoice_type,status,due_at,paymongo_link_id,payment_url,amount_centavos,currency,livemode,paid_at,period_end,paymongo_reference_number,subscription:billing_subscriptions(billing_email,plan_id)")
      .eq("store_id", storeId)
      .eq("owner_user_id", authData.user.id)
      .in("status", ["pending", "failed", "link_created", "paid"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (invoiceError) throw invoiceError;
    if (!invoice) return jsonResponse({ paid: false, status: "pending" });
    if (invoice.status === "paid") {
      return jsonResponse({
        paid: true,
        amountCentavos: invoice.amount_centavos,
        paidAt: invoice.paid_at,
        periodEnd: invoice.period_end,
        referenceNumber: invoice.paymongo_reference_number,
      });
    }

    let linkId = String(invoice.paymongo_link_id || "");
    let paymentUrl = String(invoice.payment_url || "");
    let referenceNumber = String(invoice.paymongo_reference_number || "");
    if (!linkId || !paymentUrl || !referenceNumber) {
      const link = await createPaymentLink(invoice);
      const mode = (Deno.env.get("PAYMONGO_MODE") || "test").toLowerCase();
      if (mode !== "test" && mode !== "live") throw new Error("PAYMONGO_MODE must be test or live.");
      if ((mode === "live") !== link.livemode) throw new Error("PayMongo payment mode does not match the configured billing mode.");

      const { error: linkUpdateError } = await admin.from("billing_invoices").update({
        status: "link_created",
        paymongo_link_id: link.id,
        paymongo_reference_number: link.referenceNumber,
        payment_url: link.url,
        livemode: link.livemode,
        last_error: null,
      }).eq("id", invoice.id).eq("owner_user_id", authData.user.id);
      if (linkUpdateError) throw linkUpdateError;

      const { data: storeRow, error: storeError } = await admin.from("stores").select("data").eq("id", storeId).single();
      if (storeError) throw storeError;
      const existingAccess = storeRow.data?.subscriptionAccess && typeof storeRow.data.subscriptionAccess === "object"
        ? storeRow.data.subscriptionAccess
        : {};
      const { error: mirrorError } = await admin.from("stores").update({
        data: {
          ...storeRow.data,
          subscriptionAccess: {
            ...existingAccess,
            paymentLink: link.url,
            updatedAt: new Date().toISOString(),
            updatedBy: "owner-payment-link-preparation",
          },
        },
      }).eq("id", storeId);
      if (mirrorError) throw mirrorError;

      linkId = link.id;
      paymentUrl = link.url;
      referenceNumber = link.referenceNumber;
      const backgroundEmail = sendPaymentLinkEmail(admin, invoice, link);
      // Supabase keeps the function alive for this email without delaying the payment link response.
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(backgroundEmail);
      else await backgroundEmail;
      return jsonResponse({
        paid: false,
        status: "awaiting_payment",
        paymentUrl,
        referenceNumber,
        amountCentavos: invoice.amount_centavos,
      });
    }

    const response = await fetch(`${PAYMONGO_API}/payment_links/${encodeURIComponent(linkId)}/payments?status=paid`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${btoa(`${requiredEnv("PAYMONGO_SECRET_KEY")}:`)}`,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload?.errors?.[0]?.detail || payload?.error || `HTTP ${response.status}`;
      throw new Error(`PayMongo status check failed: ${String(detail).slice(0, 500)}`);
    }
    const payment = paidPaymentFromPayload(payload);
    if (!payment) return jsonResponse({
      paid: false,
      status: "awaiting_payment",
      paymentUrl,
      referenceNumber,
      amountCentavos: invoice.amount_centavos,
    });

    const mode = (Deno.env.get("PAYMONGO_MODE") || "test").toLowerCase();
    if (mode !== "test" && mode !== "live") throw new Error("PAYMONGO_MODE must be test or live.");
    if ((mode === "live") !== payment.livemode) throw new Error("PayMongo payment mode does not match the configured billing mode.");
    const { error: fulfillmentError } = await admin.rpc("fulfill_billing_invoice", {
      p_invoice_id: invoice.id,
      p_paymongo_event_id: `owner-status:${linkId}:${payment.id}`,
      p_paymongo_link_id: linkId,
      p_amount_centavos: payment.amount,
      p_currency: payment.currency,
      p_livemode: payment.livemode,
      p_paid_at: payment.paidAt,
    });
    if (fulfillmentError) throw fulfillmentError;

    const { error: paymentUpdateError } = await admin.from("billing_invoices").update({
      paymongo_payment_id: payment.id || null,
      gross_amount_centavos: payment.amount,
    }).eq("id", invoice.id);
    if (paymentUpdateError) throw paymentUpdateError;
    const { data: paidInvoice, error: paidInvoiceError } = await admin.from("billing_invoices")
      .select("amount_centavos,paid_at,period_end,paymongo_reference_number")
      .eq("id", invoice.id)
      .single();
    if (paidInvoiceError) throw paidInvoiceError;

    return jsonResponse({
      paid: true,
      amountCentavos: paidInvoice.amount_centavos,
      paidAt: paidInvoice.paid_at,
      periodEnd: paidInvoice.period_end,
      referenceNumber: paidInvoice.paymongo_reference_number,
    });
  } catch (error) {
    const message = errorMessage(error, "Payment status could not be checked.");
    console.error("Subscription payment status check failed", { error: message });
    return jsonResponse({ error: message }, 500);
  }
});
