export type SubscriptionUpgradeToggleInput = {
  actorRole: unknown;
  actorStatus: unknown;
  mfaRequired: boolean;
  enabled: unknown;
  passwordPresent: boolean;
  confirmation: unknown;
};

export type SubscriptionUpgradeToggleAuthorization =
  | { ok: true; enabled: boolean }
  | {
    ok: false;
    status: 400 | 403;
    error: string;
    code?: "mfa_required";
  };

const failure = (
  status: 400 | 403,
  error: string,
  code?: "mfa_required",
): SubscriptionUpgradeToggleAuthorization => ({
  ok: false,
  status,
  error,
  ...(code ? { code } : {}),
});

export async function authorizeSubscriptionUpgradeToggle(
  input: SubscriptionUpgradeToggleInput,
  verifyPassword: () => Promise<boolean>,
): Promise<SubscriptionUpgradeToggleAuthorization> {
  if (input.actorRole !== "auditor" || input.actorStatus !== "active") {
    return failure(403, "Auditor access required.");
  }
  if (input.mfaRequired) {
    return failure(
      403,
      "Complete multi-factor authentication to continue.",
      "mfa_required",
    );
  }
  if (input.enabled !== true && input.enabled !== false) {
    return failure(400, "Select whether subscription upgrades are enabled.");
  }

  const requiredConfirmation = input.enabled
    ? "ENABLE SUBSCRIPTION UPGRADES"
    : "DISABLE SUBSCRIPTION UPGRADES";
  if (input.confirmation !== requiredConfirmation) {
    return failure(400, `Type "${requiredConfirmation}" exactly to continue.`);
  }
  if (!input.passwordPresent || !await verifyPassword()) {
    return failure(403, "The auditor password is incorrect.");
  }
  return { ok: true, enabled: input.enabled };
}
