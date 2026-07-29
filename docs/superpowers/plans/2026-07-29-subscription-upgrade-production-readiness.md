# Subscription Upgrade Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make subscription upgrades auditor-controlled, fail-closed, time-bound, transactionally revalidated, and safe to deploy disabled to the development Supabase project.

**Architecture:** Extend the existing singleton runtime configuration rather than introduce a generic flag platform. The Edge Function signs 15-minute quote claims with HMAC, while the database RPC locks and verifies the runtime row, catalog version, subscription, store, and renewal invoice before scheduling. Existing locked invoices remain independent of the switch.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Vitest, Deno Web Crypto, Supabase Edge Functions, PostgreSQL/PLpgSQL, pgTAP, PayMongo renewal invoices.

## Global Constraints

- Work directly on `main`; the user explicitly approved current-branch implementation.
- Preserve the unrelated existing edits in `src/lib/subscriptionBilling.ts`, `src/pages/admin/AdminSubscriptions.preferred.test.tsx`, and `src/pages/admin/AdminSubscriptions.tsx`.
- Keep `subscription_upgrades_enabled` false throughout migration, deployment, and verification.
- Only an active auditor may toggle availability.
- Disabling blocks quotes and confirmations but never cancellation or fulfillment of already-locked invoices.
- Do not add downgrades, proration, immediate charges, replacement invoices, or another payment path.
- Never expose the service-role key or `SUBSCRIPTION_UPGRADE_QUOTE_SECRET` to frontend code or logs.
- Follow red-green-refactor for every behavior change.

---

### Task 1: Signed Quote Token

**Files:**
- Create: `supabase/functions/_shared/subscription-upgrade-token.ts`
- Create: `supabase/functions/_shared/subscription-upgrade-token.test.ts`
- Modify: `supabase/functions/_shared/subscription-upgrade.ts`
- Modify: `src/lib/subscriptionUpgrade.ts`
- Modify: `src/lib/subscriptionUpgradeApi.ts`

**Interfaces:**
- Consumes: `UpgradeQuote` from `_shared/subscription-upgrade.ts`.
- Produces:
  - `SubscriptionUpgradeQuoteClaims`
  - `signSubscriptionUpgradeQuote(claims, secret): Promise<string>`
  - `verifySubscriptionUpgradeQuote(token, secret, expected, now?): Promise<SubscriptionUpgradeQuoteClaims>`
  - public quote field `quoteToken: string`

- [ ] **Step 1: Write failing token tests**

Add Deno tests using literal claims for successful round-trip and rejection of
tampering, wrong secret, expiration, future issue time, wrong owner, wrong
store, wrong target, and changed fingerprint. Each rejection asserts the stable
error code carried by `SubscriptionUpgradeQuoteTokenError`.

- [ ] **Step 2: Run the token tests and verify RED**

Run:

```powershell
npx.cmd deno test supabase/functions/_shared/subscription-upgrade-token.test.ts
```

Expected: failure because the token module and exported contracts do not exist.

- [ ] **Step 3: Implement the minimal token module**

Use base64url-encoded canonical JSON plus HMAC-SHA-256. Validate exact claim
keys, version `1`, non-empty secret, finite timestamps, `expiresAt-issuedAt =
900000`, no more than 30 seconds of future clock skew, and expected identity
fields. Compare signatures without an early exit.

- [ ] **Step 4: Attach token types to quote contracts**

Add `quoteToken` to both Edge and frontend quote types. Keep the material
fingerprint independent of timestamps; the signed token binds its lifetime.

- [ ] **Step 5: Run token and existing upgrade tests and verify GREEN**

Run:

```powershell
npx.cmd deno test supabase/functions/_shared/subscription-upgrade-token.test.ts supabase/functions/_shared/subscription-upgrade.test.ts
npm.cmd test -- --run src/lib/subscriptionUpgrade.test.ts src/components/SubscriptionUpgradeTermsModal.test.tsx
```

Expected: all focused tests pass.

### Task 2: Runtime Switch and Atomic Database Confirmation

**Files:**
- Create using CLI: `supabase/migrations/<timestamp>_harden_subscription_upgrade_activation.sql`
- Modify: `supabase/tests/database/subscription_upgrade_at_renewal.test.sql`

