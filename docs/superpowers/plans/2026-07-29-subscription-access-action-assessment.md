# Subscription Access Action Assessment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assess Warn, Grace, Freeze, and Restore against live billing facts in the confirmation panel while preserving an authorized forced override and auditing the execution-time verdict.

**Architecture:** A pure shared TypeScript assessor owns the lifecycle rules. The admin Edge Function loads the authoritative billing snapshot for both a read-only assessment action and the existing mutation, while a focused React modal renders loading, valid, outside-policy, and unavailable states.

**Tech Stack:** React 19, TypeScript 5.8, Vitest, Node test runner, Supabase Edge Functions, Supabase JavaScript client 2.106.

## Global Constraints

- The modal opens immediately when an action button is pressed.
- Invalid or unavailable assessments never disable an authorized forced override.
- The backend reassesses immediately before mutation and audits the execution-time result.
- Existing initial-payment hard protection remains unchanged.
- No schema migration or new dependency is required.

---

## File Structure

- Create `supabase/functions/_shared/subscription-access-assessment.ts`: pure policy types and assessment rules.
- Create `supabase/functions/_shared/subscription-access-assessment.test.ts`: fixed-clock policy tests.
- Modify `supabase/functions/admin-backend/index.ts`: load billing facts, expose assessment action, reassess mutations, return and audit the verdict.
- Create `src/components/SubscriptionAccessActionModal.tsx`: focused confirmation and verdict UI.
- Create `src/components/SubscriptionAccessActionModal.test.tsx`: observable modal-state tests.
- Create `src/lib/subscriptionAccessAssessmentRequest.ts`: latest-request state controller.
- Create `src/lib/subscriptionAccessAssessmentRequest.test.ts`: out-of-order response tests.
- Modify `src/pages/admin/AdminStoreDetail.tsx`: modal assessment request and forced-confirm integration.

### Task 1: Pure billing policy assessor

**Files:**
- Create: `supabase/functions/_shared/subscription-access-assessment.ts`
- Create: `supabase/functions/_shared/subscription-access-assessment.test.ts`

**Interfaces:**
- Consumes: literal timestamps and normalized billing facts supplied by the Edge Function.
- Produces: `assessSubscriptionAccessAction(input: SubscriptionAccessAssessmentInput): SubscriptionAccessAssessment`.

- [ ] **Step 1: Write failing fixed-clock tests**

Cover literal cases at `2026-07-29T12:00:00.000Z`:

```ts
test("grace is outside policy before an unpaid invoice is due", () => {
  const result = assessSubscriptionAccessAction(base({
    action: "grace",
    invoice: { id: "inv-1", status: "pending", dueAt: "2026-07-30T12:00:00.000Z" },
  }));
  assert.equal(result.valid, false);
  assert.equal(result.forced, true);
  assert.equal(result.code, "invoice_not_due");
  assert.equal(result.facts.invoiceId, "inv-1");
  assert.equal(result.facts.dueAt, "2026-07-30T12:00:00.000Z");
});
```

Add independent cases for:

- Warn inside and outside `warningLeadDays`.
- Grace at `dueAt` and outside policy after `dueAt + gracePeriodDays`.
- Freeze before and at the grace deadline.
- Freeze for an outstanding initial payment.
- Restore after paid/no-open-invoice evidence and outside policy with an open overdue invoice.
- Missing or contradictory evidence returning `valid: false`, `code: "insufficient_evidence"`.
- Requesting the already effective status returning `valid: false`, `code: "already_in_state"`.

The production change caught by these tests is any wrong date boundary, invoice-state branch, or fallback verdict.

- [ ] **Step 2: Run the shared test and verify RED**

Run:

```powershell
node --test supabase/functions/_shared/subscription-access-assessment.test.ts
```

Expected: FAIL because the assessment module does not exist.

- [ ] **Step 3: Implement the minimal pure assessor**

Define:

