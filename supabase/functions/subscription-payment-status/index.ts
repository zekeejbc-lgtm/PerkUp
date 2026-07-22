import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

const PAYMONGO_API = "https://api.paymongo.com/v1";

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
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
      .select("id,store_id,owner_user_id,status,paymongo_link_id,amount_centavos,currency,livemode,paid_at,period_end,paymongo_reference_number")
      .eq("store_id", storeId)
      .eq("owner_user_id", authData.user.id)
      .in("status", ["link_created", "paid"])
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

    const linkId = String(invoice.paymongo_link_id || "");
    if (!linkId) return jsonResponse({ paid: false, status: invoice.status });
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
    if (!payment) return jsonResponse({ paid: false, status: "awaiting_payment" });

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
    console.error("Subscription payment status check failed", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Payment status could not be checked." }, 500);
  }
});
