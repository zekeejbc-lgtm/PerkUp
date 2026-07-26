import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { sessionNeedsMfa } from "../_shared/auth.ts";
import { createPayMongoPaymentLink } from "../_shared/paymongo.ts";

const DEFAULT_GAS_UPLOAD_URL =
  "https://script.google.com/macros/s/AKfycbxfacR_tG28iu-riTquHZK9fRHN1aRAswJNUXAdRD36dd-YlxoqskAzQkgQvm1BWUQ/exec";
const DEFAULT_APP_URL = "https://www.perktoday.com";

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const cleanText = (value: unknown, maxLength: number) =>
  String(value || "").trim().slice(0, maxLength);

const timestamp = () => ({
  seconds: Math.floor(Date.now() / 1000),
  nanoseconds: 0,
});

const toIsoTimestamp = (value: unknown) => {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
  }
  if (value && typeof value === "object" && "seconds" in value) {
    const seconds = Number((value as { seconds?: unknown }).seconds);
    return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : "";
  }
  return "";
};

const getSubscriptionBranchLimit = (dependencies: unknown) => {
  const value = dependencies && typeof dependencies === "object"
    ? Number((dependencies as Record<string, unknown>).branchLimit ?? 1)
    : 1;
  const configuredLimit = Math.trunc(value);
  if (!Number.isFinite(configuredLimit)) return 1;
  return configuredLimit <= 0 ? 100 : Math.min(100, configuredLimit);
};

const isStrongPassword = (password: string, name: string, email: string) => {
  const normalized = password.toLowerCase();
  const personalTerms = [
    ...name.toLowerCase().split(/[^a-z0-9]+/),
    email.toLowerCase().split("@")[0],
  ].filter((term) => term.length >= 3);
  return password.length >= 12 &&
    !/\s/.test(password) &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9\s]/.test(password) &&
    personalTerms.every((term) => !normalized.includes(term));
};

