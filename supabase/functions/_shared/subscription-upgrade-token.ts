const QUOTE_TOKEN_VERSION = 1 as const;
const QUOTE_TTL_MS = 15 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 30 * 1000;

export type SubscriptionUpgradeQuoteTokenErrorCode =
  | "INVALID_UPGRADE_QUOTE"
  | "EXPIRED_UPGRADE_QUOTE"
  | "STALE_UPGRADE_QUOTE";

export class SubscriptionUpgradeQuoteTokenError extends Error {
  readonly code: SubscriptionUpgradeQuoteTokenErrorCode;

  constructor(code: SubscriptionUpgradeQuoteTokenErrorCode, message: string) {
    super(message);
    this.name = "SubscriptionUpgradeQuoteTokenError";
    this.code = code;
  }
}

export type SubscriptionUpgradeQuoteClaims = {
  version: typeof QUOTE_TOKEN_VERSION;
  ownerUserId: string;
  storeId: string;
  subscriptionId: string;
  fromPlanId: string;
  toPlanId: string;
  currentAmountCentavos: number;
  targetAmountCentavos: number;
  targetPeriodStart: string;
  targetPeriodEnd: string;
  currentRenewalInvoiceId: string | null;
  currentRenewalInvoiceStatus: string | null;
  renewalMode: "automatic" | "manual";
  termsVersion: string;
  planCatalogUpdatedAt: string;
  quoteFingerprint: string;
  issuedAt: string;
  expiresAt: string;
};

export type SubscriptionUpgradeQuoteExpectation = {
  ownerUserId: string;
  storeId: string;
  targetPlanId: string;
  termsVersion: string;
  quoteFingerprint?: string;
};

const invalidQuote = (message = "The subscription upgrade quote is invalid.") =>
  new SubscriptionUpgradeQuoteTokenError("INVALID_UPGRADE_QUOTE", message);

const encodeBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const decodeBase64Url = (value: string) => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw invalidQuote();
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const importHmacKey = (secret: string) => {
  if (typeof secret !== "string" || secret.length < 32) {
    throw invalidQuote("Subscription upgrade quote signing is unavailable.");
  }
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
};

const cleanRequiredText = (value: unknown, maximum: number) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maximum) throw invalidQuote();
  return text;
};

const parseIso = (value: unknown) => {
  const text = cleanRequiredText(value, 50);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) throw invalidQuote();
  return parsed;
};

const parseAmount = (value: unknown) => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw invalidQuote();
  return Number(value);
};

const normalizeClaims = (value: unknown): SubscriptionUpgradeQuoteClaims => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidQuote();
  }
  const source = value as Record<string, unknown>;
  const issuedAt = parseIso(source.issuedAt);
  const expiresAt = parseIso(source.expiresAt);
  if (expiresAt.getTime() - issuedAt.getTime() !== QUOTE_TTL_MS) {
    throw invalidQuote();
  }
  if (source.version !== QUOTE_TOKEN_VERSION) throw invalidQuote();
  if (source.renewalMode !== "automatic" && source.renewalMode !== "manual") {
    throw invalidQuote();
  }

  const currentRenewalInvoiceId = source.currentRenewalInvoiceId === null
    ? null
    : cleanRequiredText(source.currentRenewalInvoiceId, 100);
  const currentRenewalInvoiceStatus = source.currentRenewalInvoiceStatus === null
    ? null
    : cleanRequiredText(source.currentRenewalInvoiceStatus, 40);
  if ((currentRenewalInvoiceId === null) !== (currentRenewalInvoiceStatus === null)) {
    throw invalidQuote();
  }

  const quoteFingerprint = cleanRequiredText(source.quoteFingerprint, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(quoteFingerprint)) throw invalidQuote();

  return {
    version: QUOTE_TOKEN_VERSION,
    ownerUserId: cleanRequiredText(source.ownerUserId, 100),
    storeId: cleanRequiredText(source.storeId, 100),
    subscriptionId: cleanRequiredText(source.subscriptionId, 100),
    fromPlanId: cleanRequiredText(source.fromPlanId, 80).toLowerCase(),
    toPlanId: cleanRequiredText(source.toPlanId, 80).toLowerCase(),
    currentAmountCentavos: parseAmount(source.currentAmountCentavos),
    targetAmountCentavos: parseAmount(source.targetAmountCentavos),
    targetPeriodStart: parseIso(source.targetPeriodStart).toISOString(),
    targetPeriodEnd: parseIso(source.targetPeriodEnd).toISOString(),
    currentRenewalInvoiceId,
    currentRenewalInvoiceStatus,
    renewalMode: source.renewalMode,
    termsVersion: cleanRequiredText(source.termsVersion, 80),
    planCatalogUpdatedAt: parseIso(source.planCatalogUpdatedAt).toISOString(),
    quoteFingerprint,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
};

