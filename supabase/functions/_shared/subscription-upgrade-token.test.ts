import {
  assertEquals,
  assertRejects,
} from "jsr:@std/assert@1";
import {
  signSubscriptionUpgradeQuote,
  SubscriptionUpgradeQuoteTokenError,
  verifySubscriptionUpgradeQuote,
  type SubscriptionUpgradeQuoteClaims,
} from "./subscription-upgrade-token.ts";

const secret = "test-secret-that-is-long-enough-for-hmac-signing";
const now = new Date("2026-07-29T04:00:00.000Z");

const claims = (
  overrides: Partial<SubscriptionUpgradeQuoteClaims> = {},
): SubscriptionUpgradeQuoteClaims => ({
  version: 1,
  ownerUserId: "owner-a",
  storeId: "store-a",
  subscriptionId: "subscription-a",
  fromPlanId: "standard",
  toPlanId: "premium",
  currentAmountCentavos: 99_900,
  targetAmountCentavos: 199_900,
  targetPeriodStart: "2026-08-01T00:00:00.000Z",
  targetPeriodEnd: "2026-08-31T00:00:00.000Z",
  currentRenewalInvoiceId: null,
  currentRenewalInvoiceStatus: null,
  renewalMode: "automatic",
  termsVersion: "subscription-upgrade-v1",
  planCatalogUpdatedAt: "2026-07-29T03:30:00.000Z",
  quoteFingerprint: "a".repeat(64),
  issuedAt: "2026-07-29T04:00:00.000Z",
  expiresAt: "2026-07-29T04:15:00.000Z",
  ...overrides,
});

const expected = {
  ownerUserId: "owner-a",
  storeId: "store-a",
  targetPlanId: "premium",
  termsVersion: "subscription-upgrade-v1",
  quoteFingerprint: "a".repeat(64),
};

const rejectsWithCode = async (
  operation: () => Promise<unknown>,
  code: SubscriptionUpgradeQuoteTokenError["code"],
) => {
  const error = await assertRejects(
    operation,
    SubscriptionUpgradeQuoteTokenError,
  );
  assertEquals((error as SubscriptionUpgradeQuoteTokenError).code, code);
};

Deno.test("signed upgrade quote token round-trips exact claims", async () => {
  const token = await signSubscriptionUpgradeQuote(claims(), secret);
  const verified = await verifySubscriptionUpgradeQuote(
    token,
    secret,
    expected,
    now,
  );

  assertEquals(verified, claims());
});

Deno.test("tampered upgrade quote token is rejected", async () => {
  const token = await signSubscriptionUpgradeQuote(claims(), secret);
  const [payload, signature] = token.split(".");
  const tampered = `${payload.slice(0, -1)}${payload.endsWith("A") ? "B" : "A"}.${signature}`;

  await rejectsWithCode(
    () => verifySubscriptionUpgradeQuote(tampered, secret, expected, now),
    "INVALID_UPGRADE_QUOTE",
  );
});

Deno.test("upgrade quote token signed with another secret is rejected", async () => {
  const token = await signSubscriptionUpgradeQuote(claims(), secret);

  await rejectsWithCode(
    () => verifySubscriptionUpgradeQuote(
      token,
      "another-test-secret-that-is-not-the-same",
      expected,
      now,
    ),
    "INVALID_UPGRADE_QUOTE",
  );
});

Deno.test("expired upgrade quote token is rejected", async () => {
  const token = await signSubscriptionUpgradeQuote(claims(), secret);

  await rejectsWithCode(
    () => verifySubscriptionUpgradeQuote(
      token,
      secret,
      expected,
      new Date("2026-07-29T04:15:00.000Z"),
    ),
    "EXPIRED_UPGRADE_QUOTE",
  );
});

Deno.test("future-issued upgrade quote token is rejected", async () => {
  const token = await signSubscriptionUpgradeQuote(
    claims({
      issuedAt: "2026-07-29T04:01:00.000Z",
      expiresAt: "2026-07-29T04:16:00.000Z",
    }),
    secret,
  );

  await rejectsWithCode(
    () => verifySubscriptionUpgradeQuote(token, secret, expected, now),
    "INVALID_UPGRADE_QUOTE",
  );
});

for (
  const [label, field, value] of [
    ["owner", "ownerUserId", "owner-b"],
    ["store", "storeId", "store-b"],
    ["target plan", "targetPlanId", "enterprise"],
    ["terms", "termsVersion", "subscription-upgrade-v2"],
    ["fingerprint", "quoteFingerprint", "b".repeat(64)],
  ] as const
) {
  Deno.test(`upgrade quote token rejects the wrong ${label}`, async () => {
    const token = await signSubscriptionUpgradeQuote(claims(), secret);
    await rejectsWithCode(
      () => verifySubscriptionUpgradeQuote(
        token,
        secret,
        { ...expected, [field]: value },
        now,
      ),
      field === "quoteFingerprint"
        ? "STALE_UPGRADE_QUOTE"
        : "INVALID_UPGRADE_QUOTE",
    );
  });
}

Deno.test("upgrade quote token requires an exact fifteen-minute lifetime", async () => {
  await rejectsWithCode(
    () => signSubscriptionUpgradeQuote(
      claims({ expiresAt: "2026-07-29T04:16:00.000Z" }),
      secret,
    ),
    "INVALID_UPGRADE_QUOTE",
  );
});
