import { supabase } from "./supabase";

export const LEGACY_CUSTOMER_QR_PREFIX = "perk:v1:";
export const RETIRED_CUSTOMER_QR_PREFIX = "perk:v2:";
export const SECURE_CUSTOMER_QR_PREFIX = "perk:v3:";
export const CUSTOMER_PROFILE_QR_PREFIX = "perk:user:v1:";
export const CUSTOMER_SCAN_PATH = "/scan";

export type ParsedCustomerQr =
  | { kind: "secure"; scanToken: string }
  | { kind: "profile"; manualUsername: string };

export type IssuedCustomerQr = {
  token: string;
  expiresAt: string | null;
  ttlSeconds: number | null;
};

export type RedeemedCustomerScan = {
  customer: {
    id: string;
    publicId?: string | null;
    username: string;
    maskedName: string;
    birthday: string | null;
    profilePic: string | null;
    existingStars: number;
    newStars: number;
    cards?: CustomerScanCard[];
  };
  points: number;
  ticket?: ScanTicket;
};

export type ScanTicket = {
  id: string;
  ticketNumber: string;
  legacyTicketNumber?: string;
  cryptographicId?: string;
  status: "issued";
  staffId: string;
  staffName: string;
  storeId: string;
  storeName: string;
  promotionId: string | null;
  promotionTitle: string | null;
  points: number;
  issuedAt: string;
};

export type CustomerScanCard = {
  id: string;
  label: string;
  storeName: string;
  stars: number;
  promoProgress?: Record<string, number>;
  status: string;
  joinedAt: unknown;
  updatedAt: unknown;
  stampIcon?: string;
  stampColor?: string;
  stampLabel?: string;
};

export type ScannerLocation = {
  lat: number;
  lng: number;
  accuracy?: number;
};

export type StoreReferralCode = {
  referralCode: string;
  promotionCount: number;
  referralCount: number;
  expiresAt: string;
};

export type StoreReferralStats = {
  referralCount: number;
};

export type RedeemedStoreReferral = {
  referralCode: string;
  storeId: string;
  storeName: string;
  points: number;
  existingStars: number;
  newStars: number;
};

export type ValidatedStoreReferral = {
  referralCode: string;
  storeId: string;
  storeName: string;
  promotionCount: number;
  expiresAt: string;
};

const getFunctionErrorMessage = async (error: unknown, fallback: string) => {
  if (!error || typeof error !== "object") return fallback;
  const maybeContext = error as { context?: { json?: () => Promise<{ error?: string }> }; message?: string };
  if (maybeContext.context?.json) {
    try {
      const body = await maybeContext.context.json();
      if (body?.error) return body.error;
    } catch {
      // Fall through to the SDK message.
    }
  }
  return maybeContext.message || fallback;
};

export const isSecureCustomerQr = (value: string) =>
  value.trim().startsWith(SECURE_CUSTOMER_QR_PREFIX) ||
  value.trim().startsWith(RETIRED_CUSTOMER_QR_PREFIX) ||
  value.trim().startsWith(LEGACY_CUSTOMER_QR_PREFIX);

export const normalizeCustomerUsername = (value: string) =>
  value.trim().replace(/^@+/, "").toLowerCase();

const getAppOrigin = () => {
  if (typeof window !== "undefined") return window.location.origin;
  return "https://www.perktoday.com";
};

export const buildCustomerScanUrl = (input: { scanToken?: string; username?: string }) => {
  const params = new URLSearchParams();
  const scanToken = String(input.scanToken || "").trim();
  const username = normalizeCustomerUsername(String(input.username || ""));

  if (scanToken) params.set("token", scanToken);
  else if (username) params.set("user", username);

  return `${getAppOrigin()}${CUSTOMER_SCAN_PATH}#${params.toString()}`;
};

// Scanner-native values stay compact and do not depend on the environment URL.
// Keep buildCustomerScanUrl for ordinary phone-camera landing links and legacy QRs.
export const buildCustomerQrPayload = (input: { scanToken?: string; username?: string }) => {
  const scanToken = String(input.scanToken || "").trim();
  if (scanToken) return scanToken;

  const username = normalizeCustomerUsername(String(input.username || ""));
  return username ? `${CUSTOMER_PROFILE_QR_PREFIX}${username}` : "";
};