**Interfaces:**
- Consumes: existing `public.system_runtime_config`, `public.settings`,
  `public.billing_subscriptions`, `public.billing_invoices`, and
  `public.subscription_plan_changes`.
- Produces:
  - runtime columns `subscription_upgrades_enabled`,
    `subscription_upgrades_changed_at`, and
    `subscription_upgrades_changed_by`
  - revised `public.confirm_subscription_upgrade(...)` parameters
    `p_plan_catalog_updated_at`, `p_current_renewal_invoice_id`, and
    `p_current_renewal_invoice_status`

- [ ] **Step 1: Add failing pgTAP assertions**

Extend the plan count and assert disabled default, browser non-mutation,
service-role-only RPC execution, rejection while disabled, stale catalog
rejection, changed invoice identity/status rejection, cancellation while
disabled, and locked payment application while disabled.

- [ ] **Step 2: Create the migration through the CLI**

Run:

```powershell
npx.cmd supabase migration new harden_subscription_upgrade_activation
```

Expected: a new timestamped migration file.

- [ ] **Step 3: Implement the migration**

Add runtime columns with `false` default, expose only read access needed by the
runtime context, add indexes for changed-by metadata, and replace the
confirmation RPC. The RPC must lock the runtime row first, lock the catalog row
and compare `updated_at`, then lock subscription/store/invoice rows and compare
all token-bound expectations. Revoke from `PUBLIC`, `anon`, and
`authenticated`; grant only `service_role`.

- [ ] **Step 4: Validate SQL without mutating hosted state**

Run:

```powershell
npx.cmd supabase db lint --help
```

Then use the supported lint command, plus static `rg` checks for the revised
signature and grants. Expected: no SQL parse/lint error.

### Task 3: Edge Enforcement and Auditor Toggle

**Files:**
- Modify: `supabase/functions/_shared/runtime.ts`
- Modify: `supabase/functions/admin-backend/index.ts`
- Modify: `.env.example`
- Test: `supabase/functions/_shared/subscription-upgrade-token.test.ts`
- Test: `src/pages/store-owner/StoreOwnerSubscription.test.tsx`
- Test: `src/pages/admin/AdminRuntimeControl.test.tsx`

**Interfaces:**
- Consumes: token helpers from Task 1 and revised RPC/runtime columns from Task
  2.
- Produces:
  - action `set_subscription_upgrades_enabled`
  - runtime response fields `subscription_upgrades_enabled`,
    `subscription_upgrades_changed_at`, and
    `subscription_upgrades_changed_by`
  - stable errors `SUBSCRIPTION_UPGRADES_DISABLED`,
    `INVALID_UPGRADE_QUOTE`, `EXPIRED_UPGRADE_QUOTE`,
    `STALE_UPGRADE_QUOTE`, and `UPGRADE_ALREADY_SCHEDULED`

- [ ] **Step 1: Write failing endpoint-consumer tests**