type UserProfile = {
  role?: string;
  storeId?: string;
  email?: string;
  name?: string;
  username?: string;
  forcePasswordReset?: boolean;
  branchLimit?: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization") || "";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: "Authentication required." }, 401);
    if (await sessionNeedsMfa(userClient, authorization)) {
      return jsonResponse({ error: "Complete multi-factor authentication to continue.", code: "mfa_required" }, 403);
    }

    const { data: actorRow, error: actorError } = await admin
      .from("users")
      .select("data")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (actorError) throw actorError;

    const actor = (actorRow?.data || {}) as UserProfile;
    const actorIsAdmin = actor.role === "admin" || actor.role === "assistant_admin";
    const actorCanReview = actorIsAdmin || actor.role === "auditor";
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = cleanText(body.action, 40);

    if (action === "list_public_engagement") {
      if (!actorCanReview) return jsonResponse({ error: "Admin access required." }, 403);

      const [feedbackResult, newsletterResult, errorReportsResult] = await Promise.all([
        admin
          .from("site_feedback_submissions")
          .select("id,name,email,category,message,reference_number,status,public_response,internal_notes,created_at,status_updated_at,updated_at")
          .order("created_at", { ascending: false })
          .limit(1000),
        admin
          .from("newsletter_subscribers")
          .select("id,email,created_at")
          .order("created_at", { ascending: false })
          .limit(1000),
        admin
          .from("client_error_reports")
          .select("id,error_code,status,message,stack_trace,page_url,route,user_agent,app_version,context,reporter_user_id,reporter_role,internal_notes,created_at,status_updated_at,updated_at,resolved_at")
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);
      if (feedbackResult.error) throw feedbackResult.error;
      if (newsletterResult.error) throw newsletterResult.error;
      if (errorReportsResult.error) throw errorReportsResult.error;

      return jsonResponse({
        feedback: (feedbackResult.data || []).map((row) => ({
          id: row.id,
          name: row.name || "",
          email: row.email || "",
          category: row.category,
          message: row.message,
          referenceNumber: row.reference_number,
          status: row.status,
          publicResponse: row.public_response || "",
          internalNotes: row.internal_notes || "",
          createdAt: row.created_at,
          statusUpdatedAt: row.status_updated_at,
          updatedAt: row.updated_at,
        })),
        subscribers: newsletterResult.data || [],
        errorReports: (errorReportsResult.data || []).map((row) => ({
          id: row.id,
          errorCode: row.error_code,
          status: row.status,
          message: row.message,
          stack: row.stack_trace || "",
          pageUrl: row.page_url || "",
          route: row.route || "",
          userAgent: row.user_agent || "",
          appVersion: row.app_version || "",
          context: row.context || {},
          reporterUserId: row.reporter_user_id || "",
          reporterRole: row.reporter_role || "",
          internalNotes: row.internal_notes || "",
          createdAt: row.created_at,
          statusUpdatedAt: row.status_updated_at,
          updatedAt: row.updated_at,
          resolvedAt: row.resolved_at || "",
        })),
      });
    }

    if (action === "update_public_feedback") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const feedbackId = cleanText(body.feedbackId, 100);
      const status = cleanText(body.status, 30).toLowerCase();
      const publicResponse = cleanText(body.publicResponse, 2000);
      const internalNotes = cleanText(body.internalNotes, 4000);
      if (!feedbackId || !["received", "reviewing", "planned", "in_progress", "resolved", "closed"].includes(status)) {
        return jsonResponse({ error: "A feedback record and valid status are required." }, 400);
      }

      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("site_feedback_submissions")
        .update({
          status,
          public_response: publicResponse || null,
          internal_notes: internalNotes || null,
          status_updated_at: now,
          updated_at: now,
        })
        .eq("id", feedbackId)
        .select("id,status,public_response,internal_notes,status_updated_at,updated_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) return jsonResponse({ error: "Feedback was not found." }, 404);

      return jsonResponse({
        feedback: {
          id: data.id,
          status: data.status,
          publicResponse: data.public_response || "",
          internalNotes: data.internal_notes || "",
          statusUpdatedAt: data.status_updated_at,
          updatedAt: data.updated_at,
        },
      });
    }

    if (action === "update_error_report") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const reportId = cleanText(body.reportId, 100);
      const status = cleanText(body.status, 30).toLowerCase();
      const internalNotes = cleanText(body.internalNotes, 4000);
      if (!reportId || !["open", "in_progress", "fixed"].includes(status)) {
        return jsonResponse({ error: "An error report and valid status are required." }, 400);
      }

      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("client_error_reports")
        .update({
          status,
          internal_notes: internalNotes || null,
          status_updated_at: now,
          updated_at: now,
          resolved_at: status === "fixed" ? now : null,
          resolved_by: status === "fixed" ? authData.user.id : null,
        })
        .eq("id", reportId)
        .select("id,status,internal_notes,status_updated_at,updated_at,resolved_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) return jsonResponse({ error: "Error report was not found." }, 404);

      return jsonResponse({
        errorReport: {
          id: data.id,
          status: data.status,
          internalNotes: data.internal_notes || "",
          statusUpdatedAt: data.status_updated_at,
          updatedAt: data.updated_at,
          resolvedAt: data.resolved_at || "",
        },
      });
    }

    if (action === "sync_subscription_billing") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const storeId = cleanText(body.storeId, 100);
      const { data: selectedStore, error: selectedStoreError } = await admin
        .from("stores").select("id,data").eq("id", storeId).maybeSingle();
      if (selectedStoreError) throw selectedStoreError;
      if (!selectedStore) return jsonResponse({ error: "Store was not found." }, 404);
      const ownerId = cleanText(selectedStore.data?.ownerId, 100);
      const primaryStore = ownerId ? await getPrimaryStoreForOwner(admin, ownerId) : selectedStore;
      if (!primaryStore) return jsonResponse({ error: "Primary store was not found." }, 404);
      const billingSubscription = await syncBillingSubscription(admin, primaryStore);
      return jsonResponse({ updated: true, storeId: primaryStore.id, billingSubscription });
    }

    if (action === "retry_billing_invoice") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const invoiceId = cleanText(body.invoiceId, 100);
      if (!invoiceId) return jsonResponse({ error: "Invoice ID is required." }, 400);

      const { data: invoice, error: invoiceError } = await admin
        .from("billing_invoices")
        .select("id,status,paymongo_link_id")
        .eq("id", invoiceId)
        .maybeSingle();
      if (invoiceError) throw invoiceError;
      if (!invoice) return jsonResponse({ error: "Billing invoice was not found." }, 404);
      if (["paid", "void", "expired"].includes(String(invoice.status))) {
        return jsonResponse({ error: "This invoice is already closed and cannot be retried." }, 400);
      }

      const nextStatus = invoice.paymongo_link_id ? "link_created" : "pending";
      const now = new Date().toISOString();
      const { error: retryError } = await admin.from("billing_invoices").update({
        status: nextStatus,
        next_attempt_at: now,
        last_error: null,
      }).eq("id", invoice.id);
      if (retryError) throw retryError;

      const { error: notificationRetryError } = await admin.from("billing_notifications").update({
        status: "pending",
        next_attempt_at: now,
        last_error: null,
      }).eq("invoice_id", invoice.id).eq("status", "failed");
      if (notificationRetryError) throw notificationRetryError;

      return jsonResponse({ updated: true, invoiceId: invoice.id, status: nextStatus });
    }

    if (action === "record_manual_invoice_payment") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const invoiceId = cleanText(body.invoiceId, 100);
      const paymentMethod = cleanText(body.paymentMethod, 30).toLowerCase();
      const paymentReference = cleanText(body.paymentReference, 100);
      const paidAtInput = cleanText(body.paidAt, 100);
      const paidAt = new Date(paidAtInput);
      const allowedMethods = ["bank_transfer", "cash", "gcash", "maya", "cheque", "other"];

      if (!invoiceId) return jsonResponse({ error: "Invoice ID is required." }, 400);
      if (!allowedMethods.includes(paymentMethod)) {
        return jsonResponse({ error: "Select a valid manual payment method." }, 400);
      }
      if (paymentReference.length < 3) {
        return jsonResponse({ error: "Enter the receipt or transaction reference (at least 3 characters)." }, 400);
      }
      if (Number.isNaN(paidAt.getTime()) || paidAt.getTime() > Date.now() + 5 * 60_000) {
        return jsonResponse({ error: "Enter a valid paid date that is not in the future." }, 400);
      }

      const { data: invoice, error: invoiceError } = await admin
        .from("billing_invoices")
        .select("id,status")
        .eq("id", invoiceId)
        .maybeSingle();
      if (invoiceError) throw invoiceError;
      if (!invoice) return jsonResponse({ error: "Billing invoice was not found." }, 404);
      if (invoice.status === "paid") {
        return jsonResponse({ error: "This invoice is already marked as paid." }, 409);
      }
      if (["void", "expired"].includes(String(invoice.status))) {
        return jsonResponse({ error: "A closed invoice cannot be marked as paid." }, 409);
      }

      const { data: duplicateReference, error: duplicateReferenceError } = await admin
        .from("billing_invoices")
        .select("id")
        .eq("manual_payment_reference", paymentReference)
        .neq("id", invoiceId)
        .limit(1)
        .maybeSingle();
      if (duplicateReferenceError) throw duplicateReferenceError;
      if (duplicateReference) {
        return jsonResponse({ error: "That manual payment reference is already attached to another invoice." }, 409);
      }

      const { data: fulfillment, error: fulfillmentError } = await admin.rpc(
        "fulfill_billing_invoice_manually",
        {
          p_invoice_id: invoiceId,
          p_payment_method: paymentMethod,
          p_payment_reference: paymentReference,
          p_paid_at: paidAt.toISOString(),
          p_recorded_by: authData.user.id,
        },
      );
      if (fulfillmentError) throw fulfillmentError;

      return jsonResponse({ updated: true, fulfillment });
    }

    if (action === "update_subscription_access") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const storeId = cleanText(body.storeId, 100);
      const input = body.subscriptionAccess && typeof body.subscriptionAccess === "object"
        ? body.subscriptionAccess as Record<string, unknown>
        : {};
      const status = cleanText(input.status, 20).toLowerCase();
      if (!storeId || !["active", "warning", "grace", "frozen"].includes(status)) {
        return jsonResponse({ error: "A valid store and subscription access status are required." }, 400);
      }

      const gracePeriodDays = Math.trunc(Number(input.gracePeriodDays || 0));
      if (!Number.isFinite(gracePeriodDays) || gracePeriodDays < 0 || gracePeriodDays > 365 || (status === "grace" && gracePeriodDays < 1)) {
        return jsonResponse({ error: "Grace period must be between 1 and 365 days when grace access is enabled." }, 400);
      }
      const { data: selectedStore, error: selectedStoreError } = await admin
        .from("stores")
        .select("id,data")
        .eq("id", storeId)
        .maybeSingle();
      if (selectedStoreError) throw selectedStoreError;
      if (!selectedStore) return jsonResponse({ error: "Store was not found." }, 404);

      const ownerId = cleanText(selectedStore.data?.ownerId, 100);
      const primaryStore = ownerId ? await getPrimaryStoreForOwner(admin, ownerId) : selectedStore;
      if (!primaryStore) return jsonResponse({ error: "Primary store was not found." }, 404);
      if (primaryStore.data?.initialPaymentRequired === true && status !== "frozen") {
        return jsonResponse({ error: "This store is waiting for its initial PayMongo payment and must remain frozen until payment is confirmed." }, 409);
      }

      const now = new Date();
      const existingAccess = primaryStore.data?.subscriptionAccess && typeof primaryStore.data.subscriptionAccess === "object"
        ? primaryStore.data.subscriptionAccess as Record<string, unknown>
        : {};
      const subscriptionAccess = {
        ...existingAccess,
        status,
        warningMessage: cleanText(input.warningMessage, 500) || "Your PerkUp subscription is almost ending. Please settle your balance to avoid an interruption.",
        gracePeriodDays,
        graceStartedAt: status === "grace" ? now.toISOString() : "",
        graceEndsAt: status === "grace" ? new Date(now.getTime() + gracePeriodDays * 86_400_000).toISOString() : "",
        paymentInstructions: cleanText(input.paymentInstructions, 2000) || "Contact PerkUp support for payment instructions and send your proof of payment for verification.",
        paymentLink: cleanText(input.paymentLink, 2000),
        paymentContact: cleanText(input.paymentContact, 254) || "perkup.shop@youthserviceph.org",
        automationEnabled: input.automationEnabled === true,
        warningLeadDays: Math.max(0, Math.min(365, Math.trunc(Number(input.warningLeadDays ?? 7) || 0))),
        updatedAt: now.toISOString(),
        updatedBy: authData.user.id,
      };
      const { error: updateError } = await admin.from("stores").update({
        data: { ...primaryStore.data, subscriptionAccess, updatedAt: timestamp() },
      }).eq("id", primaryStore.id);
      if (updateError) throw updateError;

      const billingSubscription = await syncBillingSubscription(admin, {
        ...primaryStore,
        data: { ...primaryStore.data, subscriptionAccess },
      });

      return jsonResponse({ updated: true, storeId: primaryStore.id, subscriptionAccess, billingSubscription });
    }

    if (action === "update_account_restriction") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const storeId = cleanText(body.storeId, 100);
      const input = body.accountRestriction && typeof body.accountRestriction === "object"
        ? body.accountRestriction as Record<string, unknown>
        : {};
      const status = cleanText(input.status, 20).toLowerCase();
      const reason = cleanText(input.reason, 500);
      const internalNote = cleanText(input.internalNote, 2000);
      if (!storeId || !["active", "suspended"].includes(status)) {
        return jsonResponse({ error: "A valid store and restriction status are required." }, 400);
      }
      if (status === "suspended" && !reason) {
        return jsonResponse({ error: "Add the message the store owner will see before suspending access." }, 400);
      }

      const { data: selectedStore, error: selectedStoreError } = await admin
        .from("stores").select("id,data").eq("id", storeId).maybeSingle();
      if (selectedStoreError) throw selectedStoreError;
      if (!selectedStore) return jsonResponse({ error: "Store was not found." }, 404);
      const ownerId = cleanText(selectedStore.data?.ownerId, 100);
      const primaryStore = ownerId ? await getPrimaryStoreForOwner(admin, ownerId) : selectedStore;
      if (!primaryStore) return jsonResponse({ error: "Primary store was not found." }, 404);

      const now = new Date().toISOString();
      const existing = primaryStore.data?.accountRestriction && typeof primaryStore.data.accountRestriction === "object"
        ? primaryStore.data.accountRestriction as Record<string, unknown>
        : {};
      const accountRestriction = {
        ...existing,
        status,
        reason: reason || cleanText(existing.reason, 500),
        internalNote: status === "suspended" ? internalNote : cleanText(existing.internalNote, 2000),
        suspendedAt: status === "suspended" ? now : cleanText(existing.suspendedAt, 100),
        suspendedBy: status === "suspended" ? authData.user.id : cleanText(existing.suspendedBy, 100),
        updatedAt: now,
        updatedBy: authData.user.id,
      };
      const { error: updateError } = await admin.from("stores").update({
        data: { ...primaryStore.data, accountRestriction, updatedAt: timestamp() },
      }).eq("id", primaryStore.id);
      if (updateError) throw updateError;
      return jsonResponse({ updated: true, storeId: primaryStore.id, accountRestriction });
    }

    if (action === "create_store") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const email = cleanText(body.email, 254).toLowerCase();
      const password = String(body.password || "");
      const name = cleanText(body.name, 80);
      const storeInput = body.store && typeof body.store === "object"
        ? body.store as Record<string, unknown>
        : {};
      const storeName = cleanText(storeInput.name, 120);
      const alreadyPaid = body.alreadyPaid === true;
      const requestedSubscriptionAccess = storeInput.subscriptionAccess && typeof storeInput.subscriptionAccess === "object"
        ? storeInput.subscriptionAccess as Record<string, unknown>
        : {};
      const automaticBillingEnabled = requestedSubscriptionAccess.automationEnabled === true;
      if (!email || !name || !storeName || !isStrongPassword(password, name, email)) {
        return jsonResponse({ error: "Use a 12+ character password with upper and lowercase letters, a number, a symbol, no spaces, and no owner name or email." }, 400);
      }
      if (!alreadyPaid && !automaticBillingEnabled) {
        return jsonResponse({ error: "Enable the PayMongo standard or mark the initial subscription as already paid before creating the store." }, 400);
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name, name },
      });
      if (createError || !created.user) {
        return jsonResponse({ error: createError?.message || "Owner account creation failed." }, 400);
      }

      const ownerId = created.user.id;
      const storeId = crypto.randomUUID();
      const profile = {
        email,
        name,
        role: "store_owner",
        storeId,
        branchLimit: Math.max(1, Math.min(100, Math.trunc(Number(storeInput.branchLimit || 1)))),
        forcePasswordReset: Boolean(body.forcePasswordReset),
        createdAt: timestamp(),
        updatedAt: timestamp(),
      };
      const store: Record<string, unknown> = {
        ...storeInput,
        name: storeName,
        businessName: cleanText(storeInput.businessName, 120) || storeName,
        branchName: cleanText(storeInput.branchName, 80) || "Main",
        isPrimaryBranch: true,
        parentStoreId: storeId,
        ownerId,
        status: ["pending", "active", "suspended"].includes(String(storeInput.status))
          ? String(storeInput.status)
          : "pending",
        createdAt: timestamp(),
        updatedAt: timestamp(),
      };
      const initialPaymentRequired = automaticBillingEnabled && !alreadyPaid;
      const initialPaymentAt = new Date();
      const billingIntervalDays = Math.max(1, Math.min(365, Math.trunc(Number(storeInput.billingIntervalDays ?? 30) || 30)));
      if (alreadyPaid) {
        store.subscriptionStart = initialPaymentAt.toISOString();
        store.subscriptionEnd = new Date(initialPaymentAt.getTime() + billingIntervalDays * 86_400_000).toISOString();
      }
      if (automaticBillingEnabled) {
        store.subscriptionAccess = {
          ...requestedSubscriptionAccess,
          status: initialPaymentRequired ? "frozen" : cleanText(requestedSubscriptionAccess.status, 20) || "active",
          paymentLink: "",
          graceStartedAt: "",
          graceEndsAt: "",
          updatedAt: new Date().toISOString(),
          updatedBy: initialPaymentRequired ? "initial-payment-gate" : authData.user.id,
        };
      }
      store.initialPaymentRequired = initialPaymentRequired;
      store.initialPaymentStatus = initialPaymentRequired ? "pending" : alreadyPaid ? "paid" : "waived";
      store.billingIntervalDays = billingIntervalDays;

      const { error: profileError } = await admin.from("users").insert({ id: ownerId, data: profile });
      if (profileError) {
        await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
        throw profileError;
      }
      const { error: storeError } = await admin.from("stores").insert({ id: storeId, data: store });
      if (storeError) {
        await admin.from("users").delete().eq("id", ownerId);
        await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
        throw storeError;
      }

      let paidInitialInvoice: Record<string, unknown> | null = null;
      if ((store.subscriptionAccess as Record<string, unknown> | undefined)?.automationEnabled === true) {
        try {
          const billingSubscription = await syncBillingSubscription(admin, { id: storeId, data: store });
          if (initialPaymentRequired) {
            const periodStart = toIsoTimestamp(store.subscriptionStart);
            const periodEnd = toIsoTimestamp(store.subscriptionEnd);
            if (!billingSubscription?.id || !periodStart || !periodEnd) {
              throw new Error("The initial PayMongo invoice could not be prepared.");
            }
            const invoiceId = crypto.randomUUID();
            const dueAt = new Date().toISOString();
            const { error: invoiceError } = await admin.from("billing_invoices").insert({
              id: invoiceId,
              subscription_id: billingSubscription.id,
              store_id: storeId,
              owner_user_id: ownerId,
              invoice_type: "initial",
              period_start: periodStart,
              period_end: periodEnd,
              due_at: dueAt,
              amount_centavos: billingSubscription.amount_centavos,
              currency: billingSubscription.currency,
              status: "pending",
              next_attempt_at: dueAt,
            });
            if (invoiceError) throw invoiceError;

            let linkPersisted = false;
            try {
              const link = await createPayMongoPaymentLink({
                id: invoiceId,
                subscriptionId: billingSubscription.id,
                storeId,
                amountCentavos: billingSubscription.amount_centavos,
                currency: billingSubscription.currency,
                planId: cleanText(store.subscriptionLevel, 80),
              }, requiredEnv("PAYMONGO_SECRET_KEY"));
              const mode = (Deno.env.get("PAYMONGO_MODE") || "test").toLowerCase();
              if (mode !== "test" && mode !== "live") {
                throw new Error("PAYMONGO_MODE must be test or live.");
              }
              if ((mode === "live") !== link.livemode) {
                throw new Error("PayMongo payment mode does not match the configured billing mode.");
              }

              const { error: linkUpdateError } = await admin.from("billing_invoices").update({
                status: "link_created",
                paymongo_link_id: link.id,
                paymongo_reference_number: link.referenceNumber,
                payment_url: link.url,
                livemode: link.livemode,
                attempt_count: 1,
                next_attempt_at: dueAt,
                last_error: null,
              }).eq("id", invoiceId);
              if (linkUpdateError) throw linkUpdateError;
              linkPersisted = true;

              const existingAccess = store.subscriptionAccess && typeof store.subscriptionAccess === "object"
                ? store.subscriptionAccess as Record<string, unknown>
                : {};
              store.subscriptionAccess = {
                ...existingAccess,
                paymentLink: link.url,
                updatedAt: new Date().toISOString(),
                updatedBy: "admin-account-creation",
              };
              const { error: storeLinkError } = await admin.from("stores").update({ data: store }).eq("id", storeId);
              if (storeLinkError) throw storeLinkError;
            } catch (linkError) {
              const message = linkError instanceof Error ? linkError.message : "PayMongo link creation failed.";
              await admin.from("billing_invoices").update({
                status: linkPersisted ? "link_created" : "failed",
                attempt_count: 1,
                next_attempt_at: new Date(Date.now() + 10_000).toISOString(),
                last_error: message.slice(0, 1000),
              }).eq("id", invoiceId);
              console.error("Initial PayMongo link could not be created immediately", {
                invoiceId,
                storeId,
                error: message,
              });
            }
          } else if (alreadyPaid && billingSubscription?.id) {
            const invoiceId = crypto.randomUUID();
            const referenceNumber = `ADMIN-${invoiceId.slice(0, 8).toUpperCase()}`;
            const { error: invoiceError } = await admin.from("billing_invoices").insert({
              id: invoiceId,
              subscription_id: billingSubscription.id,
              store_id: storeId,
              owner_user_id: ownerId,
              invoice_type: "initial",
              period_start: store.subscriptionStart,
              period_end: store.subscriptionEnd,
              due_at: initialPaymentAt.toISOString(),
              amount_centavos: billingSubscription.amount_centavos,
              currency: billingSubscription.currency,
              status: "paid",
              paid_at: initialPaymentAt.toISOString(),
              payment_method: "admin_confirmed",
              gross_amount_centavos: billingSubscription.amount_centavos,
              paymongo_reference_number: referenceNumber,
              next_attempt_at: initialPaymentAt.toISOString(),
            });
            if (invoiceError) throw invoiceError;
            paidInitialInvoice = {
              invoiceId,
              storeName: store.businessName || store.name,
              planName: store.subscriptionLevel,
              amountCentavos: billingSubscription.amount_centavos,
              grossAmountCentavos: billingSubscription.amount_centavos,
              currency: billingSubscription.currency,
              dueAt: initialPaymentAt.toISOString(),
              paidAt: initialPaymentAt.toISOString(),
              renewedUntil: store.subscriptionEnd,
              paymentMethod: "admin_confirmed",
              referenceNumber,
              adminConfirmed: true,
              testMode: false,
            };
          }
        } catch (billingError) {
          await admin.from("stores").delete().eq("id", storeId);
          await admin.from("users").delete().eq("id", ownerId);
          await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
          throw billingError;
        }
      }

      const storeLogoFileId = extractDriveFileId(storeInput.logoUrl);
      if (storeLogoFileId) {
        const { error: ownershipError } = await admin
          .from("drive_files")
          .update({ owner_id: ownerId, purpose: "store-logo" })
          .eq("file_id", storeLogoFileId);
        if (ownershipError) {
          await admin.from("stores").delete().eq("id", storeId);
          await admin.from("users").delete().eq("id", ownerId);
          await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
          throw ownershipError;
        }
      }

      const applicationId = cleanText(body.applicationId, 100);
      if (applicationId) {
        const { data: applicationRow } = await admin
          .from("applications")
          .select("data")
          .eq("id", applicationId)
          .maybeSingle();
        if (applicationRow) {
          await admin.from("applications").update({
            data: {
              ...applicationRow.data,
              status: "approved",
              approvedStoreId: storeId,
              approvedAt: timestamp(),
            },
          }).eq("id", applicationId);
          const { data: applicationFile } = await admin
            .from("application_files")
            .select("file_id,url")
            .eq("application_id", applicationId)
            .maybeSingle();
          if (applicationFile) {
            await admin.from("drive_files").upsert({
              file_id: applicationFile.file_id,
              owner_id: ownerId,
              purpose: "store-logo",
              url: applicationFile.url,
            });
            await admin.from("application_files").delete().eq("file_id", applicationFile.file_id);
          }
        }
      }

      let notification = { sent: false, error: "" };
      let receiptNotification = { sent: false, error: "" };
      try {
        const ownerPortalUrl =
          `${(Deno.env.get("APP_URL") || DEFAULT_APP_URL).replace(/\/+$/, "")}/owner`;
        const { data: loginLinkData, error: loginLinkError } =
          await admin.auth.admin.generateLink({
            type: "magiclink",
            email,
            options: { redirectTo: ownerPortalUrl },
          });
        if (loginLinkError || !loginLinkData.properties?.action_link) {
          throw loginLinkError || new Error("One-time owner login link could not be generated.");
        }

        await sendStoreCreatedEmail({
          recipientEmail: email,
          userName: name,
          store,
          requirePasswordChange: Boolean(body.forcePasswordReset),
          loginLink: loginLinkData.properties.action_link,
        });
        notification = { sent: true, error: "" };
      } catch (emailError) {
        notification.error = emailError instanceof Error ? emailError.message : "Store email could not be sent.";
        console.error("Store creation email failed", { storeId, ownerId, error: notification.error });
      }

      if (alreadyPaid) {
        try {
          const amountCentavos = Math.round(Number(store.owedAmount || 0) * 100);
          await sendSubscriptionPaymentReceivedEmail({
            recipientEmail: email,
            userName: name,
            invoice: paidInitialInvoice || {
              invoiceId: crypto.randomUUID(),
              storeName: store.businessName || store.name,
              planName: store.subscriptionLevel,
              amountCentavos,
              grossAmountCentavos: amountCentavos,
              currency: "PHP",
              dueAt: initialPaymentAt.toISOString(),
              paidAt: initialPaymentAt.toISOString(),
              renewedUntil: store.subscriptionEnd,
              paymentMethod: "admin_confirmed",
              referenceNumber: `ADMIN-${storeId.slice(0, 8).toUpperCase()}`,
              adminConfirmed: true,
              testMode: false,
            },
          });
          if (paidInitialInvoice?.invoiceId) {
            const { error: receiptRecordError } = await admin.from("billing_notifications").upsert({
              invoice_id: paidInitialInvoice.invoiceId,
              channel: "email",
              notification_type: "payment_received",
              recipient: email,
              status: "sent",
              attempt_count: 1,
              sent_at: new Date().toISOString(),
              next_attempt_at: new Date().toISOString(),
              last_error: null,
            }, { onConflict: "invoice_id,channel,notification_type" });
            if (receiptRecordError) {
              console.error("Initial payment receipt delivery could not be recorded", {
                storeId,
                ownerId,
                error: receiptRecordError.message,
              });
            }
          }
          receiptNotification = { sent: true, error: "" };
        } catch (emailError) {
          receiptNotification.error = emailError instanceof Error ? emailError.message : "Payment receipt could not be sent.";
          console.error("Initial payment receipt email failed", { storeId, ownerId, error: receiptNotification.error });
          if (paidInitialInvoice?.invoiceId) {
            await admin.from("billing_notifications").upsert({
              invoice_id: paidInitialInvoice.invoiceId,
              channel: "email",
              notification_type: "payment_received",
              recipient: email,
              status: "failed",
              attempt_count: 1,
              next_attempt_at: new Date().toISOString(),
              last_error: receiptNotification.error.slice(0, 1000),
            }, { onConflict: "invoice_id,channel,notification_type" });
          }
        }
      }

      return jsonResponse({
        store: { id: storeId, ...store },
        owner: { id: ownerId, ...profile },
        notification,
        receiptNotification,
      });
    }

    if (action === "create_branch") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const ownerId = cleanText(body.ownerId, 100);
      const storeInput = body.store && typeof body.store === "object"
        ? body.store as Record<string, unknown>
        : {};
      const branchName = cleanText(storeInput.branchName || storeInput.name, 80);
      const branchAddress = cleanText(storeInput.address || storeInput.location, 300);
      const branchLatitude = Number(storeInput.lat);
      const branchLongitude = Number(storeInput.lng);
      const hasValidCoordinates = storeInput.lat !== null && storeInput.lat !== undefined &&
        storeInput.lat !== "" && storeInput.lng !== null && storeInput.lng !== undefined &&
        storeInput.lng !== "" && Number.isFinite(branchLatitude) &&
        branchLatitude >= -90 && branchLatitude <= 90 &&
        Number.isFinite(branchLongitude) &&
        branchLongitude >= -180 && branchLongitude <= 180;
      if (!ownerId || !branchName || !branchAddress || !hasValidCoordinates) {
        return jsonResponse({ error: "An owner, branch label, address, and valid map location are required." }, 400);
      }
      const ownerProfile = await getUserProfile(admin, ownerId);
      if (!ownerProfile || ownerProfile.role !== "store_owner") {
        return jsonResponse({ error: "Store owner was not found." }, 404);
      }
      const primaryStore = await getPrimaryStoreForOwner(admin, ownerId);
      if (!primaryStore) return jsonResponse({ error: "Primary store was not found." }, 404);
      const { count, error: countError } = await admin
        .from("stores")
        .select("id", { count: "exact", head: true })
        .eq("data->>ownerId", ownerId);
      if (countError) throw countError;
      const branchLimit = getSubscriptionBranchLimit(primaryStore.data?.subscriptionDependencies);
      if ((count || 0) >= branchLimit) {
        return jsonResponse({ error: `This subscription allows up to ${branchLimit} branch${branchLimit === 1 ? "" : "es"}.` }, 409);
      }
      const businessName = cleanText(primaryStore.data?.businessName || primaryStore.data?.name, 120);
      const storeName = `${businessName} - ${branchName}`;
      const storeId = crypto.randomUUID();
      const branchInput = { ...storeInput };
      delete branchInput.subscriptionLevel;
      delete branchInput.subscriptionDependencies;
      delete branchInput.subscriptionStart;
      delete branchInput.subscriptionEnd;
      delete branchInput.paymentSchedule;
      delete branchInput.owedAmount;
      delete branchInput.pendingOwedAmount;
      delete branchInput.pendingOwedAmountEffectiveAt;
      delete branchInput.branchLimit;
      const store = {
        ...branchInput,
        name: storeName,
        businessName,
        branchName,
        address: branchAddress,
        location: branchAddress,
        lat: branchLatitude,
        lng: branchLongitude,
        parentStoreId: cleanText(primaryStore.data?.parentStoreId, 100) || String(primaryStore.id),
        isPrimaryBranch: false,
        ownerId,
        status: ["pending", "active", "suspended"].includes(String(storeInput.status))
          ? String(storeInput.status)
          : "active",
        createdAt: timestamp(),
        updatedAt: timestamp(),
      };
      const { error: storeError } = await admin.from("stores").insert({ id: storeId, data: store });
      if (storeError) throw storeError;
      return jsonResponse({ store: { id: storeId, ...store } });
    }

    if (action === "decide_branch_request") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const requestId = cleanText(body.requestId, 100);
      const decision = cleanText(body.decision, 20);
      if (!requestId || !["approved", "denied"].includes(decision)) {
        return jsonResponse({ error: "A branch request and valid decision are required." }, 400);
      }

      const { data: requestRow, error: requestError } = await admin
        .from("branch_requests")
        .select("id,data")
        .eq("id", requestId)
        .maybeSingle();
      if (requestError) throw requestError;
      if (!requestRow) return jsonResponse({ error: "Branch request was not found." }, 404);

      const request = (requestRow.data || {}) as Record<string, unknown>;
      if (request.status !== "pending") {
        return jsonResponse({ error: "This branch request has already been reviewed." }, 409);
      }

      const reviewedAt = timestamp();
      if (decision === "denied") {
        const deniedRequest = {
          ...request,
          status: "denied",
          reviewedAt,
          reviewedBy: authData.user.id,
          updatedAt: reviewedAt,
        };
        const { data: deniedRows, error: denyError } = await admin
          .from("branch_requests")
          .update({ data: deniedRequest })
          .eq("id", requestId)
          .eq("data->>status", "pending")
          .select("id");
        if (denyError) throw denyError;
        if (!deniedRows?.length) return jsonResponse({ error: "This branch request has already been reviewed." }, 409);
        return jsonResponse({ request: { id: requestId, ...deniedRequest } });
      }

      const ownerId = cleanText(request.ownerId, 100);
      const branchName = cleanText(request.branchName, 80);
      const branchAddress = cleanText(request.address, 300);
      const branchLatitude = Number(request.lat);
      const branchLongitude = Number(request.lng);
      if (!ownerId || !branchName || !branchAddress || !Number.isFinite(branchLatitude) ||
        branchLatitude < -90 || branchLatitude > 90 || !Number.isFinite(branchLongitude) ||
        branchLongitude < -180 || branchLongitude > 180) {
        return jsonResponse({ error: "The branch request has incomplete or invalid location details." }, 400);
      }

      const ownerProfile = await getUserProfile(admin, ownerId);
      if (!ownerProfile || ownerProfile.role !== "store_owner") {
        return jsonResponse({ error: "Store owner was not found." }, 404);
      }
      const primaryStore = await getPrimaryStoreForOwner(admin, ownerId);
      if (!primaryStore) return jsonResponse({ error: "Primary store was not found." }, 404);
      const { count, error: countError } = await admin
        .from("stores")
        .select("id", { count: "exact", head: true })
        .eq("data->>ownerId", ownerId);
      if (countError) throw countError;
      const branchLimit = getSubscriptionBranchLimit(primaryStore.data?.subscriptionDependencies);
      if ((count || 0) >= branchLimit) {
        return jsonResponse({ error: `This subscription allows up to ${branchLimit} branch${branchLimit === 1 ? "" : "es"}.` }, 409);
      }

      const primaryData = (primaryStore.data || {}) as Record<string, unknown>;
      const businessName = cleanText(primaryData.businessName || primaryData.name, 120);
      const storeId = crypto.randomUUID();
      const processingRequest = {
        ...request,
        status: "processing",
        updatedAt: reviewedAt,
      };
      const { data: claimedRows, error: claimError } = await admin
        .from("branch_requests")
        .update({ data: processingRequest })
        .eq("id", requestId)
        .eq("data->>status", "pending")
        .select("id");
      if (claimError) throw claimError;
      if (!claimedRows?.length) {
        return jsonResponse({ error: "This branch request has already been reviewed." }, 409);
      }
      const store = {
        name: `${businessName} - ${branchName}`,
        businessName,
        branchName,
        address: branchAddress,
        location: branchAddress,
        lat: branchLatitude,
        lng: branchLongitude,
        parentStoreId: cleanText(primaryData.parentStoreId, 100) || String(primaryStore.id),
        isPrimaryBranch: false,
        ownerId,
        status: "active",
        logoUrl: primaryData.logoUrl || "",
        category: primaryData.category || "",
        createdAt: reviewedAt,
        updatedAt: reviewedAt,
      };
      const { error: storeError } = await admin.from("stores").insert({ id: storeId, data: store });
      if (storeError) {
        await admin.from("branch_requests").update({ data: request }).eq("id", requestId).eq("data->>status", "processing");
        throw storeError;
      }

      const approvedRequest = {
        ...request,
        status: "approved",
        storeId,
        reviewedAt,
        reviewedBy: authData.user.id,
        updatedAt: reviewedAt,
      };
      const { error: approveError } = await admin
        .from("branch_requests")
        .update({ data: approvedRequest })
        .eq("id", requestId)
        .eq("data->>status", "processing");
      if (approveError) {
        await admin.from("stores").delete().eq("id", storeId);
        throw approveError;
      }
      return jsonResponse({
        request: { id: requestId, ...approvedRequest },
        store: { id: storeId, ...store },
      });
    }

    if (action === "reject_application") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const applicationId = cleanText(body.applicationId, 100);
      const { data: applicationRow, error: applicationError } = await admin
        .from("applications")
        .select("data")
        .eq("id", applicationId)
        .maybeSingle();
      if (applicationError) throw applicationError;
      if (!applicationRow) return jsonResponse({ error: "Application was not found." }, 404);

      const { data: fileRows, error: filesError } = await admin
        .from("application_files")
        .select("file_id")
        .eq("application_id", applicationId);
      if (filesError) throw filesError;
      for (const file of fileRows || []) {
        await deleteDriveFile(file.file_id).catch((error) => {
          console.error("Could not delete rejected application file", file.file_id, error);
        });
      }
      await admin.from("application_files").delete().eq("application_id", applicationId);
      const { error: updateError } = await admin.from("applications").update({
        data: {
          ...applicationRow.data,
          status: "rejected",
          logoUrl: "",
          rejectedAt: timestamp(),
          updatedAt: timestamp(),
        },
      }).eq("id", applicationId);
      if (updateError) throw updateError;
      return jsonResponse({ rejected: true });
    }

    if (action === "create_account") {
      const role = cleanText(body.role, 30);
      const storeId = cleanText(body.storeId, 100);
      const email = cleanText(body.email, 254).toLowerCase();
      const password = String(body.password || "");
      const name = cleanText(body.name, 80);

      const canCreate =
        actorIsAdmin ||
        (actor.role === "store_owner" && role === "staff" && storeId && await ownsStore(admin, storeId, authData.user.id));
      const allowedRole =
        ["store_owner", "staff"].includes(role) ||
        (actorIsAdmin && role === "assistant_admin");
      if (!canCreate || !allowedRole) {
        return jsonResponse({ error: "You are not allowed to create this account." }, 403);
      }
      if (!email || !name || !isStrongPassword(password, name, email)) {
        return jsonResponse({ error: "Use a 12+ character password with upper and lowercase letters, a number, a symbol, no spaces, and no account name or email." }, 400);
      }
      if (role === "staff" && storeId) {
        const { data: storeRow, error: storeLimitError } = await admin
          .from("stores")
          .select("data")
          .eq("id", storeId)
          .maybeSingle();
        if (storeLimitError) throw storeLimitError;
        const staffLimit = Math.trunc(Number(storeRow?.data?.subscriptionDependencies?.staffLimit || 0));
        if (staffLimit > 0) {
          const { count, error: countError } = await admin
            .from("users")
            .select("id", { count: "exact", head: true })
            .eq("data->>storeId", storeId)
            .eq("data->>role", "staff");
          if (countError) throw countError;
          if ((count || 0) >= staffLimit) {
            return jsonResponse({ error: `This subscription allows up to ${staffLimit} staff account${staffLimit === 1 ? "" : "s"}.` }, 409);
          }
        }
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name, name },
      });
      if (createError || !created.user) {
        return jsonResponse({ error: createError?.message || "Account creation failed." }, 400);
      }

      const profile = {
        email,
        name,
        role,
        ...(storeId ? { storeId } : {}),
        forcePasswordReset: Boolean(body.forcePasswordReset),
        createdAt: timestamp(),
        updatedAt: timestamp(),
      };
      const { error: profileError } = await admin.from("users").insert({
        id: created.user.id,
        data: profile,
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
        throw profileError;
      }

      let notification = { sent: false, error: "" };
      if (role === "staff") {
        try {
          const staffPortalUrl =
            `${(Deno.env.get("APP_URL") || DEFAULT_APP_URL).replace(/\/+$/, "")}/staff`;
          const { data: loginLinkData, error: loginLinkError } =
            await admin.auth.admin.generateLink({
              type: "magiclink",
              email,
              options: { redirectTo: staffPortalUrl },
            });
          if (loginLinkError || !loginLinkData.properties?.action_link) {
            throw loginLinkError || new Error("One-time staff login link could not be generated.");
          }
          const { data: storeRow, error: storeError } = await admin
            .from("stores")
            .select("data")
            .eq("id", storeId)
            .maybeSingle();
          if (storeError) throw storeError;
          await sendStaffCreatedEmail({
            recipientEmail: email,
            userName: name,
            storeName: cleanText(storeRow?.data?.name, 120) || "your store",
            requirePasswordChange: Boolean(body.forcePasswordReset),
            loginLink: loginLinkData.properties.action_link,
          });
          notification = { sent: true, error: "" };
        } catch (emailError) {
          notification.error = emailError instanceof Error ? emailError.message : "Staff email could not be sent.";
          console.error("Staff creation email failed", { userId: created.user.id, storeId, error: notification.error });
        }
      }

      return jsonResponse({ user: { id: created.user.id, ...profile }, notification });
    }

    if (action === "reset_password") {
      const userId = cleanText(body.userId, 100);
      const password = String(body.password || "");
      const target = await getUserProfile(admin, userId);
      const canReset =
        actorIsAdmin ||
        (actor.role === "store_owner" &&
          target?.role === "staff" &&
          Boolean(target.storeId) &&
          await ownsStore(admin, String(target.storeId), authData.user.id));
      if (!canReset) return jsonResponse({ error: "You are not allowed to reset this password." }, 403);
      if (password.length < 8) return jsonResponse({ error: "Password must be at least 8 characters." }, 400);
      if (/\s/.test(password)) return jsonResponse({ error: "Password cannot contain spaces." }, 400);

      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      await mergeUserData(admin, userId, {
        forcePasswordReset: Boolean(body.forcePasswordReset),
        passwordResetAt: timestamp(),
      });
      return jsonResponse({ updated: true });
    }

    if (action === "complete_first_login_password_change") {
      if (!actor.forcePasswordReset) {
        return jsonResponse({ error: "A first-login password change is not required." }, 400);
      }
      const password = String(body.password || "");
      const accountName = cleanText(actor.name, 80);
      const accountEmail = cleanText(actor.email || authData.user.email, 254).toLowerCase();
      if (!isStrongPassword(password, accountName, accountEmail)) {
        return jsonResponse({ error: "Use a 12+ character password with upper and lowercase letters, a number, a symbol, no spaces, and no account name or email." }, 400);
      }
      const { error: passwordError } = await admin.auth.admin.updateUserById(authData.user.id, { password });
      if (passwordError) throw passwordError;
      await mergeUserData(admin, authData.user.id, {
        forcePasswordReset: false,
        passwordChangedAt: timestamp(),
        updatedAt: timestamp(),
      });
      return jsonResponse({ updated: true });
    }

    if (action === "delete_user") {
      const userId = cleanText(body.userId, 100);
      const target = await getUserProfile(admin, userId);
      const canDelete =
        actorIsAdmin ||
        (actor.role === "store_owner" &&
          target?.role === "staff" &&
          Boolean(target.storeId) &&
          await ownsStore(admin, String(target.storeId), authData.user.id));
      if (!canDelete) return jsonResponse({ error: "You are not allowed to delete this account." }, 403);
      await admin.from("users").delete().eq("id", userId);
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error && !error.message.toLowerCase().includes("not found")) throw error;
      return jsonResponse({ deleted: true });
    }

    if (action === "verify_account_deletion_otp") {
      if (actor.role !== "customer") {
        return jsonResponse({ error: "Customer access required." }, 403);
      }
      const otpToken = cleanText(body.otpToken, 100);
      const otpCode = cleanText(body.otpCode, 10);
      if (!otpToken || !/^\d{6}$/.test(otpCode) || !authData.user.email) {
        return jsonResponse({ error: "A valid deletion OTP is required." }, 400);
      }
      await verifyDeletionOtp(otpToken, otpCode, authData.user.email);
      const expiresAt = Date.now() + 5 * 60 * 1000;
      const deletionProof = await createDeletionProof(
        serviceKey,
        authData.user.id,
        expiresAt,
      );
      return jsonResponse({ deletionProof, expiresAt });
    }

    if (action === "delete_my_account") {
      if (actor.role !== "customer") {
        return jsonResponse({
          error: "Self-service deletion is currently available for customer accounts only.",
        }, 403);
      }

      const userId = authData.user.id;
      const username = cleanText(body.username, 80).toLowerCase();
      const password = String(body.password || "");
      const deletionProof = cleanText(body.deletionProof, 1000);
      if (!actor.username || username !== String(actor.username).trim().toLowerCase()) {
        return jsonResponse({ error: "The username does not match this account." }, 403);
      }
      if (!await verifyDeletionProof(serviceKey, deletionProof, userId)) {
        return jsonResponse({ error: "Deletion verification expired. Request a new OTP." }, 403);
      }
      if (!authData.user.email || !password) {
        return jsonResponse({ error: "Your current password is required." }, 400);
      }
      const passwordClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false },
      });
      const { data: passwordData, error: passwordError } =
        await passwordClient.auth.signInWithPassword({
          email: authData.user.email,
          password,
        });
      if (passwordError || passwordData.user?.id !== userId) {
        return jsonResponse({ error: "The password is incorrect." }, 403);
      }

      const deletedAt = timestamp();

      // Keep only an unlinkable store-facing tombstone. All reward progress is erased.
      const { data: cardRows, error: cardReadError } = await admin
        .from("cards")
        .select("id,data")
        .eq("data->>customerId", userId);
      if (cardReadError) throw cardReadError;
      for (const card of cardRows || []) {
        const { error } = await admin.from("cards").update({
          data: {
            storeId: card.data?.storeId,
            joinedAt: card.data?.joinedAt,
            customerId: `deleted:${crypto.randomUUID()}`,
            customerName: "Deleted account",
            accountDeleted: true,
            deletedAt,
            status: "deleted",
            stars: 0,
            promoProgress: {},
          },
        }).eq("id", card.id);
        if (error) throw error;
      }

      const { error: scanError } = await admin
        .from("promotions_scanned")
        .delete()
        .eq("data->>customerId", userId);
      if (scanError) throw scanError;
      const { error: feedbackError } = await admin
        .from("feedback")
        .delete()
        .eq("data->>customerId", userId);
      if (feedbackError) throw feedbackError;
      const { error: referralError } = await admin
        .from("store_referral_redemptions")
        .delete()
        .eq("customer_id", userId);
      if (referralError) throw referralError;

      const { data: files, error: filesError } = await admin
        .from("drive_files")
        .select("file_id")
        .eq("owner_id", userId);
      if (filesError) throw filesError;
      for (const file of files || []) {
        await permanentlyDeleteDriveFile(file.file_id);
        const { error: driveRowError } = await admin
          .from("drive_files")
          .delete()
          .eq("file_id", file.file_id)
          .eq("owner_id", userId);
        if (driveRowError) throw driveRowError;
      }

      const { error: customerError } = await admin.from("customers").delete().eq("id", userId);
      if (customerError) throw customerError;
      const { error: phoneError } = await admin.from("customer_phones").delete().eq("customer_id", userId);
      if (phoneError) throw phoneError;
      const { error: profileError } = await admin.from("users").delete().eq("id", userId);
      if (profileError) throw profileError;

      const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
      if (authDeleteError && !authDeleteError.message.toLowerCase().includes("not found")) {
        throw authDeleteError;
      }

      return jsonResponse({
        deleted: true,
        retained: "A de-identified deleted-account marker for each affected loyalty card",
      });
    }

    if (action === "adjust_card_stars") {
      const cardId = cleanText(body.cardId, 100);
      const delta = Math.trunc(Number(body.delta));
      if (!cardId || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100) {
        return jsonResponse({ error: "A valid card and point adjustment are required." }, 400);
      }
      const { data: cardRow, error: cardError } = await admin
        .from("cards")
        .select("data")
        .eq("id", cardId)
        .maybeSingle();
      if (cardError) throw cardError;
      if (!cardRow) return jsonResponse({ error: "Card was not found." }, 404);
      const storeId = cleanText(cardRow.data?.storeId, 100);
      const customerId = cleanText(cardRow.data?.customerId, 100);
      if (!actorIsAdmin && !(storeId && await ownsStore(admin, storeId, authData.user.id))) {
        return jsonResponse({ error: "You are not allowed to adjust this card." }, 403);
      }
      const currentStars = Number(cardRow.data?.stars || 0);
      const effectiveDelta = Math.max(delta, -currentStars);
      if (effectiveDelta !== 0) {
        const { error: incrementError } = await admin.rpc("increment_loyalty_totals", {
          p_customer_id: customerId,
          p_card_id: cardId,
          p_points: effectiveDelta,
        });
        if (incrementError) throw incrementError;
      }
      return jsonResponse({ stars: Math.max(0, currentStars + effectiveDelta) });
    }

    if (action === "adjust_card_promotion") {
      const cardId = cleanText(body.cardId, 100);
      const promotionId = cleanText(body.promotionId, 100);
      const delta = Math.trunc(Number(body.delta));
      if (!cardId || !promotionId || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100) {
        return jsonResponse({ error: "A valid card, promotion, and adjustment are required." }, 400);
      }
      const { data: cardRow, error: cardError } = await admin
        .from("cards")
        .select("data")
        .eq("id", cardId)
        .maybeSingle();
      if (cardError) throw cardError;
      if (!cardRow) return jsonResponse({ error: "Card was not found." }, 404);
      const storeId = cleanText(cardRow.data?.storeId, 100);
      if (!actorIsAdmin && !(storeId && await ownsStore(admin, storeId, authData.user.id))) {
        return jsonResponse({ error: "You are not allowed to adjust this card." }, 403);
      }
      const { data: promotionRow, error: promotionError } = await admin
        .from("promotions")
        .select("data")
        .eq("id", promotionId)
        .eq("data->>storeId", storeId)
        .maybeSingle();
      if (promotionError) throw promotionError;
      if (!promotionRow) return jsonResponse({ error: "Promotion was not found for this store." }, 404);
      const requiredStamps = Math.max(1, Math.trunc(Number(promotionRow.data?.requiredStamps || 0)));
      const progress = cardRow.data?.promoProgress && typeof cardRow.data.promoProgress === "object"
        ? { ...cardRow.data.promoProgress as Record<string, unknown> }
        : {};
      const currentProgress = Math.max(0, Number(progress[promotionId] || 0));
      if (delta > 0 && currentProgress >= requiredStamps) {
        return jsonResponse({ error: "This stamp card is already complete." }, 409);
      }
      const nextProgress = Math.min(requiredStamps, Math.max(0, currentProgress + delta));
      progress[promotionId] = nextProgress;
      const { error: updateError } = await admin.from("cards").update({
        data: { ...cardRow.data, promoProgress: progress, updatedAt: timestamp() },
      }).eq("id", cardId);
      if (updateError) throw updateError;
      return jsonResponse({ progress: nextProgress });
    }

    if (action === "delete_store" || action === "delete_store_group") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const lastSignInAt = new Date(String(authData.user.last_sign_in_at || ""));
      const recentlyAuthenticated = !Number.isNaN(lastSignInAt.getTime()) && Date.now() - lastSignInAt.getTime() <= 5 * 60_000;
      if (!recentlyAuthenticated) return jsonResponse({ error: "Please re-authenticate before deleting a store or branch." }, 401);
      const storeId = cleanText(body.storeId, 100);
      if (!storeId) return jsonResponse({ error: "Store is required." }, 400);

      const { data: storeRow, error: storeError } = await admin
        .from("stores")
        .select("data")
        .eq("id", storeId)
        .maybeSingle();
      if (storeError) throw storeError;
      if (!storeRow) return jsonResponse({ error: "Store was not found." }, 404);

      const ownerId = cleanText(storeRow.data?.ownerId, 100);
      const deleteGroup = action === "delete_store_group";
      const { data: groupStoreRows, error: groupStoreError } = deleteGroup && ownerId
        ? await admin.from("stores").select("id,data").eq("data->>ownerId", ownerId)
        : { data: [{ id: storeId, data: storeRow.data }], error: null };
      if (groupStoreError) throw groupStoreError;
      const targetStores = groupStoreRows || [];
      const storeIds = targetStores.map((row: any) => String(row.id));
      if (!storeIds.length) return jsonResponse({ error: "No store branches were found." }, 404);
      const { data: remainingStoreRows, error: remainingStoresError } = !deleteGroup && ownerId
        ? await admin
          .from("stores")
          .select("id,data")
          .eq("data->>ownerId", ownerId)
          .neq("id", storeId)
          .order("created_at", { ascending: true })
        : { data: [], error: null };
      if (remainingStoresError) throw remainingStoresError;
      const remainingStores = remainingStoreRows || [];
      const retainedPrimaryStore = !deleteGroup && remainingStores.length > 0
        ? remainingStores.find((row: any) => row.data?.isPrimaryBranch === true) || remainingStores[0]
        : null;
      const primaryStoreId = retainedPrimaryStore ? String(retainedPrimaryStore.id) : null;
      const { data: staffRows, error: usersError } = await admin
        .from("users")
        .select("id,data")
        .in("data->>storeId", storeIds)
        .eq("data->>role", "staff");
      if (usersError) throw usersError;
      const deleteOwner = Boolean(ownerId) && (deleteGroup || (remainingStoreRows || []).length === 0);
      const userIds = Array.from(new Set([
        ...(staffRows || []).map((row) => String(row.id)),
        ...(deleteOwner ? [ownerId] : []),
      ]));

      const driveFileIds = new Set<string>();
      for (const targetStore of targetStores) collectDriveFileIds(targetStore.data, driveFileIds);
      for (const staffRow of staffRows || []) collectDriveFileIds(staffRow.data, driveFileIds);
      if (deleteOwner && ownerId) {
        const { data: ownerRow, error: ownerReadError } = await admin.from("users").select("data").eq("id", ownerId).maybeSingle();
        if (ownerReadError) throw ownerReadError;
        collectDriveFileIds(ownerRow?.data, driveFileIds);
      }
      if (userIds.length) {
        const { data: ownedFiles, error: ownedFilesError } = await admin.from("drive_files").select("file_id").in("owner_id", userIds);
        if (ownedFilesError) throw ownedFilesError;
        for (const file of ownedFiles || []) driveFileIds.add(String(file.file_id));
      }

      const assetRowsByTable = new Map<string, any[]>();
      for (const table of ["products", "promotions", "store_reviews"]) {
        const { data: rows, error: readError } = await admin
          .from(table)
          .select("data")
          .in("data->>storeId", storeIds);
        if (readError) throw readError;
        const assetRows = rows || [];
        assetRowsByTable.set(table, assetRows);
        for (const row of assetRows) collectDriveFileIds(row.data, driveFileIds);
      }

      const { data: applicationRows, error: applicationReadError } = await admin
        .from("applications")
        .select("id")
        .in("data->>approvedStoreId", storeIds);
      if (applicationReadError) throw applicationReadError;
      const applicationIds = (applicationRows || []).map((row) => String(row.id));
      if (applicationIds.length) {
        const { data: applicationFiles, error: applicationFilesError } = await admin
          .from("application_files")
          .select("file_id")
          .in("application_id", applicationIds);
        if (applicationFilesError) throw applicationFilesError;
        for (const file of applicationFiles || []) driveFileIds.add(String(file.file_id));
      }

      // A branch can reuse its primary branch logo (or another managed image). Never
      // delete a file that is still referenced by a surviving branch or its data.
      const retainedDriveFileIds = new Set<string>();
      if (!deleteGroup && (remainingStoreRows || []).length) {
        const remainingStoreIds = (remainingStoreRows || []).map((row: any) => String(row.id));
        for (const remainingStore of remainingStoreRows || []) {
          collectDriveFileIds(remainingStore.data, retainedDriveFileIds);
        }
        for (const table of ["products", "promotions", "store_reviews"]) {
          const { data: rows, error: retainedReadError } = await admin
            .from(table)
            .select("data")
            .in("data->>storeId", remainingStoreIds);
          if (retainedReadError) throw retainedReadError;
          for (const row of rows || []) collectDriveFileIds(row.data, retainedDriveFileIds);
        }
      }

      // Review images belong to customers and may be reused on a review outside the
      // deletion scope, including at a store owned by someone else.
      const reviewCustomerIds = Array.from(new Set(
        (assetRowsByTable.get("store_reviews") || [])
          .map((row: any) => cleanText(row.data?.customerId, 100))
          .filter(Boolean),
      ));
      if (reviewCustomerIds.length) {
        const { data: otherCustomerReviews, error: otherReviewsError } = await admin
          .from("store_reviews")
          .select("data")
          .in("data->>customerId", reviewCustomerIds);
        if (otherReviewsError) throw otherReviewsError;
        for (const row of otherCustomerReviews || []) {
          if (!storeIds.includes(String(row.data?.storeId || ""))) {
            collectDriveFileIds(row.data, retainedDriveFileIds);
          }
        }
      }
      for (const fileId of retainedDriveFileIds) driveFileIds.delete(fileId);

      for (const table of ["promotions_scanned", "feedback", "store_reviews", "cards", "products", "promotions"]) {
        const { error } = await admin.from(table).delete().in("data->>storeId", storeIds);
        if (error) throw error;
      }
      const { error: linkedRequestDeleteError } = await admin
        .from("branch_requests")
        .delete()
        .in("data->>storeId", storeIds);
      if (linkedRequestDeleteError) throw linkedRequestDeleteError;
      if (deleteGroup && ownerId) {
        const { error: requestDeleteError } = await admin.from("branch_requests").delete().eq("data->>ownerId", ownerId);
        if (requestDeleteError) throw requestDeleteError;
      }
      if (applicationIds.length) {
        const { error: applicationDeleteError } = await admin.from("applications").delete().in("id", applicationIds);
        if (applicationDeleteError) throw applicationDeleteError;
      }
      const { error: referralDeleteError } = await admin.from("store_referral_redemptions").delete().in("store_id", storeIds);
      if (referralDeleteError) throw referralDeleteError;

      if (primaryStoreId) {
        // Billing belongs to the store group. Preserve its subscription and
        // invoice history when a surviving branch becomes the new primary.
        const { error: invoiceRelinkError } = await admin
          .from("billing_invoices")
          .update({ store_id: primaryStoreId })
          .in("store_id", storeIds);
        if (invoiceRelinkError) throw invoiceRelinkError;
        const { error: subscriptionRelinkError } = await admin
          .from("billing_subscriptions")
          .update({ store_id: primaryStoreId })
          .in("store_id", storeIds);
        if (subscriptionRelinkError) throw subscriptionRelinkError;
      } else {
        // Invoices use restrictive foreign keys so deletion must be explicit
        // and must happen before subscriptions, stores, and owner profiles.
        const { error: invoiceDeleteError } = await admin
          .from("billing_invoices")
          .delete()
          .in("store_id", storeIds);
        if (invoiceDeleteError) throw invoiceDeleteError;
        const { error: subscriptionDeleteError } = await admin
          .from("billing_subscriptions")
          .delete()
          .in("store_id", storeIds);
        if (subscriptionDeleteError) throw subscriptionDeleteError;
      }

      const { error: deleteStoreError } = await admin.from("stores").delete().in("id", storeIds);
      if (deleteStoreError) throw deleteStoreError;
      if (!deleteGroup && ownerId && retainedPrimaryStore && primaryStoreId) {
        const existingPrimary = remainingStores.find((row: any) => row.data?.isPrimaryBranch === true);
        const promotedStore = retainedPrimaryStore;

        if (!existingPrimary) {
          const subscriptionFields = [
            "subscriptionLevel", "subscriptionDependencies", "subscriptionStart", "subscriptionEnd",
            "paymentSchedule", "owedAmount", "pendingOwedAmount", "pendingOwedAmountEffectiveAt",
            "branchLimit", "subscriptionAccess",
          ];
          const promotedData = { ...promotedStore.data };
          for (const field of subscriptionFields) {
            if (storeRow.data?.[field] !== undefined) promotedData[field] = storeRow.data[field];
          }
          const { error: promoteError } = await admin.from("stores").update({
            data: { ...promotedData, isPrimaryBranch: true, parentStoreId: primaryStoreId, updatedAt: timestamp() },
          }).eq("id", primaryStoreId);
          if (promoteError) throw promoteError;
        }

        for (const remainingStore of remainingStores) {
          if (String(remainingStore.id) === primaryStoreId) continue;
          const { error: relinkError } = await admin.from("stores").update({
            data: { ...remainingStore.data, isPrimaryBranch: false, parentStoreId: primaryStoreId, updatedAt: timestamp() },
          }).eq("id", remainingStore.id);
          if (relinkError) throw relinkError;
        }
        await mergeUserData(admin, ownerId, { storeId: primaryStoreId });
      }
      const deletedUserIds: string[] = [];
      const failedUserIds: string[] = [];
      for (const userId of userIds) {
        const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
        if (authDeleteError) {
          failedUserIds.push(userId);
          console.error("Could not delete Auth user", userId, authDeleteError);
        } else {
          deletedUserIds.push(userId);
        }
      }
      if (deletedUserIds.length) {
        const { error: deleteProfilesError } = await admin.from("users").delete().in("id", deletedUserIds);
        if (deleteProfilesError) throw deleteProfilesError;
      }

      let deletedFiles = 0;
      const failedFileIds: string[] = [];
      for (const fileId of driveFileIds) {
        try {
          await permanentlyDeleteDriveFile(fileId);
          const { error: registryDeleteError } = await admin.from("drive_files").delete().eq("file_id", fileId);
          if (registryDeleteError) throw registryDeleteError;
          deletedFiles += 1;
        } catch (error) {
          failedFileIds.push(fileId);
          console.error("Could not delete Drive file", fileId, error);
        }
      }

      const cleanupComplete = failedUserIds.length === 0 && failedFileIds.length === 0;

      return jsonResponse({
        deleted: true,
        deletedStoreIds: storeIds,
        primaryStoreId,
        cleanupComplete,
        deletedUsers: deletedUserIds.length,
        failedUsers: failedUserIds.length,
        deletedFiles,
        failedFiles: failedFileIds.length,
        retainedSharedFiles: retainedDriveFileIds.size,
        ...(!cleanupComplete ? {
          cleanupWarning: "The store data was deleted, but one or more Auth accounts or Drive files need administrator cleanup.",
        } : {}),
      });
    }

    return jsonResponse({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("admin-backend failed", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Backend operation failed." }, 500);
  }
});