```ts
export type SubscriptionAccessAction = "active" | "warning" | "grace" | "frozen";
export type SubscriptionAccessAssessmentCode =
  | "policy_match"
  | "warning_too_early"
  | "invoice_not_due"
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

export type SubscriptionAccessAssessment = {
  valid: boolean;
  forced: boolean;
  code: SubscriptionAccessAssessmentCode;
  reason: string;
  facts: {
    assessedAt: string;
    currentStatus: SubscriptionAccessAction;
    invoiceId: string | null;
    invoiceStatus: string | null;
    dueAt: string | null;
    graceEndsAt: string | null;
    subscriptionEnd: string | null;
    initialPaymentRequired: boolean;
  };
};
```

Use millisecond comparisons with inclusive start boundaries: warning becomes valid
at `dueAt - warningLeadDays`, grace at `dueAt`, and freeze at
`dueAt + gracePeriodDays`. Treat `pending` and `link_created` as open. Derive
human-readable reasons from fixed `en-PH` date formatting without changing verdicts.
Set `forced` to `!valid`.

- [ ] **Step 4: Run the test and verify GREEN**

Run:

```powershell
node --test supabase/functions/_shared/subscription-access-assessment.test.ts
```

Expected: all policy cases PASS.

- [ ] **Step 5: Commit the assessor**

```powershell
git add supabase/functions/_shared/subscription-access-assessment.ts supabase/functions/_shared/subscription-access-assessment.test.ts
git commit -m "feat: assess subscription access actions"
```

### Task 2: Authoritative backend assessment and audit

**Files:**
- Modify: `supabase/functions/admin-backend/index.ts`
- Test: `supabase/functions/_shared/subscription-access-assessment.test.ts`

**Interfaces:**
- Consumes: `assessSubscriptionAccessAction` from Task 1.
- Produces: admin action `assess_subscription_access_action` returning `{ assessment }`; mutation response `{ ..., assessment }`.

- [ ] **Step 1: Extend the failing helper test for normalized audit metadata**

Add a pure export:

```ts
export const subscriptionAccessAssessmentAuditMetadata = (
  assessment: SubscriptionAccessAssessment,
) => ({
  policyValid: assessment.valid,
  forced: !assessment.valid,
  assessmentCode: assessment.code,
  assessmentReason: assessment.reason,
  assessmentFacts: assessment.facts,
});
```

Assert literal keys and values so removing forced status or billing facts fails.

- [ ] **Step 2: Run the shared test and verify RED**

Run:

```powershell
node --test supabase/functions/_shared/subscription-access-assessment.test.ts
```

Expected: FAIL because `subscriptionAccessAssessmentAuditMetadata` is missing.

- [ ] **Step 3: Add backend snapshot loading and actions**

Import the Task 1 exports. Add a focused loader that:

1. resolves the requested branch to its primary store;
2. selects its `billing_subscriptions` row;
3. selects the newest relevant `billing_invoices` row ordered by `due_at`
   descending, preferring open `pending`/`link_created` rows;
4. falls back to primary-store access fields and `subscriptionEnd` when billing
   rows are missing; and
5. calls the pure assessor with `new Date().toISOString()`.

Add `assess_subscription_access_action` before the mutation branch. Require
`actorIsAdmin`, validate `storeId` and status, and return:

```ts
return jsonResponse({ storeId: primaryStore.id, assessment });
```

In `update_subscription_access`, reassess after loading the primary store and
before writing. Preserve the initial-payment hard rejection. Return `assessment`
with the mutation result.

Extend `mutationAuditMetadata`:

```ts
const assessment = responseBody.assessment;
if (assessment && typeof assessment === "object") {
  Object.assign(metadata, subscriptionAccessAssessmentAuditMetadata(
    assessment as SubscriptionAccessAssessment,
  ));
}
metadata.overrideAcknowledged = body.overrideAcknowledged === true;
```

Do not add the read-only assessment action to `AUTO_AUDITED_MUTATIONS`.

