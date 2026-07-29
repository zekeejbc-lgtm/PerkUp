export type SubscriptionAccessAction = "active" | "warning" | "grace" | "frozen";

export type SubscriptionAccessAssessmentCode =
  | "policy_match"
  | "warning_too_early"
  | "invoice_already_due"
  | "invoice_not_due"
  | "grace_expired"
  | "grace_not_expired"
  | "debt_still_open"
  | "already_in_state"
  | "insufficient_evidence";

export type SubscriptionAccessAssessmentInput = {
  action: SubscriptionAccessAction;
  now: string;
  currentStatus: SubscriptionAccessAction;
  warningLeadDays: number;
  gracePeriodDays: number;
  initialPaymentRequired: boolean;
  subscriptionEnd: string | null;
  invoice: {
    id: string;
    status: string;
    dueAt: string;
    paidAt?: string | null;
  } | null;
};

export type SubscriptionAccessAssessmentFacts = {
  assessedAt: string;
  currentStatus: SubscriptionAccessAction;
  invoiceId: string | null;
  invoiceStatus: string | null;
  dueAt: string | null;
  graceEndsAt: string | null;
  subscriptionEnd: string | null;
  initialPaymentRequired: boolean;
};

export type SubscriptionAccessAssessment = {
  valid: boolean;
  forced: boolean;
  code: SubscriptionAccessAssessmentCode;
  reason: string;
  facts: SubscriptionAccessAssessmentFacts;
};

const DAY_MS = 86_400_000;
const OPEN_INVOICE_STATUSES = new Set(["pending", "link_created", "failed", "expired"]);

const validDate = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);

const result = (
  valid: boolean,
  code: SubscriptionAccessAssessmentCode,
  reason: string,
  facts: SubscriptionAccessAssessmentFacts,
): SubscriptionAccessAssessment => ({
  valid,
  forced: !valid,
  code,
  reason,
  facts,
});

export const assessSubscriptionAccessAction = (
  input: SubscriptionAccessAssessmentInput,
): SubscriptionAccessAssessment => {
  const now = validDate(input.now);
  const invoiceDueAt = validDate(input.invoice?.dueAt);
  const subscriptionEnd = validDate(input.subscriptionEnd);
  const dueAt = invoiceDueAt || subscriptionEnd;
  const graceDays = Math.max(0, Math.trunc(input.gracePeriodDays || 0));
  const warningDays = Math.max(0, Math.trunc(input.warningLeadDays || 0));
  const graceEndsAt = dueAt ? new Date(dueAt.getTime() + graceDays * DAY_MS) : null;
  const invoiceStatus = String(input.invoice?.status || "").toLowerCase();
  const paidAt = validDate(input.invoice?.paidAt);
  const invoiceOpen = Boolean(input.invoice) && OPEN_INVOICE_STATUSES.has(invoiceStatus) && !paidAt;
  const contradictoryInvoice = Boolean(input.invoice) &&
    ((invoiceStatus === "paid" && !paidAt) || (OPEN_INVOICE_STATUSES.has(invoiceStatus) && Boolean(paidAt)));
  const facts: SubscriptionAccessAssessmentFacts = {
    assessedAt: now?.toISOString() || input.now,
    currentStatus: input.currentStatus,
    invoiceId: input.invoice?.id || null,
    invoiceStatus: input.invoice?.status || null,
    dueAt: dueAt?.toISOString() || null,
    graceEndsAt: graceEndsAt?.toISOString() || null,
    subscriptionEnd: subscriptionEnd?.toISOString() || null,
    initialPaymentRequired: input.initialPaymentRequired,
  };

  if (!now || contradictoryInvoice) {
    return result(false, "insufficient_evidence", "The billing evidence is missing or contradictory, so this action cannot be confirmed as policy-matched.", facts);
  }
  if (input.action === input.currentStatus) {
    return result(false, "already_in_state", `The store is already in the ${input.currentStatus} access state.`, facts);
  }

  if (input.action === "active") {
    if (input.initialPaymentRequired || invoiceOpen) {
      return result(false, "debt_still_open", "Restore is outside policy because payment is still outstanding.", facts);
    }
    return result(true, "policy_match", "Restore matches policy because no outstanding billing restriction was found.", facts);
  }

  if (input.action === "frozen" && input.initialPaymentRequired) {
    return result(true, "policy_match", "Freeze matches policy because the initial subscription payment is still outstanding.", facts);
  }

  if (!dueAt || !input.invoice) {
    return result(false, "insufficient_evidence", "No current invoice and due date are available to justify this billing action.", facts);
  }
  if (!invoiceOpen) {
    return result(false, "insufficient_evidence", "The latest invoice is not an open unpaid invoice, so this billing action is outside policy.", facts);
  }

  if (input.action === "warning") {
    const warningStartsAt = new Date(dueAt.getTime() - warningDays * DAY_MS);
    if (now.getTime() < warningStartsAt.getTime()) {
      return result(false, "warning_too_early", `Warning is early. The configured warning window starts ${formatDate(warningStartsAt)}.`, facts);
    }
    if (now.getTime() >= dueAt.getTime()) {
      return result(false, "invoice_already_due", `Warning is late because invoice ${input.invoice.id} was due ${formatDate(dueAt)}.`, facts);
    }
    return result(true, "policy_match", `Warning matches policy because invoice ${input.invoice.id} is inside its configured warning window.`, facts);
  }

  if (input.action === "grace") {
    if (now.getTime() < dueAt.getTime()) {
      return result(false, "invoice_not_due", `Grace is early because invoice ${input.invoice.id} is due ${formatDate(dueAt)}.`, facts);
    }
    if (!graceEndsAt || now.getTime() >= graceEndsAt.getTime()) {
      return result(false, "grace_expired", `Grace is no longer appropriate because the deadline was ${formatDate(graceEndsAt || dueAt)}.`, facts);
    }
    return result(true, "policy_match", `Grace matches policy because invoice ${input.invoice.id} is overdue and its grace deadline has not passed.`, facts);
  }

  if (!graceEndsAt || now.getTime() < graceEndsAt.getTime()) {
    return result(false, "grace_not_expired", `Freeze is early because the grace deadline is ${formatDate(graceEndsAt || dueAt)}.`, facts);
  }
  return result(true, "policy_match", `Freeze matches policy because invoice ${input.invoice.id} remains unpaid after its grace deadline.`, facts);
};

export const subscriptionAccessAssessmentAuditMetadata = (
  assessment: SubscriptionAccessAssessment,
) => ({
  policyValid: assessment.valid,
  forced: !assessment.valid,
  assessmentCode: assessment.code,
  assessmentReason: assessment.reason,
  assessmentFacts: assessment.facts,
});
