# Subscription Upgrade Confirmation Timeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make subscription upgrade confirmation accept equivalent PostgreSQL/JavaScript catalog timestamps and reject genuinely stale quotes immediately without retry semantics.

**Architecture:** Keep the signed millisecond-normalized timestamp at the Edge boundary. Make the locked PostgreSQL confirmation compare at that same precision and raise dedicated SQLSTATE `PUG01` for stale business state. A small pure Edge helper owns the SQLSTATE-to-API mapping so the behavior has a focused Deno regression test.

**Tech Stack:** PostgreSQL/PLpgSQL, pgTAP, Supabase Edge Functions, Deno TypeScript, Vitest/Vite.

## Global Constraints

- Preserve fail-closed validation for material catalog, subscription, invoice, and renewal changes.
- Preserve existing pricing, renewal scheduling, quote lifetime, terms, and payment behavior.
- Keep database transactions short and make no external calls while row locks are held.
- Keep `confirm_subscription_upgrade` executable only by `service_role`.
- Use SQLSTATE `PUG01` only for non-retryable stale upgrade quote conditions.

---

### Task 1: Database Regression Coverage

**Files:**
- Modify: `supabase/tests/database/subscription_upgrade_at_renewal.test.sql`

**Interfaces:**
- Consumes: `public.confirm_subscription_upgrade(...)`
- Produces: pgTAP coverage for millisecond timestamp equivalence and SQLSTATE `PUG01`

- [ ] **Step 1: Write the failing millisecond-equivalence test**

Increase the plan count from `40` to `41`. After enabling upgrades, call
`confirm_subscription_upgrade` for `upgrade-test-store-b` with:

```sql
date_trunc(
  'milliseconds',
  (select updated_at from public.settings where id = 'subscriptions')
)
```

as `p_plan_catalog_updated_at`, assert with `lives_ok`, then delete the inserted
test plan change so later cases retain their original fixture state.

- [ ] **Step 2: Change the stale-catalog expectation**

Change the existing stale-catalog `throws_ok` expected SQLSTATE from `40001` to
`PUG01`.

- [ ] **Step 3: Run the linked database test to verify RED**

Run:

```powershell
npx.cmd supabase test db --linked supabase/tests/database/subscription_upgrade_at_renewal.test.sql
```

Expected: the millisecond-equivalence case fails because the current database
function uses exact microsecond comparison, and the stale case reports `40001`
instead of `PUG01`.

### Task 2: Edge Error Mapping Regression Coverage

**Files:**
- Create: `supabase/functions/_shared/subscription-upgrade-error.ts`
- Create: `supabase/functions/_shared/subscription-upgrade-error.test.ts`
- Modify: `supabase/functions/admin-backend/index.ts`

**Interfaces:**
- Produces: `isStaleSubscriptionUpgradeError(error: unknown): boolean`
- Consumes: Supabase error objects containing a `code` property

- [ ] **Step 1: Write the failing Deno test**

Create tests that require:

```ts
isStaleSubscriptionUpgradeError({ code: "PUG01" }) === true
isStaleSubscriptionUpgradeError({ code: "40001" }) === false
isStaleSubscriptionUpgradeError(new Error("stale")) === false
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```powershell
npx.cmd deno test supabase/functions/_shared/subscription-upgrade-error.test.ts
```

Expected: FAIL because the helper module does not yet export the function.

- [ ] **Step 3: Implement the pure mapping helper**

Implement:

```ts
export const STALE_SUBSCRIPTION_UPGRADE_SQLSTATE = "PUG01";

export function isStaleSubscriptionUpgradeError(error: unknown): boolean {
  return Boolean(
    error
      && typeof error === "object"
      && "code" in error
      && String((error as { code?: unknown }).code)
        === STALE_SUBSCRIPTION_UPGRADE_SQLSTATE
  );
}
```

- [ ] **Step 4: Use the helper in `admin-backend`**

Import `isStaleSubscriptionUpgradeError` and replace the
`String(changeError.code) === "40001"` branch with the helper call. Preserve
the existing HTTP 409 payload and `STALE_UPGRADE_QUOTE` API code.

- [ ] **Step 5: Run the focused test to verify GREEN**

Run:

```powershell
npx.cmd deno test supabase/functions/_shared/subscription-upgrade-error.test.ts
```

Expected: PASS with three tests.

### Task 3: PostgreSQL Confirmation Repair

**Files:**
- Modify: `supabase/migrations/20260729072258_fix_subscription_upgrade_confirmation_timeout.sql`

**Interfaces:**
- Replaces: `public.confirm_subscription_upgrade(text,text,jsonb,jsonb,integer,integer,timestamptz,timestamptz,text,text,timestamptz,uuid,text,timestamptz)`
- Preserves: return JSON shape and `service_role`-only execution

- [ ] **Step 1: Recreate the function in the new migration**

Copy the current function definition and change the catalog check to:

```sql
if not found
  or date_trunc('milliseconds', catalog_updated_at)
     is distinct from date_trunc('milliseconds', p_plan_catalog_updated_at)