- [ ] **Step 4: Implement the audit metadata export and verify GREEN**

Add the pure helper shown in Step 1 and run:

```powershell
node --test supabase/functions/_shared/subscription-access-assessment.test.ts
npx tsc --noEmit --pretty false
```

Expected: shared tests PASS and TypeScript reports no project errors.

- [ ] **Step 5: Commit backend integration**

```powershell
git add supabase/functions/_shared/subscription-access-assessment.ts supabase/functions/_shared/subscription-access-assessment.test.ts supabase/functions/admin-backend/index.ts
git commit -m "feat: validate billing actions on the backend"
```

### Task 3: Verdict-aware confirmation modal

**Files:**
- Create: `src/components/SubscriptionAccessActionModal.tsx`
- Create: `src/components/SubscriptionAccessActionModal.test.tsx`

**Interfaces:**
- Consumes: `action`, display copy, `assessment`, `assessmentLoading`, `assessmentError`, mutation busy state, and confirm/cancel callbacks.
- Produces: an accessible dialog with a normal or forced confirmation action.

- [ ] **Step 1: Write failing component behavior tests**

Render the real component and verify:

```tsx
it("keeps an outside-policy override enabled and labels it as forced", async () => {
  const onConfirm = vi.fn();
  render(<SubscriptionAccessActionModal
    action="grace"
    storeName="Example Store"
    title="Start the grace period?"
    description="Starts three days of grace access."
    confirmLabel="Start"
    assessment={outsidePolicyAssessment}
    assessmentLoading={false}
    assessmentError=""
    busy={false}
    onCancel={vi.fn()}
    onConfirm={onConfirm}
  />);

  expect(screen.getByText(/Outside expected billing policy/i)).toBeInTheDocument();
  const force = screen.getByRole("button", { name: /Force grace/i });
  expect(force).toBeEnabled();
  await userEvent.click(force);
  expect(onConfirm).toHaveBeenCalledOnce();
});
```

Add cases for:

- loading verdict disables confirm only until assessment completes;
- valid verdict shows `Valid under billing policy` and the original confirm label;
- unavailable verdict explains validation failure and enables `Force <action>`;
- facts render invoice ID, due date, and grace deadline when present;
- mutation busy state prevents cancel and confirm.

The production changes caught are disabled forced overrides, mislabeled actions,
hidden evidence, and accidental submission before assessment finishes.

- [ ] **Step 2: Run the component test and verify RED**

Run:

```powershell
npx vitest run src/components/SubscriptionAccessActionModal.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the modal**

Extract the existing dialog markup from `AdminStoreDetail`. Add a verdict card:

- blue/gray spinner and `Checking current billing facts…` while loading;
- green check and `Valid under billing policy` when valid;
- amber warning and `Outside expected billing policy` when invalid;
- amber warning and `Policy validation unavailable` on request failure.

Render only non-null facts. Use `Force warning`, `Force grace`,
`Force freeze`, and `Force restore` as the invalid/unavailable labels. Preserve
backdrop cancel behavior and all existing color/icon distinctions.

- [ ] **Step 4: Run the modal tests and verify GREEN**

Run:

```powershell
npx vitest run src/components/SubscriptionAccessActionModal.test.tsx
```

Expected: all modal states PASS.

- [ ] **Step 5: Commit the modal**

```powershell
git add src/components/SubscriptionAccessActionModal.tsx src/components/SubscriptionAccessActionModal.test.tsx
git commit -m "feat: show billing verdict in action modal"
```

### Task 4: Connect AdminStoreDetail to live assessment

**Files:**
- Modify: `src/pages/admin/AdminStoreDetail.tsx`
- Create: `src/lib/subscriptionAccessAssessmentRequest.ts`
- Create: `src/lib/subscriptionAccessAssessmentRequest.test.ts`

**Interfaces:**
- Consumes: backend action `assess_subscription_access_action` and `SubscriptionAccessActionModal`.
- Produces: immediate modal opening, fresh assessment request, and acknowledged forced mutation.

- [ ] **Step 1: Add a failing latest-request controller test**

Specify this interface:

```ts
export type AssessmentRequestController = {
  begin(): number;
  cancel(): void;
  isCurrent(requestId: number): boolean;
};

