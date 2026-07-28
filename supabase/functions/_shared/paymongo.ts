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

export type PayMongoMode = "test" | "live";

export type PayMongoInvoiceLink = {
  paymongo_link_id?: string | null;
  status?: string | null;
  livemode?: boolean | null;
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
      "Idempotency-Key": `perk-invoice-${invoice.id}`,
    },
    body: JSON.stringify({
      amount: invoice.amountCentavos,
      currency: invoice.currency,
      description: `Perk ${invoice.planId || "subscription"} subscription`,
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

export const archivePayMongoPaymentLink = async (
  linkId: string,
  secretKey: string,
  fetcher: typeof fetch = fetch,
): Promise<void> => {
  const normalizedLinkId = String(linkId || "").trim();
  const normalizedSecretKey = String(secretKey || "").trim();
  if (!normalizedLinkId) throw new Error("PayMongo link ID is required for archival.");
  if (!normalizedSecretKey) throw new Error("PAYMONGO_SECRET_KEY is not configured.");

  const authorization = `Basic ${btoa(`${normalizedSecretKey}:`)}`;
  const linkUrl = `${PAYMONGO_API}/payment_links/${encodeURIComponent(normalizedLinkId)}`;
  let currentResponse: Response;
  try {
    currentResponse = await fetcher(linkUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: authorization,
      },
    });
  } catch {
    throw new Error("PayMongo link archival failed: network request failed.");
  }

  const currentPayload = await currentResponse.json().catch(() => ({}));
  if (!currentResponse.ok) {
    const detail = currentPayload?.errors?.[0]?.detail
      || currentPayload?.error
      || `HTTP ${currentResponse.status}`;
    throw new Error(`PayMongo link archival failed: ${String(detail).slice(0, 500)}`);
  }

  const currentResource = currentPayload?.data || {};
  const currentAttributes = currentResource?.attributes || currentResource;
  let archived = currentResource?.status === "archived"
    || currentAttributes?.status === "archived"
    || currentResource?.archived === true
    || currentAttributes?.archived === true;

  if (!archived) {
    let response: Response;
    try {
      response = await fetcher(linkUrl, {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ archive: true }),
      });
    } catch {
      throw new Error("PayMongo link archival failed: network request failed.");
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload?.errors?.[0]?.detail
        || payload?.error
        || `HTTP ${response.status}`;
      throw new Error(`PayMongo link archival failed: ${String(detail).slice(0, 500)}`);
    }

    const resource = payload?.data || {};
    const attributes = resource?.attributes || resource;
    archived = resource?.status === "archived"
      || attributes?.status === "archived"
      || resource?.archived === true
      || attributes?.archived === true;
    if (!archived) {
      throw new Error("PayMongo link archival did not confirm that the link is archived.");
    }
  }

  let paymentsResponse: Response;
  try {
    paymentsResponse = await fetcher(
      `${linkUrl}/payments?status=paid`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: authorization,
        },
      },
    );
  } catch {
    throw new Error("PayMongo payment reconciliation failed: network request failed.");
  }

  const paymentsPayload = await paymentsResponse.json().catch(() => ({}));
  if (!paymentsResponse.ok) {
    const detail = paymentsPayload?.errors?.[0]?.detail
      || paymentsPayload?.error
      || `HTTP ${paymentsResponse.status}`;
    throw new Error(`PayMongo payment reconciliation failed: ${String(detail).slice(0, 500)}`);
  }
  if (!Array.isArray(paymentsPayload?.data)) {
    throw new Error("PayMongo payment reconciliation returned an invalid response.");
  }
  if (paymentsPayload.data.length > 0) {
    throw new Error(
      "PayMongo link archival stopped deletion because the link already has a completed payment.",
    );
  }
};

export const archivePayMongoInvoiceLinks = async (
  invoices: PayMongoInvoiceLink[],
  options: {
    mode: PayMongoMode;
    secretKey?: string;
    fetcher?: typeof fetch;
  },
): Promise<{ archived: number; skippedTest: number }> => {
  if (options.mode !== "test" && options.mode !== "live") {
    throw new Error("PAYMONGO_MODE must be test or live.");
  }

  const uniqueLinks = new Map<string, boolean>();
  for (const invoice of invoices || []) {
    if (String(invoice?.status || "").trim().toLowerCase() === "paid") continue;
    const linkId = String(invoice?.paymongo_link_id || "").trim();
    if (!linkId) continue;
    if (typeof invoice?.livemode !== "boolean") {
      throw new Error(`PayMongo link ${linkId} is missing its billing mode.`);
    }
    const existingMode = uniqueLinks.get(linkId);
    if (existingMode !== undefined && existingMode !== invoice.livemode) {
      throw new Error(`PayMongo link ${linkId} has conflicting billing modes.`);
    }
    uniqueLinks.set(linkId, invoice.livemode);
  }

  let skippedTest = 0;
  const linkIds: string[] = [];
  for (const [linkId, livemode] of uniqueLinks) {
    if (options.mode === "live" && !livemode) {
      skippedTest += 1;
      continue;
    }
    if (options.mode === "test" && livemode) {
      throw new Error(
        `Live PayMongo link cannot be archived while PAYMONGO_MODE is test: ${linkId}`,
      );
    }
    linkIds.push(linkId);
  }

  if (!linkIds.length) return { archived: 0, skippedTest };
  const secretKey = String(options.secretKey || "").trim();
  if (!secretKey) throw new Error("PAYMONGO_SECRET_KEY is not configured.");

  for (const linkId of linkIds) {
    await archivePayMongoPaymentLink(linkId, secretKey, options.fetcher);
  }
  return { archived: linkIds.length, skippedTest };
};