then
  raise exception 'The subscription plan catalog changed. Request a new quote.'
    using errcode = 'PUG01';
end if;
```

- [ ] **Step 2: Replace intentional serialization errors**

Change all other intentional stale-state raises in this function from
`errcode = '40001'` to `errcode = 'PUG01'`, covering active-plan, amount,
upcoming-invoice, and target-renewal changes.

- [ ] **Step 3: Reassert least-privilege grants**

End the migration with:

```sql
revoke all on function public.confirm_subscription_upgrade(
  text, text, jsonb, jsonb, integer, integer, timestamptz, timestamptz,
  text, text, timestamptz, uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.confirm_subscription_upgrade(
  text, text, jsonb, jsonb, integer, integer, timestamptz, timestamptz,
  text, text, timestamptz, uuid, text, timestamptz
) to service_role;
```

- [ ] **Step 4: Run the focused database test to verify GREEN**

Run:

```powershell
npx.cmd supabase test db --linked supabase/tests/database/subscription_upgrade_at_renewal.test.sql
```

Expected: all 41 pgTAP assertions pass.

### Task 4: Local Verification and Commit

**Files:**
- Verify all files from Tasks 1–3
- Include: `docs/superpowers/plans/2026-07-29-subscription-upgrade-confirmation-timeout.md`

- [ ] **Step 1: Run focused Deno upgrade tests**

```powershell
npx.cmd deno test supabase/functions/_shared/subscription-upgrade-error.test.ts supabase/functions/_shared/subscription-upgrade-token.test.ts supabase/functions/_shared/subscription-upgrade.test.ts
```

- [ ] **Step 2: Run application verification**

```powershell
npm.cmd test -- --run
npm.cmd run lint
npm.cmd run build
```

- [ ] **Step 3: Review the patch**

```powershell
git diff --check
git diff --stat
git status --short
```

- [ ] **Step 4: Commit**

```powershell
git add -- docs/superpowers/plans/2026-07-29-subscription-upgrade-confirmation-timeout.md supabase/tests/database/subscription_upgrade_at_renewal.test.sql supabase/functions/_shared/subscription-upgrade-error.ts supabase/functions/_shared/subscription-upgrade-error.test.ts supabase/functions/admin-backend/index.ts supabase/migrations/20260729072258_fix_subscription_upgrade_confirmation_timeout.sql
git commit -m "fix: prevent upgrade confirmation timeout"
```

### Task 5: Production Apply, Deploy, and Readback

**Files:**
- Deploy: `supabase/functions/admin-backend/index.ts` and its relative shared dependencies
- Apply: `supabase/migrations/20260729072258_fix_subscription_upgrade_confirmation_timeout.sql`

- [ ] **Step 1: Run database advisors before DDL**

Read security and performance advisors and confirm no finding blocks this
function replacement.

- [ ] **Step 2: Apply the migration**

Apply the exact migration SQL to the linked Supabase project and confirm the
migration appears in migration history.

- [ ] **Step 3: Deploy `admin-backend`**

Deploy the local Edge Function bundle with its `_shared` dependencies while
preserving `verify_jwt = false`, because the function performs its existing
custom bearer-token authentication.

- [ ] **Step 4: Verify database behavior**

Run a rollback-safe production query proving:

- the live function definition contains millisecond comparison;
- stale paths use `PUG01`, not `40001`;
- grants remain `service_role` only.

- [ ] **Step 5: Verify the user-visible path**

Confirm no active plan change exists before the retry. Ask the owner to click
Confirm once if their authenticated browser action is required, then inspect:

- one scheduled plan change for store
  `08038788-7f60-4dd6-9332-02474d4a795f`;
- an HTTP 200 `admin-backend` confirmation completing in seconds;
- no duplicate scheduled/locked plan changes;
- no new PostgreSQL `40001` errors from upgrade confirmation.