const canonicalPayload = (claims: SubscriptionUpgradeQuoteClaims) =>
  new TextEncoder().encode(JSON.stringify(normalizeClaims(claims)));

const signaturesMatch = (left: Uint8Array, right: Uint8Array) => {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] || 0) ^ (right[index] || 0);
  }
  return difference === 0;
};

export async function resolveSubscriptionUpgradeQuoteSecret(
  configuredSecret: string | undefined,
  serviceRoleSecret: string,
) {
  const dedicatedSecret = configuredSecret?.trim() || "";
  if (dedicatedSecret) {
    if (dedicatedSecret.length < 32) {
      throw invalidQuote("Subscription upgrade quote signing is unavailable.");
    }
    return dedicatedSecret;
  }
  if (serviceRoleSecret.length < 32) {
    throw invalidQuote("Subscription upgrade quote signing is unavailable.");
  }
  const derived = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `perk:subscription-upgrade-quotes:v1:${serviceRoleSecret}`,
    ),
  );
  return Array.from(
    new Uint8Array(derived),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function signSubscriptionUpgradeQuote(
  claims: SubscriptionUpgradeQuoteClaims,
  secret: string,
) {
  const payloadBytes = canonicalPayload(claims);
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importHmacKey(secret),
    payloadBytes,
  );
  return `${encodeBase64Url(payloadBytes)}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifySubscriptionUpgradeQuote(
  token: string,
  secret: string,
  expected: SubscriptionUpgradeQuoteExpectation,
  now = new Date(),
) {
  try {
    const parts = typeof token === "string" ? token.split(".") : [];
    if (parts.length !== 2) throw invalidQuote();
    const payloadBytes = decodeBase64Url(parts[0]);
    const suppliedSignature = decodeBase64Url(parts[1]);
    const expectedSignature = new Uint8Array(await crypto.subtle.sign(
      "HMAC",
      await importHmacKey(secret),
      payloadBytes,
    ));
    if (!signaturesMatch(suppliedSignature, expectedSignature)) throw invalidQuote();

    const claims = normalizeClaims(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes)),
    );
    if (new Date(claims.issuedAt).getTime() - now.getTime() > MAX_FUTURE_SKEW_MS) {
      throw invalidQuote();
    }
    if (now.getTime() >= new Date(claims.expiresAt).getTime()) {
      throw new SubscriptionUpgradeQuoteTokenError(
        "EXPIRED_UPGRADE_QUOTE",
        "The subscription upgrade quote expired. Request and review a new quote.",
      );
    }
    if (
      claims.ownerUserId !== expected.ownerUserId
      || claims.storeId !== expected.storeId
      || claims.toPlanId !== expected.targetPlanId.toLowerCase()
      || claims.termsVersion !== expected.termsVersion
    ) {
      throw invalidQuote();
    }
    if (
      expected.quoteFingerprint
      && claims.quoteFingerprint !== expected.quoteFingerprint.toLowerCase()
    ) {
      throw new SubscriptionUpgradeQuoteTokenError(
        "STALE_UPGRADE_QUOTE",
        "The subscription upgrade quote no longer matches current billing details.",
      );
    }
    return claims;
  } catch (error) {
    if (error instanceof SubscriptionUpgradeQuoteTokenError) throw error;
    throw invalidQuote();
  }
}