export const parseCustomerQr = (value: string): ParsedCustomerQr | null => {
  const rawValue = String(value || "").trim();
  if (isSecureCustomerQr(rawValue)) return { kind: "secure", scanToken: rawValue };
  if (rawValue.toLowerCase().startsWith(CUSTOMER_PROFILE_QR_PREFIX)) {
    const username = normalizeCustomerUsername(rawValue.slice(CUSTOMER_PROFILE_QR_PREFIX.length));
    return username ? { kind: "profile", manualUsername: username } : null;
  }

  try {
    const url = new URL(rawValue);
    if (url.origin !== getAppOrigin() || url.pathname.replace(/\/+$/, "") !== CUSTOMER_SCAN_PATH) return null;

    const params = new URLSearchParams(url.hash.replace(/^#/, ""));
    const scanToken = String(params.get("token") || "").trim();
    if (isSecureCustomerQr(scanToken)) return { kind: "secure", scanToken };

    const username = normalizeCustomerUsername(params.get("user") || "");
    if (username) return { kind: "profile", manualUsername: username };
  } catch {
    return null;
  }

  return null;
};

export async function issueCustomerQr(input?: { rotate?: boolean }): Promise<IssuedCustomerQr> {
  const { data, error } = await supabase.functions.invoke<IssuedCustomerQr>("issue-customer-qr", {
    body: input || {},
  });

  if (error || !data?.token) {
    throw new Error(await getFunctionErrorMessage(error, "Could not generate secure QR code."));
  }

  return data;
}

export async function redeemCustomerScan(input: {
  scanToken?: string;
  manualUsername?: string;
  storeId: string;
  selectedCardId?: string;
  promotionId?: string;
  points: number;
  scannerLocation?: ScannerLocation;
  previewOnly?: boolean;
}): Promise<RedeemedCustomerScan> {
  const { data, error } = await supabase.functions.invoke<RedeemedCustomerScan>("redeem-customer-scan", {
    body: input,
  });

  if (error || !data?.customer) {
    throw new Error(await getFunctionErrorMessage(error, "Could not process customer scan."));
  }

  return data;
}

export async function updateCustomerProfile(input: {
  name: string;
  username: string;
  phone: string;
  bio: string;
  birthday: string;
  avatarUrl: string;
}) {
  const { data, error } = await supabase.functions.invoke<{ profile: unknown }>("update-customer-profile", {
    body: input,
  });

  if (error || !data?.profile) {
    throw new Error(await getFunctionErrorMessage(error, "Could not update customer profile."));
  }

  return data.profile;
}

export async function getStoreReferralCode(storeId: string): Promise<StoreReferralCode> {
  const { data, error } = await supabase.functions.invoke<StoreReferralCode>("store-referrals", {
    body: { action: "get-code", storeId },
  });

  if (error || !data?.referralCode) {
    throw new Error(await getFunctionErrorMessage(error, "Could not get referral code."));
  }

  return data;
}

export async function getStoreReferralStats(storeId: string): Promise<StoreReferralStats> {
  const { data, error } = await supabase.functions.invoke<StoreReferralStats>("store-referrals", {
    body: { action: "stats", storeId },
  });

  if (error || typeof data?.referralCount !== "number") {
    throw new Error(await getFunctionErrorMessage(error, "Could not load referral usage."));
  }

  return data;
}

export async function redeemStoreReferralCode(referralCode: string): Promise<RedeemedStoreReferral> {
  const { data, error } = await supabase.functions.invoke<RedeemedStoreReferral>("store-referrals", {
    body: { action: "redeem", referralCode },
  });

  if (error || !data?.storeId) {
    throw new Error(await getFunctionErrorMessage(error, "Could not redeem referral code."));
  }

  return data;
}

export async function validateStoreReferralCode(referralCode: string): Promise<ValidatedStoreReferral> {
  const { data, error } = await supabase.functions.invoke<ValidatedStoreReferral>("store-referrals", {
    body: { action: "validate", referralCode },
  });

  if (error || !data?.storeId) {
    throw new Error(await getFunctionErrorMessage(error, "Referral code could not be verified."));
  }

  return data;
}
