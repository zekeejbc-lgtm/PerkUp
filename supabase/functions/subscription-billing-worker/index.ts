import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { jsonResponse } from "../_shared/cors.ts";

const PAYMONGO_API = "https://api.paymongo.com/v1";
const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbxfacR_tG28iu-riTquHZK9fRHN1aRAswJNUXAdRD36dd-YlxoqskAzQkgQvm1BWUQ/exec";

type ClaimedInvoice = {
  invoice_id: string;
  subscription_id: string;
  store_id: string;
  owner_user_id: string;
  billing_email: string;
  plan_id: string;
  amount_centavos: number;
  currency: string;
  due_at: string;
  paymongo_link_id?: string | null;
  paymongo_reference_number?: string | null;
  payment_url?: string | null;
  livemode: boolean;
  notification_sent: boolean;
};

type BillingNotification = {
  id: string;
  invoice_id: string;
  notification_type: "payment_overdue" | "access_frozen" | "payment_received" | "admin_failure";
  recipient: string;
  attempt_count: number;
};

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const safeEqual = (left: string, right: string) => {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a[index] ^ b[index];
  return result === 0;
};

const paymongoRequest = async (path: string, init: RequestInit) => {
  const secret = requiredEnv("PAYMONGO_SECRET_KEY");
  const response = await fetch(`${PAYMONGO_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${btoa(`${secret}:`)}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.errors?.[0]?.detail || payload?.error || `HTTP ${response.status}`;
    throw new Error(`PayMongo request failed: ${String(detail).slice(0, 500)}`);
  }
  return payload;
};

const createPaymentLink = async (invoice: ClaimedInvoice) => {
  const payload = await paymongoRequest("/payment_links", {
    method: "POST",
    headers: { "Idempotency-Key": `perkup-invoice-${invoice.invoice_id}` },
    body: JSON.stringify({
      amount: invoice.amount_centavos,
      currency: invoice.currency,
      description: `PerkUp ${invoice.plan_id} subscription`,
      remarks: `Invoice ${invoice.invoice_id}`,
      metadata: {
        invoice_id: invoice.invoice_id,
        subscription_id: invoice.subscription_id,
        store_id: invoice.store_id,
      },
      restriction: {
        completed_sessions: { limit: 1 },
      },
    }),
  });
  const resource = payload?.data || {};
  const attributes = resource?.attributes || resource;
  const url = attributes?.checkout_url || attributes?.url || resource?.url;
  const referenceNumber = attributes?.reference_number || resource?.reference_number;
  if (!resource?.id || !url || !referenceNumber) {
    throw new Error("PayMongo returned an incomplete Payment Link response.");
  }
  return {
    id: String(resource.id),
    url: String(url),
    referenceNumber: String(referenceNumber),
    livemode: Boolean(attributes?.livemode ?? resource?.livemode),
  };
};

const retrievePaidPayment = async (linkId: string) => {
  const payload = await paymongoRequest(
    `/payment_links/${encodeURIComponent(linkId)}/payments?status=paid`,
    { method: "GET" },
  );
  const payments = Array.isArray(payload?.data) ? payload.data : [];
  const payment = payments.find((candidate: Record<string, unknown>) =>
    String(candidate?.status || "").toLowerCase() === "paid"
  );
  if (!payment) return null;
  const paidAt = new Date(String(payment.updated_at || payment.created_at || ""));
  return {
    id: String(payment.payment_id || ""),
    amount: Number(payment.amount),
    currency: String(payment.currency || "").toUpperCase(),
    livemode: Boolean(payment.livemode),
    paidAt: Number.isNaN(paidAt.getTime()) ? new Date().toISOString() : paidAt.toISOString(),
  };
};

const retryAt = (attemptCount: number) => {
  const minutes = Math.min(360, Math.max(10, 10 * 2 ** Math.min(attemptCount, 5)));
  return new Date(Date.now() + minutes * 60_000).toISOString();
};

const sendGasRequest = async (body: Record<string, unknown>) => {
  const gasSecret = requiredEnv("DRIVE_CRUD_SECRET");
  const gasUrl = Deno.env.get("GAS_EMAIL_URL") || Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") || DEFAULT_GAS_URL;
  const response = await fetch(gasUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, secret: gasSecret }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success !== true) {
    throw new Error(String(payload?.error || `Email service returned HTTP ${response.status}`).slice(0, 500));
  }
  return payload;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const expectedCronSecret = requiredEnv("BILLING_CRON_SECRET");
    const providedCronSecret = req.headers.get("x-billing-cron-secret") || "";
    if (!safeEqual(providedCronSecret, expectedCronSecret)) {
      return jsonResponse({ error: "Unauthorized." }, 401);
    }

    const supabase = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const mode = (Deno.env.get("PAYMONGO_MODE") || "test").toLowerCase();
    if (mode !== "test" && mode !== "live") throw new Error("PAYMONGO_MODE must be test or live.");

    const { error: stateError } = await supabase.rpc("refresh_billing_access_states");
    if (stateError) throw stateError;
    const { data: claimed, error: claimError } = await supabase.rpc("claim_due_billing_invoices", { p_limit: 20 });
    if (claimError) throw claimError;

    const results = {
      claimed: (claimed || []).length,
      linksCreated: 0,
      emailsSent: 0,
      remindersSent: 0,
      receiptsSent: 0,
      reconciled: 0,
      failed: 0,
    };
    for (const invoice of (claimed || []) as ClaimedInvoice[]) {
      let hasPersistedLink = Boolean(invoice.paymongo_link_id && invoice.payment_url);
      try {
        let link = invoice.paymongo_link_id && invoice.payment_url
          ? {
            id: invoice.paymongo_link_id,
            url: invoice.payment_url,
            referenceNumber: invoice.paymongo_reference_number || "",
            livemode: invoice.livemode,
          }
          : null;

        if (!link) {
          link = await createPaymentLink(invoice);
          if ((mode === "live") !== link.livemode) {
            throw new Error(`PayMongo returned a ${link.livemode ? "live" : "test"} link while ${mode} mode is configured.`);
          }
          const { error } = await supabase.from("billing_invoices").update({
            status: "link_created",
            paymongo_link_id: link.id,
            paymongo_reference_number: link.referenceNumber,
            payment_url: link.url,
            livemode: link.livemode,
            last_error: null,
          }).eq("id", invoice.invoice_id);
          if (error) throw error;
          hasPersistedLink = true;
          results.linksCreated += 1;
        }

        if (invoice.notification_sent) continue;
        const [{ data: storeRow, error: storeError }, { data: ownerRow, error: ownerError }] = await Promise.all([
          supabase.from("stores").select("data").eq("id", invoice.store_id).maybeSingle(),
          supabase.from("users").select("data").eq("id", invoice.owner_user_id).maybeSingle(),
        ]);
        if (storeError) throw storeError;
        if (ownerError) throw ownerError;

        const recipient = String(invoice.billing_email || ownerRow?.data?.email || "").trim().toLowerCase();
        const userName = String(ownerRow?.data?.name || "Store owner").trim();
        const storeName = String(storeRow?.data?.businessName || storeRow?.data?.name || "your store").trim();
        await sendGasRequest({
          action: "subscription_payment_due",
          recipientEmail: recipient,
          userName,
          invoice: {
            invoiceId: invoice.invoice_id,
            storeName,
            planName: invoice.plan_id,
            amountCentavos: invoice.amount_centavos,
            currency: invoice.currency,
            dueAt: invoice.due_at,
            referenceNumber: link.referenceNumber,
            paymentLink: link.url,
            testMode: !link.livemode,
          },
        });

        const { error: notificationError } = await supabase.from("billing_notifications").upsert({
          invoice_id: invoice.invoice_id,
          channel: "email",
          notification_type: "payment_due",
          recipient,
          status: "sent",
          attempt_count: 1,
          sent_at: new Date().toISOString(),
          last_error: null,
        }, { onConflict: "invoice_id,channel,notification_type" });
        if (notificationError) throw notificationError;

        const existingAccess = storeRow?.data?.subscriptionAccess && typeof storeRow.data.subscriptionAccess === "object"
          ? storeRow.data.subscriptionAccess
          : {};
        await supabase.from("stores").update({
          data: {
            ...storeRow?.data,
            subscriptionAccess: {
              ...existingAccess,
              status: new Date(invoice.due_at).getTime() <= Date.now() ? "grace" : "warning",
              paymentLink: link.url,
              updatedAt: new Date().toISOString(),
              updatedBy: "subscription-billing-worker",
            },
          },
        }).eq("id", invoice.store_id);
        results.emailsSent += 1;
      } catch (error) {
        results.failed += 1;
        const message = error instanceof Error ? error.message : "Billing attempt failed.";
        const { data: attemptRow } = await supabase.from("billing_invoices")
          .select("attempt_count").eq("id", invoice.invoice_id).maybeSingle();
        const attemptCount = Math.max(1, Number(attemptRow?.attempt_count || 1));
        await supabase.from("billing_invoices").update({
          status: hasPersistedLink ? "link_created" : "failed",
          last_error: message.slice(0, 1000),
          next_attempt_at: retryAt(attemptCount),
        }).eq("id", invoice.invoice_id);
        if (hasPersistedLink) {
          await supabase.from("billing_notifications").upsert({
            invoice_id: invoice.invoice_id,
            channel: "email",
            notification_type: "payment_due",
            recipient: invoice.billing_email,
            status: "failed",
            attempt_count: attemptCount,
            next_attempt_at: retryAt(attemptCount),
            last_error: message.slice(0, 1000),
          }, { onConflict: "invoice_id,channel,notification_type" });
        }
        console.error("Billing invoice processing failed", { invoiceId: invoice.invoice_id, error: message });
      }
    }

    const { data: unresolved, error: unresolvedError } = await supabase.from("billing_invoices")
      .select("id,paymongo_link_id,amount_centavos,currency,livemode")
      .eq("status", "link_created")
      .not("paymongo_link_id", "is", null)
      .order("due_at", { ascending: true })
      .limit(50);
    if (unresolvedError) throw unresolvedError;
    for (const invoice of unresolved || []) {
      try {
        const payment = await retrievePaidPayment(String(invoice.paymongo_link_id));
        if (!payment) continue;
        const { error } = await supabase.rpc("fulfill_billing_invoice", {
          p_invoice_id: invoice.id,
          p_paymongo_event_id: `reconciled:${invoice.paymongo_link_id}:${payment.id}`,
          p_paymongo_link_id: invoice.paymongo_link_id,
          p_amount_centavos: payment.amount,
          p_currency: payment.currency,
          p_livemode: payment.livemode,
          p_paid_at: payment.paidAt,
        });
        if (error) throw error;
        const { error: paymentUpdateError } = await supabase.from("billing_invoices").update({
          paymongo_payment_id: payment.id || null,
          gross_amount_centavos: payment.amount,
        }).eq("id", invoice.id);
        if (paymentUpdateError) throw paymentUpdateError;
        results.reconciled += 1;
      } catch (error) {
        results.failed += 1;
        const message = error instanceof Error ? error.message : "Payment reconciliation failed.";
        await supabase.from("billing_invoices").update({ last_error: message.slice(0, 1000) }).eq("id", invoice.id);
        console.error("Billing reconciliation failed", { invoiceId: invoice.id, error: message });
      }
    }

    const { error: queueError } = await supabase.rpc("queue_billing_lifecycle_notifications");
    if (queueError) throw queueError;

    const { data: notifications, error: notificationClaimError } = await supabase
      .rpc("claim_billing_notifications", { p_limit: 50 });
    if (notificationClaimError) throw notificationClaimError;

    for (const notification of (notifications || []) as BillingNotification[]) {
      const attemptCount = Math.max(1, Number(notification.attempt_count || 1));
      try {
        const { data: invoice, error: invoiceError } = await supabase
          .from("billing_invoices")
          .select("id,store_id,owner_user_id,period_start,period_end,due_at,amount_centavos,currency,status,paymongo_reference_number,payment_url,livemode,paid_at,payment_method,gross_amount_centavos,fee_centavos,net_amount_centavos,last_error,subscription_id")
          .eq("id", notification.invoice_id)
          .maybeSingle();
        if (invoiceError) throw invoiceError;
        if (!invoice) throw new Error("Billing invoice was not found for its queued notification.");

        const [{ data: subscription, error: subscriptionError }, { data: storeRow, error: storeError }, { data: ownerRow, error: ownerError }] = await Promise.all([
          supabase.from("billing_subscriptions").select("plan_id,billing_email,grace_period_days,current_period_start,current_period_end").eq("id", invoice.subscription_id).maybeSingle(),
          supabase.from("stores").select("data").eq("id", invoice.store_id).maybeSingle(),
          supabase.from("users").select("data").eq("id", invoice.owner_user_id).maybeSingle(),
        ]);
        if (subscriptionError) throw subscriptionError;
        if (storeError) throw storeError;
        if (ownerError) throw ownerError;
        if (!subscription) throw new Error("Billing subscription was not found for its queued notification.");

        const recipient = String(notification.recipient || subscription.billing_email || ownerRow?.data?.email || "").trim().toLowerCase();
        const userName = String(ownerRow?.data?.name || "Store owner").trim();
        const storeName = String(storeRow?.data?.businessName || storeRow?.data?.name || "your store").trim();
        const graceEndsAt = new Date(
          new Date(invoice.due_at).getTime() + Number(subscription.grace_period_days || 0) * 86_400_000,
        ).toISOString();
        const invoicePayload = {
          invoiceId: invoice.id,
          storeName,
          planName: subscription.plan_id,
          amountCentavos: invoice.amount_centavos,
          grossAmountCentavos: invoice.gross_amount_centavos,
          feeCentavos: invoice.fee_centavos,
          netAmountCentavos: invoice.net_amount_centavos,
          currency: invoice.currency,
          dueAt: invoice.due_at,
          graceEndsAt,
          periodStart: invoice.period_start,
          periodEnd: invoice.period_end,
          paidAt: invoice.paid_at,
          paymentMethod: invoice.payment_method,
          referenceNumber: invoice.paymongo_reference_number,
          paymentLink: invoice.payment_url,
          testMode: !invoice.livemode,
          noticeType: notification.notification_type,
          renewedUntil: subscription.current_period_end,
          failureReason: invoice.last_error,
        };

        await sendGasRequest({
          action: notification.notification_type === "payment_received"
            ? "subscription_payment_received"
            : notification.notification_type === "admin_failure"
            ? "subscription_billing_failure"
            : "subscription_payment_reminder",
          recipientEmail: recipient,
          userName,
          invoice: invoicePayload,
        });

        const { error: sentError } = await supabase.from("billing_notifications").update({
          status: "sent",
          attempt_count: attemptCount,
          sent_at: new Date().toISOString(),
          last_error: null,
          next_attempt_at: new Date().toISOString(),
        }).eq("id", notification.id);
        if (sentError) throw sentError;
        if (notification.notification_type === "payment_received") results.receiptsSent += 1;
        else results.remindersSent += 1;
      } catch (error) {
        results.failed += 1;
        const message = error instanceof Error ? error.message : "Billing notification failed.";
        await supabase.from("billing_notifications").update({
          status: "failed",
          attempt_count: attemptCount,
          last_error: message.slice(0, 1000),
          next_attempt_at: retryAt(attemptCount),
        }).eq("id", notification.id);
        console.error("Billing lifecycle notification failed", { notificationId: notification.id, error: message });
      }
    }

    return jsonResponse({ ok: true, mode, ...results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Billing worker failed.";
    console.error("Subscription billing worker failed", { error: message });
    return jsonResponse({ error: message }, 500);
  }
});
