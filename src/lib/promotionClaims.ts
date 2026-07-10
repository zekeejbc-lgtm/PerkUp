import { supabase } from "./supabase";

export const PROMOTION_REDEEM_QR_PREFIX = "perkup:redeem:v1:";

export type PromotionClaim = {
  id: string;
  promotionId: string;
  storeId: string;
  redeemCode: string;
  qrToken: string;
  status: "claimed" | "redeemed" | "expired" | "cancelled";
  claimedAt: string;
  expiresAt: string;
  redeemedAt?: string | null;
  redemptionMethod?: "qr" | "code" | "manual" | null;
};

const errorMessage = async (error: any, fallback: string) => {
  try {
    const body = await error?.context?.json?.();
    return body?.error || error?.message || fallback;
  } catch {
    return error?.message || fallback;
  }
};

const invoke = async <T>(body: Record<string, unknown>, fallback: string): Promise<T> => {
  const { data, error } = await supabase.functions.invoke<T>("promotion-claims", { body });
  if (error || !data) throw new Error(await errorMessage(error, fallback));
  return data;
};

export async function listPromotionClaims() {
  const result = await invoke<{ claims: PromotionClaim[] }>({ action: "list" }, "Could not load claims.");
  return result.claims || [];
}

export async function claimPromotion(promotionId: string) {
  const result = await invoke<{ claim: PromotionClaim }>(
    { action: "claim", promotionId },
    "Could not reserve this reward.",
  );
  return result.claim;
}

export async function redeemPromotionClaim(input: {
  storeId: string;
  lookup: string;
  method: "qr" | "code" | "manual";
}) {
  const result = await invoke<{ claim: PromotionClaim }>(
    { action: "redeem", ...input },
    "Could not redeem this claim.",
  );
  return result.claim;
}
