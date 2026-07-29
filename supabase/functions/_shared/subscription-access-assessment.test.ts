import assert from "node:assert/strict";
import test from "node:test";
import {
  assessSubscriptionAccessAction,
  subscriptionAccessAssessmentAuditMetadata,
  type SubscriptionAccessAssessmentInput,
} from "./subscription-access-assessment.ts";

const NOW = "2026-07-29T12:00:00.000Z";

const input = (
  overrides: Partial<SubscriptionAccessAssessmentInput> = {},
): SubscriptionAccessAssessmentInput => ({
  action: "warning",
  now: NOW,
  currentStatus: "active",
  warningLeadDays: 7,
  gracePeriodDays: 3,
  initialPaymentRequired: false,
  subscriptionEnd: "2026-07-31T12:00:00.000Z",
  invoice: {
    id: "inv-1",
    status: "link_created",
    dueAt: "2026-07-31T12:00:00.000Z",
    paidAt: null,
  },
  ...overrides,
});

test("warning is valid only inside the configured warning window", () => {
  const valid = assessSubscriptionAccessAction(input());
  assert.equal(valid.valid, true);
  assert.equal(valid.code, "policy_match");

  const early = assessSubscriptionAccessAction(input({
    now: "2026-07-20T11:59:59.999Z",
  }));
  assert.equal(early.valid, false);
  assert.equal(early.code, "warning_too_early");
});

test("grace is outside policy before an unpaid invoice is due", () => {
  const result = assessSubscriptionAccessAction(input({
    action: "grace",
    invoice: {
      id: "inv-1",
      status: "pending",
      dueAt: "2026-07-30T12:00:00.000Z",
      paidAt: null,
    },
  }));

  assert.equal(result.valid, false);
  assert.equal(result.forced, true);
  assert.equal(result.code, "invoice_not_due");
  assert.equal(result.facts.invoiceId, "inv-1");
  assert.equal(result.facts.dueAt, "2026-07-30T12:00:00.000Z");
});

test("grace is valid from the due date until the grace deadline", () => {
  const atDueDate = assessSubscriptionAccessAction(input({
    action: "grace",
    now: "2026-07-31T12:00:00.000Z",
  }));
  assert.equal(atDueDate.valid, true);

  const atDeadline = assessSubscriptionAccessAction(input({
    action: "grace",
    now: "2026-08-03T12:00:00.000Z",
  }));
  assert.equal(atDeadline.valid, false);
  assert.equal(atDeadline.code, "grace_expired");
});

test("freeze is outside policy before grace ends and valid at the deadline", () => {
  const early = assessSubscriptionAccessAction(input({
    action: "frozen",
    now: "2026-08-03T11:59:59.999Z",
  }));
  assert.equal(early.valid, false);
  assert.equal(early.code, "grace_not_expired");

  const atDeadline = assessSubscriptionAccessAction(input({
    action: "frozen",
    now: "2026-08-03T12:00:00.000Z",
  }));
  assert.equal(atDeadline.valid, true);
});

test("freeze is valid while initial payment remains outstanding", () => {
  const result = assessSubscriptionAccessAction(input({
    action: "frozen",
    initialPaymentRequired: true,
    invoice: null,
  }));
  assert.equal(result.valid, true);
  assert.equal(result.code, "policy_match");
});

test("restore is valid after payment and outside policy while debt remains open", () => {
  const paid = assessSubscriptionAccessAction(input({
    action: "active",
    currentStatus: "frozen",
    invoice: {
      id: "inv-paid",
      status: "paid",
      dueAt: "2026-07-25T12:00:00.000Z",
      paidAt: "2026-07-28T12:00:00.000Z",
    },
  }));
  assert.equal(paid.valid, true);

  const unpaid = assessSubscriptionAccessAction(input({
    action: "active",
    currentStatus: "frozen",
  }));
  assert.equal(unpaid.valid, false);
  assert.equal(unpaid.code, "debt_still_open");
});

test("missing billing evidence is outside policy", () => {
  const result = assessSubscriptionAccessAction(input({
    action: "grace",
    subscriptionEnd: null,
    invoice: null,
  }));
  assert.equal(result.valid, false);
  assert.equal(result.code, "insufficient_evidence");
});

test("requesting the current effective state is outside policy", () => {
  const result = assessSubscriptionAccessAction(input({
    action: "warning",
    currentStatus: "warning",
  }));
  assert.equal(result.valid, false);
  assert.equal(result.code, "already_in_state");
});

test("audit metadata preserves the execution-time verdict and facts", () => {
  const assessment = assessSubscriptionAccessAction(input({
    action: "grace",
    now: "2026-07-25T12:00:00.000Z",
  }));
  const metadata = subscriptionAccessAssessmentAuditMetadata(assessment);

  assert.equal(metadata.policyValid, false);
  assert.equal(metadata.forced, true);
  assert.equal(metadata.assessmentCode, "invoice_not_due");
  assert.equal(metadata.assessmentFacts.invoiceId, "inv-1");
});
