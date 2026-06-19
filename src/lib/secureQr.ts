import { supabase } from "./supabase";

export const LEGACY_CUSTOMER_QR_PREFIX = "perkup:v1:";
export const SECURE_CUSTOMER_QR_PREFIX = "perkup:v2:";

export type IssuedCustomerQr = {
  token: string;
  expiresAt: string | null;
  ttlSeconds: number | null;
};

export type RedeemedCustomerScan = {
  customer: {
    id: string;
    username: string;
    maskedName: string;
    profilePic: string | null;
    existingStars: number;
    newStars: number;
  };
  points: number;
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
  value.trim().startsWith(LEGACY_CUSTOMER_QR_PREFIX);

export async function issueCustomerQr(): Promise<IssuedCustomerQr> {
  const { data, error } = await supabase.functions.invoke<IssuedCustomerQr>("issue-customer-qr", {
    body: {},
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
  promotionId?: string;
  points: number;
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
