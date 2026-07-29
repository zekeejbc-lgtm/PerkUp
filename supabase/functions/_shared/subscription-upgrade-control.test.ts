import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeSubscriptionUpgradeToggle,
  type SubscriptionUpgradeToggleInput,
} from "./subscription-upgrade-control.ts";

const validInput = (
  overrides: Partial<SubscriptionUpgradeToggleInput> = {},
): SubscriptionUpgradeToggleInput => ({
  actorRole: "auditor",
  actorStatus: "active",
  mfaRequired: false,
  enabled: true,
  passwordPresent: true,
  confirmation: "ENABLE SUBSCRIPTION UPGRADES",
  ...overrides,
});

test("only an active auditor can toggle subscription upgrades", async () => {
  for (const actorRole of [
    "admin",
    "assistant_admin",
    "store_owner",
    "staff",
    "customer",
    "",
  ]) {
    const result = await authorizeSubscriptionUpgradeToggle(
      validInput({ actorRole }),
      async () => true,
    );
    assert.equal(result.ok, false, actorRole);
    assert.equal(result.status, 403);
  }
  for (const actorStatus of ["suspended", "banned"]) {
    const result = await authorizeSubscriptionUpgradeToggle(
      validInput({ actorStatus }),
      async () => true,
    );
    assert.equal(result.ok, false, actorStatus);
    assert.equal(result.status, 403);
  }
});

test("an MFA challenge blocks the toggle before password verification", async () => {
  let verifierCalled = false;
  const result = await authorizeSubscriptionUpgradeToggle(
    validInput({ mfaRequired: true }),
    async () => {
      verifierCalled = true;
      return true;
    },
  );
  assert.deepEqual(result, {
    ok: false,
    status: 403,
    error: "Complete multi-factor authentication to continue.",
    code: "mfa_required",
  });
  assert.equal(verifierCalled, false);
});

test("the requested state must be an exact boolean", async () => {
  const result = await authorizeSubscriptionUpgradeToggle(
    validInput({ enabled: "true" }),
    async () => true,
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test("enable and disable require their exact confirmation phrases", async () => {
  for (const [enabled, confirmation] of [
    [true, "enable subscription upgrades"],
    [true, "DISABLE SUBSCRIPTION UPGRADES"],
    [false, "ENABLE SUBSCRIPTION UPGRADES"],
    [false, "DISABLE SUBSCRIPTION UPGRADES "],
  ] as const) {
    const result = await authorizeSubscriptionUpgradeToggle(
      validInput({ enabled, confirmation }),
      async () => true,
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  }
});

test("a missing or incorrect auditor password is denied", async () => {
  const missing = await authorizeSubscriptionUpgradeToggle(
    validInput({ passwordPresent: false }),
    async () => true,
  );
  assert.equal(missing.ok, false);
  assert.equal(missing.status, 403);

  const incorrect = await authorizeSubscriptionUpgradeToggle(
    validInput(),
    async () => false,
  );
  assert.equal(incorrect.ok, false);
  assert.equal(incorrect.status, 403);
});

test("a fully verified auditor request returns the normalized state", async () => {
  const enabled = await authorizeSubscriptionUpgradeToggle(
    validInput(),
    async () => true,
  );
  assert.deepEqual(enabled, { ok: true, enabled: true });

  const disabled = await authorizeSubscriptionUpgradeToggle(
    validInput({
      enabled: false,
      confirmation: "DISABLE SUBSCRIPTION UPGRADES",
    }),
    async () => true,
  );
  assert.deepEqual(disabled, { ok: true, enabled: false });
});