const ownsStore = async (admin: any, storeId: string, ownerId: string) => {
  const { data, error } = await admin
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .eq("data->>ownerId", ownerId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
};

const getPrimaryStoreForOwner = async (admin: any, ownerId: string) => {
  const { data, error } = await admin
    .from("stores")
    .select("id,data")
    .eq("data->>ownerId", ownerId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const stores = data || [];
  return stores.find((row: any) => row.data?.isPrimaryBranch === true) ||
    stores.find((row: any) => !cleanText(row.data?.parentStoreId, 100)) ||
    stores[0] ||
    null;
};

const syncBillingSubscription = async (admin: any, primaryStore: { id: string; data: Record<string, any> }) => {
  const store = primaryStore.data || {};
  const access = store.subscriptionAccess && typeof store.subscriptionAccess === "object"
    ? store.subscriptionAccess as Record<string, unknown>
    : {};
  const automationEnabled = access.automationEnabled === true;
  if (!automationEnabled) {
    const { error } = await admin.from("billing_subscriptions")
      .update({ automation_enabled: false }).eq("store_id", primaryStore.id);
    if (error && error.code !== "42P01") throw error;
    return null;
  }

  const ownerId = cleanText(store.ownerId, 100);
  const owner = ownerId ? await getUserProfile(admin, ownerId) : null;
  const billingEmail = cleanText(owner?.email, 254).toLowerCase();
  const periodStart = toIsoTimestamp(store.subscriptionStart);
  const periodEnd = toIsoTimestamp(store.subscriptionEnd);
  const amount = Number(store.owedAmount);
  const amountCentavos = Math.round(amount * 100);
  const pendingAmount = Number(store.pendingOwedAmount);
  const pendingAmountCentavos = Number.isFinite(pendingAmount) ? Math.round(pendingAmount * 100) : null;
  const pendingAmountEffectiveAt = pendingAmountCentavos && pendingAmountCentavos >= 100
    ? toIsoTimestamp(store.pendingOwedAmountEffectiveAt)
    : null;
  const planId = cleanText(store.subscriptionLevel, 80);
  if (!ownerId || !billingEmail || !periodStart || !periodEnd || !planId || !Number.isInteger(amountCentavos) || amountCentavos < 100) {
    throw new Error("Automatic PayMongo billing requires an owner email, plan, amount, subscription start, and subscription end.");
  }
  if (new Date(periodEnd).getTime() <= new Date(periodStart).getTime()) {
    throw new Error("Subscription end must be after subscription start before PayMongo automation can be enabled.");
  }
  if (cleanText(store.paymentSchedule, 60) !== "every_30_days") {
    throw new Error("PayMongo automation requires the fixed-interval payment schedule.");
  }
  const intervalDays = Math.max(1, Math.min(365, Math.trunc(Number(store.billingIntervalDays ?? 30) || 30)));

  const status = cleanText(access.status, 20).toLowerCase();
  const normalizedStatus = status === "frozen" ? "frozen" : status === "grace" ? "past_due" : "active";
  const { data, error } = await admin.from("billing_subscriptions").upsert({
    store_id: primaryStore.id,
    owner_user_id: ownerId,
    billing_email: billingEmail,
    plan_id: planId,
    amount_centavos: amountCentavos,
    pending_amount_centavos: pendingAmountCentavos && pendingAmountCentavos >= 100
      ? pendingAmountCentavos
      : null,
    pending_amount_effective_at: pendingAmountEffectiveAt,
    currency: "PHP",
    interval_days: intervalDays,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    next_billing_at: periodEnd,
    warning_lead_days: Math.max(0, Math.min(30, Math.trunc(Number(access.warningLeadDays ?? 7) || 0))),
    grace_period_days: Math.max(0, Math.min(30, Math.trunc(Number(access.gracePeriodDays ?? 3) || 0))),
    status: normalizedStatus,
    automation_enabled: true,
    initial_payment_required: store.initialPaymentRequired === true,
  }, { onConflict: "store_id" }).select("id,store_id,status,automation_enabled,next_billing_at,amount_centavos,currency,pending_amount_centavos,pending_amount_effective_at,initial_payment_required").single();
  if (error) throw error;
  return data;
};

const getUserProfile = async (admin: any, userId: string): Promise<UserProfile | null> => {
  const { data, error } = await admin.from("users").select("data").eq("id", userId).maybeSingle();
  if (error) throw error;
  return (data?.data as UserProfile | undefined) || null;
};

const mergeUserData = async (admin: any, userId: string, patch: Record<string, unknown>) => {
  const profile = await getUserProfile(admin, userId);
  if (!profile) throw new Error("User profile was not found.");
  const { error } = await admin.from("users").update({
    data: { ...profile, ...patch, updatedAt: timestamp() },
  }).eq("id", userId);
  if (error) throw error;
};

const DRIVE_FILE_ID_PATTERNS = [
  /\/file\/d\/([a-zA-Z0-9_-]+)/,
  /[?&]id=([a-zA-Z0-9_-]+)/,
  /[?&]fileId=([a-zA-Z0-9_-]+)/,
  /\/d\/([a-zA-Z0-9_-]+)/,
];

const extractDriveFileId = (value: unknown) => {
  const url = String(value || "").trim();
  for (const pattern of DRIVE_FILE_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
};

const collectDriveFileIds = (value: unknown, result: Set<string>) => {
  if (typeof value === "string") {
    for (const pattern of DRIVE_FILE_ID_PATTERNS) {
      const match = value.match(pattern);
      if (match?.[1]) result.add(match[1]);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectDriveFileIds(entry, result));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((entry) => collectDriveFileIds(entry, result));
  }
};

const deleteDriveFile = async (fileId: string) => {
  const secret = requiredEnv("DRIVE_CRUD_SECRET");
  const url = Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") || DEFAULT_GAS_UPLOAD_URL;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "delete", secret, fileId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || `Drive delete failed with HTTP ${response.status}.`);
};

const permanentlyDeleteDriveFile = async (fileId: string) => {
  const secret = requiredEnv("DRIVE_CRUD_SECRET");
  const url = Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") || DEFAULT_GAS_UPLOAD_URL;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "permanent_delete", secret, fileId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.permanentlyDeleted) {
    throw new Error(data.error || `Drive permanent deletion failed with HTTP ${response.status}.`);
  }
};

const deletionProofPayload = (userId: string, expiresAt: number) => `${userId}.${expiresAt}`;

const createDeletionProof = async (secret: string, userId: string, expiresAt: number) => {
  const payload = deletionProofPayload(userId, expiresAt);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${expiresAt}.${bytesToHex(new Uint8Array(signature))}`;
};

const verifyDeletionProof = async (secret: string, proof: string, userId: string) => {
  const [expiresText, signatureHex, ...rest] = proof.split(".");
  const expiresAt = Number(expiresText);
  if (rest.length || !Number.isFinite(expiresAt) || expiresAt < Date.now() || !/^[a-f0-9]{64}$/.test(signatureHex || "")) {
    return false;
  }
  const expected = await createDeletionProof(secret, userId, expiresAt);
  return timingSafeEqual(expected, proof);
};

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

const verifyDeletionOtp = async (otpToken: string, otpCode: string, email: string) => {
  const url = Deno.env.get("GAS_EMAIL_URL") ||
    Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") ||
    DEFAULT_GAS_UPLOAD_URL;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "verify_otp",
      otpToken,
      otpCode,
      recipientEmail: email,
      // The deployed GAS service currently supports this identity-verification purpose.
      // This endpoint only verifies the code; it never updates the user's email.
      purpose: "email_change",
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.otp?.verified) {
    throw new Error(data.error || "The deletion OTP is invalid or expired.");
  }
};

const emailDate = (value: unknown) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "seconds" in value) {
    const seconds = Number((value as { seconds?: unknown }).seconds);
    if (Number.isFinite(seconds)) {
      return new Intl.DateTimeFormat("en-PH", {
        dateStyle: "long",
        timeZone: "Asia/Manila",
      }).format(new Date(seconds * 1000));
    }
  }
  return "";
};

const paymentScheduleLabel = (value: unknown, intervalDays: unknown = 30) => {
  const schedule = cleanText(value, 60);
  if (schedule === "every_30_days") return `Every ${Math.max(1, Math.min(365, Math.trunc(Number(intervalDays) || 30)))} days from subscription start`;
  return schedule.replaceAll("_", " ");
};

const sendStoreCreatedEmail = async ({
  recipientEmail,
  userName,
  store,
  requirePasswordChange,
  loginLink,
}: {
  recipientEmail: string;
  userName: string;
  store: Record<string, unknown>;
  requirePasswordChange: boolean;
  loginLink: string;
}) => {
  const url = Deno.env.get("GAS_EMAIL_URL") ||
    Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") ||
    DEFAULT_GAS_UPLOAD_URL;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "store_created",
      secret: requiredEnv("DRIVE_CRUD_SECRET"),
      recipientEmail,
      userName,
      requirePasswordChange,
      loginLink,
      store: {
        name: cleanText(store.name, 120),
        location: cleanText(store.location || store.address, 240),
        logoUrl: cleanText(store.logoUrl, 2000),
        subscriptionLevel: cleanText(store.subscriptionLevel, 80),
        paymentSchedule: paymentScheduleLabel(store.paymentSchedule, store.billingIntervalDays),
        subscriptionStart: emailDate(store.subscriptionStart),
        subscriptionEnd: emailDate(store.subscriptionEnd),
        amountDue: Number(store.owedAmount || 0),
        billingIntervalDays: Math.max(1, Math.min(365, Math.trunc(Number(store.billingIntervalDays) || 30))),
        initialPaymentRequired: store.initialPaymentRequired === true,
        initialPaymentStatus: cleanText(store.initialPaymentStatus, 20),
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.email) {
    throw new Error(data.error || `Store email failed with HTTP ${response.status}.`);
  }
};

const sendSubscriptionPaymentReceivedEmail = async ({
  recipientEmail,
  userName,
  invoice,
}: {
  recipientEmail: string;
  userName: string;
  invoice: Record<string, unknown>;
}) => {
  const url = Deno.env.get("GAS_EMAIL_URL") ||
    Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") ||
    DEFAULT_GAS_UPLOAD_URL;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "subscription_payment_received",
      secret: requiredEnv("DRIVE_CRUD_SECRET"),
      recipientEmail,
      userName,
      invoice,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.email) {
    throw new Error(data.error || `Payment receipt email failed with HTTP ${response.status}.`);
  }
};

const sendStaffCreatedEmail = async ({
  recipientEmail,
  userName,
  storeName,
  requirePasswordChange,
  loginLink,
}: {
  recipientEmail: string;
  userName: string;
  storeName: string;
  requirePasswordChange: boolean;
  loginLink: string;
}) => {
  const url = Deno.env.get("GAS_EMAIL_URL") ||
    Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") ||
    DEFAULT_GAS_UPLOAD_URL;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "staff_created",
      secret: requiredEnv("DRIVE_CRUD_SECRET"),
      recipientEmail,
      userName,
      storeName,
      requirePasswordChange,
      loginLink,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.email) {
    throw new Error(data.error || `Staff email failed with HTTP ${response.status}.`);
  }
};
