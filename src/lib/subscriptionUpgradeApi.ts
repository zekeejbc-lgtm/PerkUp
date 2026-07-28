import { invokeAdminBackend } from "./adminBackend";
import type {
  SubscriptionPlanChangeSummary,
  SubscriptionPlanSnapshot,
  SubscriptionUpgradeQuote,
} from "./subscriptionUpgrade";

export type UpgradeOptionsResponse = {
  enabled: boolean;
  currentPlan: SubscriptionPlanSnapshot | null;
  eligiblePlans: SubscriptionPlanSnapshot[];
  pendingChange: SubscriptionPlanChangeSummary | null;
  blockedReason: string | null;
};

export type ConfirmUpgradeInput = {
  storeId: string;
  targetPlanId: string;
  termsVersion: string;
  termsAccepted: true;
  quoteFingerprint: string;
};

export async function getSubscriptionUpgradeOptions(
  storeId: string,
): Promise<UpgradeOptionsResponse> {
  return invokeAdminBackend<UpgradeOptionsResponse>({
    action: "get_subscription_upgrade_options",
    storeId,
  });
}

export async function quoteSubscriptionUpgrade(
  storeId: string,
  targetPlanId: string,
): Promise<SubscriptionUpgradeQuote> {
  const response = await invokeAdminBackend<{ quote: SubscriptionUpgradeQuote }>({
    action: "quote_subscription_upgrade",
    storeId,
    targetPlanId,
  });
  return response.quote;
}

export async function confirmSubscriptionUpgrade(
  input: ConfirmUpgradeInput,
): Promise<SubscriptionPlanChangeSummary> {
  const response = await invokeAdminBackend<{ change: SubscriptionPlanChangeSummary }>({
    action: "confirm_subscription_upgrade",
    storeId: input.storeId,
    targetPlanId: input.targetPlanId,
    termsVersion: input.termsVersion,
    termsAccepted: input.termsAccepted,
    quoteFingerprint: input.quoteFingerprint,
  });
  return response.change;
}

export async function cancelSubscriptionUpgrade(
  storeId: string,
  planChangeId: string,
): Promise<void> {
  await invokeAdminBackend<Record<string, unknown>>({
    action: "cancel_subscription_upgrade",
    storeId,
    planChangeId,
  });
}
