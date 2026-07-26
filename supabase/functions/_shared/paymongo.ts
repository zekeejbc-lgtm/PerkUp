const PAYMONGO_API = "https://api.paymongo.com/v1";

export type PayMongoLinkInvoice = {
  id: string;
  subscriptionId: string;
  storeId: string;
  amountCentavos: number;
  currency: string;
  planId?: string | null;
};

export type PayMongoPaymentLink = {
  id: string;
  url: string;
  referenceNumber: string;
  livemode: boolean;
};

export const createPayMongoPaymentLink = async (
  invoice: PayMongoLinkInvoice,
  secretKey: string,
): Promise<PayMongoPaymentLink> => {
  const response = await fetch(`${PAYMONGO_API}/payment_links`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${btoa(`${secretKey}:`)}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `perkup-invoice-${invoice.id}`,
    },
    body: JSON.stringify({
      amount: invoice.amountCentavos,
      currency: invoice.currency,
      description: `PerkUp ${invoice.planId || "subscription"} subscription`,
      remarks: `Invoice ${invoice.id}`,
      metadata: {
        invoice_id: invoice.id,
        subscription_id: invoice.subscriptionId,
        store_id: invoice.storeId,
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