export const createAssessmentRequestController =
  (): AssessmentRequestController;
```

Test real out-of-order behavior:

```ts
it("rejects an older response after a newer assessment begins", () => {
  const controller = createAssessmentRequestController();
  const graceRequest = controller.begin();
  const freezeRequest = controller.begin();

  expect(controller.isCurrent(graceRequest)).toBe(false);
  expect(controller.isCurrent(freezeRequest)).toBe(true);
  controller.cancel();
  expect(controller.isCurrent(freezeRequest)).toBe(false);
});
```

The production changes caught are accepting a stale response after a newer click
or accepting any response after the panel closes.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx vitest run src/lib/subscriptionAccessAssessmentRequest.test.ts
```

Expected: FAIL because the request controller does not exist.

- [ ] **Step 3: Wire assessment state and confirmation**

In `AdminStoreDetail` add:

```ts
const [subscriptionActionAssessment, setSubscriptionActionAssessment] =
  useState<SubscriptionAccessAssessment | null>(null);
const [subscriptionActionAssessmentLoading, setSubscriptionActionAssessmentLoading] =
  useState(false);
const [subscriptionActionAssessmentError, setSubscriptionActionAssessmentError] =
  useState("");
const subscriptionAssessmentRequests = useRef(
  createAssessmentRequestController(),
);
```

When an action is requested:

1. set the pending action immediately;
2. clear the old assessment and error;
3. call `subscriptionAssessmentRequests.current.begin()`;
4. call `assess_subscription_access_action`; and
5. apply success/failure only if `isCurrent(requestId)` is true.

Update `updateSubscriptionAccess` to send:

```ts
overrideAcknowledged:
  Boolean(subscriptionActionAssessmentError) ||
  subscriptionActionAssessment?.valid === false
```

Use the extracted modal. On mutation failure keep it open. On success close it and
clear assessment state. Call `cancel()` on cancel and unmount so late results are
ignored.

- [ ] **Step 4: Run focused tests and TypeScript**

Run:

```powershell
npx vitest run src/components/SubscriptionAccessActionModal.test.tsx
npx vitest run src/lib/subscriptionAccessAssessmentRequest.test.ts
npx tsc --noEmit --pretty false
```

Expected: tests PASS and TypeScript reports no errors.

- [ ] **Step 5: Commit page integration**

```powershell
git add src/pages/admin/AdminStoreDetail.tsx src/lib/subscriptionAccessAssessmentRequest.ts src/lib/subscriptionAccessAssessmentRequest.test.ts
git commit -m "feat: check billing policy before confirmation"
```

### Task 5: Full verification

**Files:**
- Verify all files changed in Tasks 1–4.

- [ ] **Step 1: Run Supabase shared tests**

```powershell
node --test supabase/functions/_shared/*.test.ts
```

Expected: all Node tests PASS.

- [ ] **Step 2: Run frontend tests**

```powershell
npm.cmd test
```

Expected: all Vitest tests PASS with no unhandled errors.

- [ ] **Step 3: Run type-check and production build**

```powershell
npm.cmd run lint
npm.cmd run build
```

Expected: TypeScript and the production build complete successfully.

- [ ] **Step 4: Review the final diff**

```powershell
git diff HEAD~4 --check
git status --short
```

Confirm no whitespace errors, secrets, unrelated changes, or uncommitted feature
files remain.

- [ ] **Step 5: Commit any verification-only corrections**

If verification required a source correction, repeat its failing test first, make
the minimal correction, rerun all checks, then commit only those corrected files:

```powershell
git commit -m "fix: complete subscription action assessment"
```
