export const STALE_SUBSCRIPTION_UPGRADE_SQLSTATE = "PUG01";

export function isStaleSubscriptionUpgradeError(error: unknown): boolean {
  return Boolean(
    error
      && typeof error === "object"
      && "code" in error
      && String((error as { code?: unknown }).code)
        === STALE_SUBSCRIPTION_UPGRADE_SQLSTATE,
  );
}
