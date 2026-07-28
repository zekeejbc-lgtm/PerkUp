import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { jsonResponse } from "../_shared/cors.ts";
import {
  archivePayMongoInvoiceLinks,
  archivePayMongoPaymentLink,
  type PayMongoMode,
} from "../_shared/paymongo.ts";

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
  notification_type: "payment_overdue" | "access_frozen" | "payment_received" | "admin_failure" |
    "initial_payment_reminder_3d" | "initial_payment_reminder_5d" | "initial_payment_deletion_warning";
  recipient: string;
  attempt_count: number;
};

type SubscriptionUpgradeNotification = {
  notification_id: string;
  plan_change_id: string;
  notification_type: "scheduled" | "applied" | "cancelled";
  recipient: string;
  attempt_count: number;
  from_plan_snapshot: { name?: string; id?: string };
  to_plan_snapshot: { name?: string; id?: string };
  current_amount_centavos: number;
  target_amount_centavos: number;
  difference_centavos: number;
  target_period_start: string;
  terms_version: string;
  renewal_mode: "automatic" | "manual";
  store_id: string;
  owner_user_id: string;
  cancellation_reason: string | null;
};

class GasEmailError extends Error {
  code: string;
  remainingDailyRecipientQuota: number | null;

  constructor(message: string, code = "", remainingDailyRecipientQuota: number | null = null) {
    super(message);
    this.name = "GasEmailError";
    this.code = code;
    this.remainingDailyRecipientQuota = remainingDailyRecipientQuota;
  }
}

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
    headers: { "Idempotency-Key": `perk-invoice-${invoice.invoice_id}` },
    body: JSON.stringify({
      amount: invoice.amount_centavos,
      currency: invoice.currency,
      description: `Perk ${invoice.plan_id} subscription`,
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
  const resource = payments.find((candidate: Record<string, any>) => {
    const attributes = candidate?.attributes || candidate;
    return String(attributes?.status || "").toLowerCase() === "paid";
  });
  if (!resource) return null;
  const payment = resource?.attributes || resource;
  const rawPaidAt = payment.paid_at || payment.updated_at || payment.created_at;
  const numericPaidAt = Number(rawPaidAt);
  const paidAt = Number.isFinite(numericPaidAt)
    ? new Date(numericPaidAt > 10_000_000_000 ? numericPaidAt : numericPaidAt * 1000)
    : new Date(String(rawPaidAt || ""));
  return {
    id: String(resource?.id || payment.payment_id || ""),
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

const quotaRetryAt = () => new Date(Date.now() + 60 * 60_000).toISOString();

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
    const rawQuota = Number(payload?.remainingDailyRecipientQuota);
    throw new GasEmailError(
      String(payload?.error || `Email service returned HTTP ${response.status}`).slice(0, 500),
      String(payload?.code || ""),
      Number.isFinite(rawQuota) ? rawQuota : null,
    );
  }
  return payload;
};

const permanentlyDeleteDriveFile = async (fileId: string) => {
  await sendGasRequest({ action: "permanent_delete", fileId });
};

const deleteExpiredInitialAccount = async (
  supabase: any,
  storeId: string,
  ownerUserId: string,
  mode: PayMongoMode,
) => {
  const { data: storeRows, error: storesError } = await supabase.from("stores")
    .select("id,data").eq("data->>ownerId", ownerUserId);
  if (storesError) throw storesError;
  const stores = (storeRows || []) as Array<{ id: string }>;
  if (!stores.some((row) => String(row.id) === storeId)) return false;
  const storeIds = stores.map((row) => String(row.id));

  const { data: subscription, error: subscriptionError } = await supabase.from("billing_subscriptions")
    .select("id,initial_payment_required").eq("store_id", storeId).maybeSingle();
  if (subscriptionError) throw subscriptionError;
  if (!subscription?.initial_payment_required) return false;

  const { data: unpaidInvoice, error: invoiceCheckError } = await supabase.from("billing_invoices")
    .select("id,paymongo_link_id,status,livemode").eq("subscription_id", subscription.id).eq("invoice_type", "initial")
    .eq("status", "expired").maybeSingle();
  if (invoiceCheckError) throw invoiceCheckError;
  if (!unpaidInvoice) return false;

  const { data: deletionStarted, error: billingDeletionLockError } = await (supabase as any)
    .rpc("begin_expired_initial_account_deletion", {
      p_store_ids: storeIds,
      p_subscription_id: subscription.id,
      p_invoice_id: unpaidInvoice.id,
    });
  if (billingDeletionLockError) throw billingDeletionLockError;
  if (deletionStarted !== true) return false;

  await archivePayMongoInvoiceLinks([unpaidInvoice], {
    mode,
    secretKey: Deno.env.get("PAYMONGO_SECRET_KEY") || "",
  });

  const { data: staffRows, error: staffError } = await supabase.from("users")
    .select("id").in("data->>storeId", storeIds).eq("data->>role", "staff");
  if (staffError) throw staffError;
  const userIds = Array.from(new Set([
    ownerUserId,
    ...((staffRows || []) as Array<{ id: string }>).map((row) => String(row.id)),
  ]));

  const { data: ownedFiles, error: filesError } = await supabase.from("drive_files")
    .select("file_id").in("owner_id", userIds);
  if (filesError) throw filesError;
  for (const file of ownedFiles || []) {
    try {
      await permanentlyDeleteDriveFile(String(file.file_id));
      await supabase.from("drive_files").delete().eq("file_id", file.file_id);
    } catch (error) {
      console.error("Expired store Drive file cleanup failed", { fileId: file.file_id, error });
    }
  }

  for (const table of ["promotions_scanned", "feedback", "store_reviews", "cards", "products", "promotions"]) {
    const { error } = await supabase.from(table).delete().in("data->>storeId", storeIds);
    if (error) throw error;
  }
  const { error: branchRequestError } = await supabase.from("branch_requests").delete()
    .in("data->>storeId", storeIds);
  if (branchRequestError) throw branchRequestError;
  const { error: ownerBranchRequestError } = await supabase.from("branch_requests").delete()
    .eq("data->>ownerId", ownerUserId);
  if (ownerBranchRequestError) throw ownerBranchRequestError;

  const { data: applicationRows, error: applicationReadError } = await supabase.from("applications")
    .select("id").in("data->>approvedStoreId", storeIds);
  if (applicationReadError) throw applicationReadError;
  const applicationIds = ((applicationRows || []) as Array<{ id: string }>)
    .map((row) => String(row.id));
  if (applicationIds.length) {
    const { error } = await supabase.from("applications").delete().in("id", applicationIds);
    if (error) throw error;
  }

  const { error: referralError } = await supabase.from("store_referral_redemptions")
    .delete().in("store_id", storeIds);
  if (referralError) throw referralError;
  const { error: invoiceDeleteError } = await supabase.from("billing_invoices").delete().in("store_id", storeIds);
  if (invoiceDeleteError) throw invoiceDeleteError;
  const { error: subscriptionDeleteError } = await supabase.from("billing_subscriptions").delete().in("store_id", storeIds);
  if (subscriptionDeleteError) throw subscriptionDeleteError;
  const { error: storeDeleteError } = await supabase.from("stores").delete().in("id", storeIds);
  if (storeDeleteError) throw storeDeleteError;

  for (const userId of userIds) {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) console.error("Expired store Auth user cleanup failed", { userId, error });
  }
  const { error: profileDeleteError } = await supabase.from("users").delete().in("id", userIds);
  if (profileDeleteError) throw profileDeleteError;
  return true;
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
      upgradeNotificationsSent: 0,
      emailsDeferred: 0,
      reconciled: 0,
      expiredAccountsDeleted: 0,
      failed: 0,
    };
    for (const invoice of (claimed || []) as ClaimedInvoice[]) {
      let hasPersistedLink = Boolean(invoice.paymongo_link_id && invoice.payment_url);
      let createdUnpersistedLink: Awaited<ReturnType<typeof createPaymentLink>> | null = null;
      let creationMarker: string | null = null;
      let creationLeaseSuperseded = false;
      try {
        const { data: currentSubscription, error: currentSubscriptionError } = await supabase
          .from("billing_subscriptions")
          .select("automation_enabled,renewal_mode,status")
          .eq("id", invoice.subscription_id)
          .maybeSingle();
        if (currentSubscriptionError) throw currentSubscriptionError;
        if (
          !currentSubscription
          || currentSubscription.automation_enabled !== true
          || currentSubscription.renewal_mode === "manual"
          || ["paused", "cancelled"].includes(String(currentSubscription.status))
        ) {
          continue;
        }

        let link = invoice.paymongo_link_id && invoice.payment_url
          ? {
            id: invoice.paymongo_link_id,
            url: invoice.payment_url,
            referenceNumber: invoice.paymongo_reference_number || "",
            livemode: invoice.livemode,
          }
          : null;

        if (!link) {
          const creationToken = crypto.randomUUID();
          const { data: linkCreationStarted, error: linkCreationStartError } = await supabase
            .rpc("begin_paymongo_link_creation", {
              p_invoice_id: invoice.invoice_id,
              p_creation_token: creationToken,
            });
          if (linkCreationStartError) throw linkCreationStartError;
          if (linkCreationStarted !== true) continue;
          creationMarker = `PAYMONGO_LINK_CREATION_IN_PROGRESS:${creationToken}`;

          link = await createPaymentLink(invoice);
          createdUnpersistedLink = link;
          if ((mode === "live") !== link.livemode) {
            throw new Error(`PayMongo returned a ${link.livemode ? "live" : "test"} link while ${mode} mode is configured.`);
          }
          const { data: persistedInvoice, error } = await supabase.from("billing_invoices").update({
            status: "link_created",
            paymongo_link_id: link.id,
            paymongo_reference_number: link.referenceNumber,
            payment_url: link.url,
            livemode: link.livemode,
            last_error: null,
          }).eq("id", invoice.invoice_id).eq("last_error", creationMarker).select("id").maybeSingle();
          if (error) throw error;
          if (!persistedInvoice) {
            creationLeaseSuperseded = true;
            throw new Error("The PayMongo link-creation lease changed before the link could be saved.");
          }
          hasPersistedLink = true;
          createdUnpersistedLink = null;
          creationMarker = null;
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
            subscriberName: userName,
            storeName,
            planName: invoice.plan_id,
            amountCentavos: invoice.amount_centavos,
            currency: invoice.currency,
            dueAt: invoice.due_at,
            referenceNumber: link.referenceNumber,
            paymentLink: link.url,
            testMode: !link.livemode,
            initialPayment: storeRow?.data?.initialPaymentRequired === true,
            intervalDays: Number(storeRow?.data?.billingIntervalDays || 30),
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
              status: storeRow?.data?.initialPaymentRequired === true
                ? "frozen"
                : new Date(invoice.due_at).getTime() <= Date.now() ? "grace" : "warning",
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
        let preserveCreationMarker = false;
        if (createdUnpersistedLink && !creationLeaseSuperseded) {
          try {
            await archivePayMongoPaymentLink(
              createdUnpersistedLink.id,
              requiredEnv("PAYMONGO_SECRET_KEY"),
            );
          } catch (archiveError) {
            preserveCreationMarker = true;
            console.error("Unpersisted PayMongo link could not be archived", {
              invoiceId: invoice.invoice_id,
              linkId: createdUnpersistedLink.id,
              error: archiveError instanceof Error ? archiveError.message : archiveError,
            });
          }
        }
        if (!preserveCreationMarker) {
          let failureUpdate = supabase.from("billing_invoices").update({
            status: hasPersistedLink ? "link_created" : "failed",
            last_error: message.slice(0, 1000),
            next_attempt_at: retryAt(attemptCount),
          }).eq("id", invoice.invoice_id);
          if (creationMarker) {
            failureUpdate = failureUpdate.eq("last_error", creationMarker);
          }
          await failureUpdate;
        }
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

    let emailQuotaExhausted = false;
    const deferredUntil = quotaRetryAt();
    for (const notification of (notifications || []) as BillingNotification[]) {
      const attemptCount = Math.max(1, Number(notification.attempt_count || 1));
      if (emailQuotaExhausted) {
        const { error: deferError } = await supabase.from("billing_notifications").update({
          status: "pending",
          attempt_count: Math.max(0, attemptCount - 1),
          last_error: "Waiting for Google Apps Script email recipient quota to become available.",
          next_attempt_at: deferredUntil,
        }).eq("id", notification.id);
        if (deferError) throw deferError;
        results.emailsDeferred += 1;
        continue;
      }
      try {
        const { data: invoice, error: invoiceError } = await supabase
          .from("billing_invoices")
          .select("id,store_id,owner_user_id,invoice_type,period_start,period_end,due_at,amount_centavos,currency,status,paymongo_reference_number,manual_payment_reference,payment_url,livemode,paid_at,payment_method,gross_amount_centavos,fee_centavos,net_amount_centavos,last_error,subscription_id,plan_id_snapshot,plan_name_snapshot")
          .eq("id", notification.invoice_id)
          .maybeSingle();
        if (invoiceError) throw invoiceError;
        if (!invoice) throw new Error("Billing invoice was not found for its queued notification.");

        const [{ data: subscription, error: subscriptionError }, { data: storeRow, error: storeError }, { data: ownerRow, error: ownerError }] = await Promise.all([
          supabase.from("billing_subscriptions").select("plan_id,billing_email,interval_days,grace_period_days,current_period_start,current_period_end,automation_enabled,renewal_mode,status").eq("id", invoice.subscription_id).maybeSingle(),
          supabase.from("stores").select("data").eq("id", invoice.store_id).maybeSingle(),
          supabase.from("users").select("data").eq("id", invoice.owner_user_id).maybeSingle(),
        ]);
        if (subscriptionError) throw subscriptionError;
        if (storeError) throw storeError;
        if (ownerError) throw ownerError;
        if (!subscription) throw new Error("Billing subscription was not found for its queued notification.");
        if (
          notification.notification_type !== "admin_failure"
          && (
            subscription.automation_enabled !== true
            || subscription.renewal_mode === "manual"
            || ["paused", "cancelled"].includes(String(subscription.status))
          )
        ) {
          const { error: cancelledError } = await supabase.from("billing_notifications").update({
            status: "cancelled",
            last_error: "Automatic renewal is disabled.",
            next_attempt_at: new Date().toISOString(),
          }).eq("id", notification.id);
          if (cancelledError) throw cancelledError;
          continue;
        }

        const recipient = String(notification.recipient || subscription.billing_email || ownerRow?.data?.email || "").trim().toLowerCase();
        const userName = String(ownerRow?.data?.name || "Store owner").trim();
        const storeName = String(storeRow?.data?.businessName || storeRow?.data?.name || "your store").trim();
        const graceEndsAt = new Date(
          new Date(invoice.due_at).getTime() + Number(subscription.grace_period_days || 0) * 86_400_000,
        ).toISOString();
        const invoicePayload = {
          invoiceId: invoice.id,
          subscriberName: userName,
          storeName,
          planName: invoice.plan_name_snapshot || invoice.plan_id_snapshot ||
            subscription.plan_id,
          intervalDays: subscription.interval_days,
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
          referenceNumber: invoice.manual_payment_reference || invoice.paymongo_reference_number,
          paymentLink: invoice.payment_url,
          testMode: invoice.payment_method === "admin_confirmed" || String(invoice.payment_method || "").startsWith("manual_") ? false : !invoice.livemode,
          noticeType: notification.notification_type,
          renewedUntil: subscription.current_period_end,
          failureReason: invoice.last_error,
          initialPayment: invoice.invoice_type === "initial",
          adminConfirmed: invoice.payment_method === "admin_confirmed" || String(invoice.payment_method || "").startsWith("manual_"),
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
        const message = error instanceof Error ? error.message : "Billing notification failed.";
        const quotaExhausted = error instanceof GasEmailError && error.code === "EMAIL_QUOTA_EXHAUSTED";
        const remainingQuota = error instanceof GasEmailError ? error.remainingDailyRecipientQuota : null;
        if (quotaExhausted) {
          emailQuotaExhausted = true;
          results.emailsDeferred += 1;
        } else {
          results.failed += 1;
        }
        await supabase.from("billing_notifications").update({
          status: quotaExhausted ? "pending" : "failed",
          attempt_count: quotaExhausted ? Math.max(0, attemptCount - 1) : attemptCount,
          last_error: message.slice(0, 1000),
          next_attempt_at: quotaExhausted ? deferredUntil : retryAt(attemptCount),
        }).eq("id", notification.id);
        if (quotaExhausted) {
          console.warn("Billing lifecycle notification deferred until GAS email quota is available", {
            notificationId: notification.id,
            remainingDailyRecipientQuota: remainingQuota,
            nextAttemptAt: deferredUntil,
          });
        } else {
          console.error("Billing lifecycle notification failed", { notificationId: notification.id, error: message });
        }
      }
    }

    const { data: upgradeNotifications, error: upgradeNotificationClaimError } =
      await supabase.rpc("claim_subscription_upgrade_notifications", { p_limit: 50 });
    if (upgradeNotificationClaimError) throw upgradeNotificationClaimError;

    for (const notification of (upgradeNotifications || []) as SubscriptionUpgradeNotification[]) {
      const attemptCount = Math.max(1, Number(notification.attempt_count || 1));
      if (emailQuotaExhausted) {
        const { error: deferError } = await supabase
          .from("subscription_plan_change_notifications")
          .update({
            status: "pending",
            attempt_count: Math.max(0, attemptCount - 1),
            last_error: "Waiting for Google Apps Script email recipient quota to become available.",
            next_attempt_at: deferredUntil,
          })
          .eq("id", notification.notification_id);
        if (deferError) throw deferError;
        results.emailsDeferred += 1;
        continue;
      }

      try {
        const { data: ownerRow, error: ownerError } = await supabase
          .from("users")
          .select("data")
          .eq("id", notification.owner_user_id)
          .maybeSingle();
        if (ownerError) throw ownerError;
        const userName = String(ownerRow?.data?.name || "Store owner").trim();
        await sendGasRequest({
          action: `subscription_upgrade_${notification.notification_type}`,
          recipientEmail: notification.recipient,
          userName,
          upgrade: {
            fromPlanName: String(
              notification.from_plan_snapshot?.name
                || notification.from_plan_snapshot?.id
                || "Current plan",
            ),
            toPlanName: String(
              notification.to_plan_snapshot?.name
                || notification.to_plan_snapshot?.id
                || "Upgrade plan",
            ),
            amountDueTodayCentavos: 0,
            currentAmountCentavos: notification.current_amount_centavos,
            targetAmountCentavos: notification.target_amount_centavos,
            differenceCentavos: notification.difference_centavos,
            targetPeriodStart: notification.target_period_start,
            termsVersion: notification.terms_version,
            renewalMode: notification.renewal_mode,
            cancellationReason: notification.cancellation_reason,
          },
        });

        const { error: sentError } = await supabase
          .from("subscription_plan_change_notifications")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            last_error: null,
            next_attempt_at: new Date().toISOString(),
          })
          .eq("id", notification.notification_id);
        if (sentError) throw sentError;
        results.upgradeNotificationsSent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Subscription upgrade notification failed.";
        const quotaExhausted = error instanceof GasEmailError
          && error.code === "EMAIL_QUOTA_EXHAUSTED";
        if (quotaExhausted) {
          emailQuotaExhausted = true;
          results.emailsDeferred += 1;
        } else {
          results.failed += 1;
        }
        const { error: failureUpdateError } = await supabase
          .from("subscription_plan_change_notifications")
          .update({
            status: quotaExhausted ? "pending" : "failed",
            attempt_count: quotaExhausted ? Math.max(0, attemptCount - 1) : attemptCount,
            last_error: message.slice(0, 1000),
            next_attempt_at: quotaExhausted ? deferredUntil : retryAt(attemptCount),
          })
          .eq("id", notification.notification_id);
        if (failureUpdateError) throw failureUpdateError;
        console.error("Subscription upgrade notification failed", {
          notificationId: notification.notification_id,
          planChangeId: notification.plan_change_id,
          error: message,
        });
      }
    }

    const { data: expiredAccounts, error: expiredAccountsError } = await supabase
      .rpc("claim_expired_initial_payment_accounts", { p_limit: 10 });
    if (expiredAccountsError) throw expiredAccountsError;
    for (const account of expiredAccounts || []) {
      try {
        if (await deleteExpiredInitialAccount(
          supabase,
          String(account.store_id),
          String(account.owner_user_id),
          mode,
        )) results.expiredAccountsDeleted += 1;
      } catch (error) {
        results.failed += 1;
        console.error("Expired initial-payment account deletion failed", {
          storeId: account.store_id,
          ownerUserId: account.owner_user_id,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    return jsonResponse({ ok: true, mode, ...results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Billing worker failed.";
    console.error("Subscription billing worker failed", { error: message });
    return jsonResponse({ error: message }, 500);
  }
});
