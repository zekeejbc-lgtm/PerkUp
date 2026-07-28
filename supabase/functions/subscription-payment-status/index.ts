import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import {
  archivePayMongoPaymentLink,
  createPayMongoPaymentLink,
} from "../_shared/paymongo.ts";
import { maintenanceError, readRuntimeConfig } from "../_shared/runtime.ts";

const PAYMONGO_API = "https://api.paymongo.com/v1";
declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
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

const isSupabaseServiceToken = async (
  supabaseUrl: string,
  providedToken: string,
  injectedServiceKey: string,
) => {
  if (safeEqual(providedToken, injectedServiceKey)) return true;
  let claimedRole = "";
  try {
    const payload = providedToken.split(".")[1] || "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    claimedRole = String(JSON.parse(atob(normalized))?.role || "");
  } catch {
    claimedRole = "";
  }
  if (!providedToken.startsWith("sb_secret_") && claimedRole !== "service_role") return false;
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1`, {
    headers: {
      apikey: providedToken,
      Authorization: `Bearer ${providedToken}`,
    },
  });
  return response.ok;
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

const sendPaymentLinkEmail = async (
  admin: any,
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
          planName: invoice.plan_name_snapshot || invoice.plan_id_snapshot ||
            invoice.subscription?.plan_id,
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
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const bearerToken = authorization.replace(/^Bearer\s+/i, "").trim();
    const isServiceRequest = await isSupabaseServiceToken(supabaseUrl, bearerToken, serviceKey);
    let ownerUserId = "";
    if (!isServiceRequest) {
      const userClient = createClient(supabaseUrl, requiredEnv("SUPABASE_ANON_KEY"), {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false },
      });
      const { data: authData, error: authError } = await userClient.auth.getUser();
      if (authError || !authData.user) return jsonResponse({ error: "Authentication required." }, 401);
      ownerUserId = authData.user.id;
    }

    const body = await req.json().catch(() => ({}));
    if (isServiceRequest && body?.action === "health") {
      const mode = (Deno.env.get("PAYMONGO_MODE") || "test").toLowerCase();
      if (mode !== "test" && mode !== "live") throw new Error("PAYMONGO_MODE must be test or live.");
      const expectedUrl = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/paymongo-webhook`;
      const startedAt = performance.now();
      const response = await fetch(`${PAYMONGO_API}/webhooks?limit=100`, {
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${btoa(`${requiredEnv("PAYMONGO_SECRET_KEY")}:`)}`,
        },
      });
      const apiLatencyMs = Math.round(performance.now() - startedAt);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = payload?.errors?.[0]?.detail || payload?.error || `HTTP ${response.status}`;
        throw new Error(`PayMongo webhook health check failed: ${String(detail).slice(0, 500)}`);
      }
      const webhooks = Array.isArray(payload?.data) ? payload.data : [];
      const configured = webhooks.find((resource: any) => {
        const attributes = resource?.attributes || resource || {};
        return String(attributes.url || "").replace(/\/+$/, "") === expectedUrl &&
          Array.isArray(attributes.events) &&
          attributes.events.includes("link.payment.paid") &&
          Boolean(attributes.livemode) === (mode === "live");
      });
      const attributes = configured?.attributes || configured || {};
      const returnedSecret = String(attributes.secret_key || "");
      const secretMatches = returnedSecret
        ? safeEqual(returnedSecret, requiredEnv("PAYMONGO_WEBHOOK_SECRET"))
        : null;
      const enabled = String(attributes.status || "").toLowerCase() === "enabled";
      return jsonResponse({
        healthy: Boolean(configured && enabled && secretMatches !== false),
        mode,
        apiLatencyMs,
        webhook: {
          registered: Boolean(configured),
          enabled,
          eventSubscribed: Boolean(configured),
          urlMatches: Boolean(configured),
          modeMatches: Boolean(configured),
          secretMatches,
        },
      });
    }
    const storeId = String(body?.storeId || "").trim().slice(0, 100);
    if (!storeId) return jsonResponse({ error: "Store is required." }, 400);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
    const runtime = await readRuntimeConfig(admin);
    if (!isServiceRequest && runtime.mode === "maintenance") {
      return jsonResponse(maintenanceError(runtime), 503);
    }
    let subscriptionQuery = admin.from("billing_subscriptions")
      .select("id,store_id,owner_user_id,billing_email,plan_id,amount_centavos,pending_amount_centavos,pending_amount_effective_at,currency,interval_days,current_period_end,renewal_mode,automation_enabled,initial_payment_required,status")
      .eq("store_id", storeId);
    if (ownerUserId) subscriptionQuery = subscriptionQuery.eq("owner_user_id", ownerUserId);
    const { data: subscription, error: subscriptionError } = await subscriptionQuery.maybeSingle();
    if (subscriptionError) throw subscriptionError;
    if (!subscription) return jsonResponse({ paid: false, status: "pending" });
    if (subscription.status === "paused") {
      return jsonResponse({ error: "Subscription billing is paused while store deletion is pending." }, 409);
    }

    const invoiceColumns = "id,subscription_id,store_id,owner_user_id,invoice_type,status,due_at,paymongo_link_id,payment_url,amount_centavos,currency,livemode,paid_at,period_end,paymongo_reference_number,plan_id_snapshot,plan_name_snapshot,subscription:billing_subscriptions(billing_email,plan_id,automation_enabled,renewal_mode)";
    let invoiceQuery = admin.from("billing_invoices")
      .select(invoiceColumns)
      .eq("store_id", storeId)
      .in("status", ["pending", "failed", "link_created", "paid"])
      .order("created_at", { ascending: false });
    if (ownerUserId) invoiceQuery = invoiceQuery.eq("owner_user_id", ownerUserId);
    const { data: latestInvoice, error: invoiceError } = await invoiceQuery
      .limit(1)
      .maybeSingle();
    if (invoiceError) throw invoiceError;
    let invoice = latestInvoice;
    const currentPeriodEnd = new Date(subscription.current_period_end);
    const canPrepareManualRenewal = subscription.renewal_mode === "manual"
      && subscription.automation_enabled !== true
      && subscription.initial_payment_required !== true
      && !Number.isNaN(currentPeriodEnd.getTime())
      && currentPeriodEnd.getTime() <= Date.now();

    if ((!invoice || invoice.status === "paid") && canPrepareManualRenewal) {
      const pendingEffectiveAt = subscription.pending_amount_effective_at
        ? new Date(subscription.pending_amount_effective_at)
        : null;
      const usePendingAmount = Number.isInteger(subscription.pending_amount_centavos)
        && pendingEffectiveAt
        && !Number.isNaN(pendingEffectiveAt.getTime())
        && pendingEffectiveAt.getTime() <= currentPeriodEnd.getTime();
      const amountCentavos = usePendingAmount
        ? Number(subscription.pending_amount_centavos)
        : Number(subscription.amount_centavos);
      const periodEnd = new Date(
        currentPeriodEnd.getTime() + Number(subscription.interval_days || 30) * 86_400_000,
      ).toISOString();
      const insertResult = await admin.from("billing_invoices").insert({
        subscription_id: subscription.id,
        store_id: subscription.store_id,
        owner_user_id: subscription.owner_user_id,
        invoice_type: "renewal",
        period_start: currentPeriodEnd.toISOString(),
        period_end: periodEnd,
        due_at: currentPeriodEnd.toISOString(),
        amount_centavos: amountCentavos,
        currency: subscription.currency,
        status: "pending",
        next_attempt_at: new Date().toISOString(),
      }).select("id").maybeSingle();
      if (insertResult.error && insertResult.error.code !== "23505") throw insertResult.error;

      let manualInvoiceQuery = admin.from("billing_invoices")
        .select(invoiceColumns)
        .eq("subscription_id", subscription.id)
        .eq("period_start", currentPeriodEnd.toISOString());
      if (ownerUserId) manualInvoiceQuery = manualInvoiceQuery.eq("owner_user_id", ownerUserId);
      const { data: manualInvoice, error: manualInvoiceError } = await manualInvoiceQuery.maybeSingle();
      if (manualInvoiceError) throw manualInvoiceError;
      invoice = manualInvoice;
    }

    if (!invoice) return jsonResponse({ paid: false, status: "pending" });
    const invoiceSubscription = invoice.subscription as unknown as {
      billing_email?: string | null;
      plan_id?: string | null;
      automation_enabled?: boolean;
      renewal_mode?: string | null;
    } | null;
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
      const creationToken = crypto.randomUUID();
      const { data: linkCreationStarted, error: linkCreationStartError } = await admin
        .rpc("begin_paymongo_link_creation", {
          p_invoice_id: invoice.id,
          p_creation_token: creationToken,
        });
      if (linkCreationStartError) throw linkCreationStartError;
      if (linkCreationStarted !== true) {
        return jsonResponse({ error: "Payment-link creation is unavailable while store deletion is pending." }, 409);
      }

      let creationMarker: string | null = `PAYMONGO_LINK_CREATION_IN_PROGRESS:${creationToken}`;
      let link: Awaited<ReturnType<typeof createPayMongoPaymentLink>> | null = null;
      let creationLeaseSuperseded = false;
      try {
        link = await createPayMongoPaymentLink({
          id: invoice.id,
          subscriptionId: invoice.subscription_id,
          storeId: invoice.store_id,
          amountCentavos: invoice.amount_centavos,
          currency: invoice.currency,
          planId: invoice.plan_name_snapshot || invoice.plan_id_snapshot ||
            invoiceSubscription?.plan_id,
        }, requiredEnv("PAYMONGO_SECRET_KEY"));
        const mode = (Deno.env.get("PAYMONGO_MODE") || "test").toLowerCase();
        if (mode !== "test" && mode !== "live") throw new Error("PAYMONGO_MODE must be test or live.");
        if ((mode === "live") !== link.livemode) throw new Error("PayMongo payment mode does not match the configured billing mode.");

        const { data: persistedInvoice, error: linkUpdateError } = await admin.from("billing_invoices").update({
          status: "link_created",
          paymongo_link_id: link.id,
          paymongo_reference_number: link.referenceNumber,
          payment_url: link.url,
          livemode: link.livemode,
          last_error: null,
        }).eq("id", invoice.id).eq("last_error", creationMarker).select("id").maybeSingle();
        if (linkUpdateError) throw linkUpdateError;
        if (!persistedInvoice) {
          creationLeaseSuperseded = true;
          throw new Error("The PayMongo link-creation lease changed before the link could be saved.");
        }
        creationMarker = null;
      } catch (error) {
        const message = error instanceof Error ? error.message : "PayMongo link creation failed.";
        let preserveCreationMarker = false;
        if (link && !creationLeaseSuperseded) {
          try {
            await archivePayMongoPaymentLink(link.id, requiredEnv("PAYMONGO_SECRET_KEY"));
          } catch (archiveError) {
            preserveCreationMarker = true;
            console.error("Unpersisted owner PayMongo link could not be archived", {
              invoiceId: invoice.id,
              linkId: link.id,
              error: archiveError instanceof Error ? archiveError.message : archiveError,
            });
          }
        }
        if (!preserveCreationMarker) {
          let failureUpdate = admin.from("billing_invoices").update({
            status: "failed",
            last_error: message.slice(0, 1000),
            next_attempt_at: new Date(Date.now() + 10_000).toISOString(),
          }).eq("id", invoice.id);
          if (creationMarker) {
            failureUpdate = failureUpdate.eq("last_error", creationMarker);
          }
          await failureUpdate;
        }
        throw error;
      }

      if (!link) throw new Error("PayMongo link creation returned no link.");
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
      if (
        invoiceSubscription?.automation_enabled === true
        && invoiceSubscription?.renewal_mode !== "manual"
      ) {
        const backgroundEmail = sendPaymentLinkEmail(admin, invoice, link);
        // Supabase keeps the function alive for this email without delaying the payment link response.
        if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(backgroundEmail);
        else await backgroundEmail;
      }
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