Test that a disabled options response still retains a pending change, cancel
remains callable, expired/stale errors refresh and reset the modal, and the
auditor control sends the exact password, phrase, and boolean payload.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
npm.cmd test -- --run src/pages/store-owner/StoreOwnerSubscription.test.tsx src/pages/admin/AdminRuntimeControl.test.tsx
```

Expected: failures for missing runtime fields/control and quote token payload.

- [ ] **Step 3: Implement runtime reads and toggle action**

Read the database-backed switch in `readRuntimeConfig`. Add an auditor-only
toggle action using the existing password verification and audit-event helpers.
Require exact confirmation phrases. Remove the environment variable as an
authority.

- [ ] **Step 4: Enforce and sign quote operations**

Options return disabled state plus any active change. Quote and confirm reject
when disabled. Quote signs claims with
`requiredEnv("SUBSCRIPTION_UPGRADE_QUOTE_SECRET")`. Confirm verifies the token
before reloading state, compares the rebuilt material fingerprint, and passes
catalog/invoice expectations to the revised RPC. Owner and admin cancellation
remain available while disabled.

- [ ] **Step 5: Run Edge and focused UI tests and verify GREEN**

Run the commands from Steps 2 and Task 1 Step 5. Expected: all pass.

### Task 4: Auditor and Store-Owner Interfaces

**Files:**
- Modify: `src/contexts/RuntimeModeContext.tsx`
- Modify: `src/pages/admin/AdminRuntimeControl.tsx`
- Create: `src/pages/admin/AdminRuntimeControl.test.tsx`
- Modify: `src/pages/store-owner/StoreOwnerSubscription.tsx`
- Modify: `src/pages/store-owner/StoreOwnerSubscription.test.tsx`
- Modify: `src/lib/subscriptionUpgradeApi.ts`

**Interfaces:**
- Consumes: runtime and endpoint contracts from Task 3.
- Produces: auditor availability control and runtime-driven owner upgrade UI.

- [ ] **Step 1: Complete failing accessibility and behavior tests**

Assert the toggle status label, password visibility, exact phrase gate,
disabled submit, error handling, successful runtime refresh, hidden owner plan
choices while disabled, visible pending summary, and allowed cancellation.

- [ ] **Step 2: Implement the auditor control**

Add a dedicated card and confirmation dialog on Runtime Modes. Never optimistically
flip state; refresh from the database after success. Use accessible labels,
focusable controls, disabled/loading states, and non-sensitive toast messages.

- [ ] **Step 3: Implement runtime-driven owner UI**

Remove `VITE_SUBSCRIPTION_UPGRADES_ENABLED` gating. Always load backend options
for a primary store. Send `quoteToken` on confirm. Treat expired and stale
quotes identically for review reset. When disabled, render no plan buttons but
preserve pending-change display and cancellation.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -- --run src/pages/admin/AdminRuntimeControl.test.tsx src/pages/store-owner/StoreOwnerSubscription.test.tsx src/components/SubscriptionUpgradeTermsModal.test.tsx
```

Expected: all pass with no React warnings.

### Task 5: Full Verification, Hosted Deployment, and Fail-Closed Audit

**Files:**
- Modify if required by verified failures only: files from Tasks 1-4
- Deploy: new migration and `admin-backend`

**Interfaces:**
- Consumes: all completed tasks.
- Produces: deployed disabled hardening with verification evidence.

- [ ] **Step 1: Run complete local verification**

Run:

```powershell
npm.cmd test
npm.cmd run -s lint
npm.cmd run -s build
npm.cmd run -s test:auditor
```

Expected: zero failures and exit code 0 for every command.

- [ ] **Step 2: Review the exact patch**

Run `git diff --check`, inspect `git diff --stat`, and review every changed
hunk. Confirm unrelated user edits are neither overwritten nor staged.

- [ ] **Step 3: Apply the migration to the connected development project**

Use the Supabase MCP `apply_migration` tool with the exact reviewed migration
SQL and its snake-case name. Expected: successful migration.

- [ ] **Step 4: Configure and deploy the Edge Function**

Generate a cryptographically random 32-byte secret without printing it, set
`SUBSCRIPTION_UPGRADE_QUOTE_SECRET` through the linked Supabase CLI, and deploy
`admin-backend` using the Supabase MCP deployment tool with all imported files.

- [ ] **Step 5: Run linked database tests**

Run:

```powershell
npx.cmd supabase test db --linked supabase/tests/database/subscription_upgrade_at_renewal.test.sql
```

Expected: every pgTAP assertion passes and the transaction rolls back fixtures.

- [ ] **Step 6: Run hosted advisors and invariant queries**

Use Supabase MCP security/performance advisors and read-only SQL. Confirm:

- runtime switch is false;
- no duplicate scheduled/locked changes;
- no paid upgrade invoice lacks an applied change;
- no failed upgrade notification is stranded;
- revised function privileges exclude browser roles.

- [ ] **Step 7: Verify deployment versions and recent logs**

Confirm the migration is listed, `admin-backend` is active at the new version,
and recent Edge/Postgres logs show no upgrade-related 5xx or SQL exceptions.

- [ ] **Step 8: Commit implementation without enabling**

Stage only the production-hardening files and commit:

```powershell
git commit -m "feat: harden subscription upgrade activation"
```

Report the PayMongo test-mode activation gate separately. Do not turn the
auditor switch on without a successful authenticated external payment
lifecycle.
