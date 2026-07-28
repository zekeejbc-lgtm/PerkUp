# Subscription Tier Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace accidental subscription array ordering with an explicit administrator-controlled tier hierarchy while keeping auditors read-only and preserving PayMongo billing.

**Architecture:** Persist `tierRank` inside the existing subscription-plan JSON catalog. Frontend helpers normalize, validate, display, and reorder the hierarchy; the Edge Function converts the explicit rank into the existing snapshot `order` field so database and renewal code remain compatible. A data-only Supabase migration assigns ranks to the current catalog without touching billing or PayMongo tables.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, Supabase Postgres JSONB, Supabase Edge Functions/Deno.

## Global Constraints

- Only administrators and assistant administrators may modify hierarchy; auditors are read-only.
- Higher rank alone is insufficient: an upgrade must also have a higher price and matching interval.
- PayMongo invoices, links, webhooks, billing subscriptions, and payment events must not be mutated by the catalog migration.
- Legacy catalogs with no ranks are normalized by ascending price and stable original order.
- Partially ranked, duplicate-rank, negative-rank, and non-integer-rank catalogs are rejected.

---

### Task 1: Frontend tier hierarchy domain

**Files:**
- Modify: `src/lib/subscriptionBilling.ts`
- Create: `src/lib/subscriptionTierHierarchy.test.ts`

**Interfaces:**
- Produces: `normalizeSubscriptionTierHierarchy(plans: SubscriptionPlan[]): SubscriptionPlan[]`
- Produces: `validateSubscriptionTierHierarchy(plans: SubscriptionPlan[]): string[]`
- Produces: `moveSubscriptionPlanTier(plans: SubscriptionPlan[], planId: string, direction: "lower" | "higher"): SubscriptionPlan[]`
- Extends: `SubscriptionPlan` with `tierRank?: number | string`

- [ ] **Step 1: Write failing hierarchy tests**

Cover:

```ts
expect(normalizeSubscriptionTierHierarchy([
  { id: "enterprise", name: "Enterprise", price: 2999 },
  { id: "testing", name: "Testing", price: 1 },
])).toMatchObject([
  { id: "testing", tierRank: 0 },
  { id: "enterprise", tierRank: 10 },
]);

expect(validateSubscriptionTierHierarchy([
  { id: "a", name: "A", price: 100, tierRank: 10 },
  { id: "b", name: "B", price: 200, tierRank: 10 },
])).toContain("Tier ranks must be unique.");

expect(moveSubscriptionPlanTier([
  { id: "testing", name: "Testing", price: 1, tierRank: 30 },
  { id: "standard", name: "Standard", price: 999, tierRank: 0 },
], "testing", "lower")).toMatchObject([
  { id: "testing", tierRank: 0 },
  { id: "standard", tierRank: 10 },
]);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/lib/subscriptionTierHierarchy.test.ts`

Expected: FAIL because the three hierarchy functions and `tierRank` field do not exist.

- [ ] **Step 3: Implement minimal hierarchy helpers**

Implement deterministic price fallback, explicit-rank sorting, unique integer validation, duplicate ID/name/price validation, and direction-based swapping followed by `0, 10, 20, ...` reassignment. Add ranks `10`, `20`, and `30` to the three default plans.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npx vitest run src/lib/subscriptionTierHierarchy.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/subscriptionBilling.ts src/lib/subscriptionTierHierarchy.test.ts
git commit -m "feat: add explicit subscription tier hierarchy"
```

### Task 2: Server-side rank authority

**Files:**
- Modify: `supabase/functions/_shared/subscription-upgrade.test.ts`
- Modify: `supabase/functions/_shared/subscription-upgrade.ts`

**Interfaces:**
- Consumes: catalog plan property `tierRank`
- Preserves: `PlanSnapshot.order`, now populated from `tierRank`

- [ ] **Step 1: Write failing Deno tests**

Add tests proving that:

```ts
const plans = normalizePlanCatalog({
  plans: [
    { id: "enterprise", name: "Enterprise", price: 2999, interval: "month", tierRank: 30 },
    { id: "testing", name: "Testing", price: 1, interval: "month", tierRank: 0 },
    { id: "standard", name: "Standard", price: 999, interval: "month", tierRank: 10 },
  ],
});
assertEquals(listEligibleUpgradePlans(plans, "testing").map((plan) => plan.id), ["standard", "enterprise"]);
assertThrows(() => normalizePlanCatalog({ plans: [
  { id: "a", name: "A", price: 100, tierRank: 10 },
  { id: "b", name: "B", price: 200, tierRank: 10 },
] }), Error, "Tier ranks must be unique");
```

- [ ] **Step 2: Run the focused Deno test and verify RED**

Run: `npx -y deno test supabase/functions/_shared/subscription-upgrade.test.ts`

Expected: FAIL because normalization still derives `order` from array index and accepts duplicate explicit ranks.

- [ ] **Step 3: Implement authoritative rank normalization**

Use explicit `tierRank` when every plan provides one. Reject mixed/malformed/duplicate ranks. When no plan provides a rank, sort by price then original index and assign ranks in increments of 10. Sort normalized output by rank so API responses are deterministic.

- [ ] **Step 4: Run Deno tests and verify GREEN**

Run: `npx -y deno test supabase/functions/_shared/subscription-upgrade.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/subscription-upgrade.ts supabase/functions/_shared/subscription-upgrade.test.ts
git commit -m "fix: enforce declared subscription tier ranks"
```

### Task 3: Administrator controls and auditor read-only view

**Files:**
- Create: `src/pages/admin/AdminSubscriptions.test.tsx`
- Modify: `src/pages/admin/AdminSubscriptions.tsx`

**Interfaces:**
- Consumes: hierarchy helpers from `src/lib/subscriptionBilling.ts`
- Consumes: `useAuth()` role
- Persists: `settings/subscriptions.data.plans[*].tierRank`

- [ ] **Step 1: Write failing UI tests**

Mock `dataCompat`, `useAuth`, and `ConfirmationModal` only at external boundaries. Verify:

```ts
expect(screen.getByText("Tier hierarchy")).toBeInTheDocument();
expect(screen.getByText("Lowest tier")).toBeInTheDocument();
expect(screen.getByRole("button", { name: /move testing plan lower/i })).toBeInTheDocument();
```

For an auditor, verify:

```ts
expect(screen.getByText(/read-only hierarchy review/i)).toBeInTheDocument();
expect(screen.queryByRole("button", { name: /edit offers/i })).not.toBeInTheDocument();
```

For an administrator, click **Save Changes**, verify the confirmation contains the ordered plan names and affected primary-subscription count, confirm, and assert `setDoc` receives plans with explicit ranks.

- [ ] **Step 2: Run the focused UI test and verify RED**

Run: `npx vitest run src/pages/admin/AdminSubscriptions.test.tsx`

Expected: FAIL because tier controls, auditor gating, validation, and confirmation do not exist.

- [ ] **Step 3: Implement the UI behavior**

Normalize loaded plans, gate mutation controls with:

```ts
const canManagePlans = user?.role === "admin" || user?.role === "assistant_admin";
```

Add move-lower/move-higher buttons, rank labels, validation messages, next-rank assignment for new plans, and a non-danger `ConfirmationModal`. Load primary stores before confirmation and include the affected configured-subscription count in its description. Persist only after confirmation.

- [ ] **Step 4: Run focused and existing subscription UI tests**

Run:

```bash
npx vitest run src/pages/admin/AdminSubscriptions.test.tsx src/pages/store-owner/StoreOwnerSubscription.test.tsx src/components/SubscriptionUpgradeTermsModal.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/AdminSubscriptions.tsx src/pages/admin/AdminSubscriptions.test.tsx
git commit -m "feat: let admins manage subscription tier hierarchy"
```

### Task 4: Catalog data migration

**Files:**
- Create using CLI: `supabase/migrations/<generated>_declare_subscription_tier_hierarchy.sql`
- Modify generated migration with `apply_patch`

**Interfaces:**
- Updates only: `public.settings.data->'plans'`
- Must not update: `billing_subscriptions`, `billing_invoices`, `paymongo_webhook_events`, or any payment-link data

- [ ] **Step 1: Generate the migration filename**

Run: `npx supabase migration new declare_subscription_tier_hierarchy`

Expected: one timestamped empty migration file.

- [ ] **Step 2: Write the migration**

Use `jsonb_array_elements(... with ordinality)`, sort by numeric price then original ordinality, add `"tierRank": (row_number - 1) * 10`, aggregate back in rank order, and update only the `subscriptions` settings row.

- [ ] **Step 3: Validate in a rollback transaction**

Apply the migration body inside `BEGIN`, query the resulting plan IDs/names/prices/ranks, assert ranks are unique integers and ascending, then `ROLLBACK`.

Expected current result: Testing Plan `0`, Standard `10`, Premium `20`, Enterprise `30`.

- [ ] **Step 4: Verify migration history**

Run: `npx supabase migration list --linked`

Expected: existing local/remote migrations align before deployment.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "chore: rank existing subscription tiers"
```

### Task 5: Full verification and delivery

**Files:**
- Verify all modified files

**Interfaces:**
- Produces: deployable GitHub branch and unchanged PayMongo behavior

- [ ] **Step 1: Run all local verification**

Run:

```bash
npm test
npm run lint
npm run test:auditor
npm run build
npx -y deno test supabase/functions/_shared/subscription-upgrade.test.ts
npx -y deno check supabase/functions/admin-backend/index.ts
```

Expected: every command passes.

- [ ] **Step 2: Review the diff**

Run: `git diff origin/main...HEAD --check` and inspect `git diff --stat origin/main...HEAD`.

Expected: no whitespace errors and no PayMongo implementation files changed.

- [ ] **Step 3: Push and merge through GitHub**

Push `feature/subscription-tier-hierarchy`, open a PR, wait for required checks, and merge only after checks pass.

- [ ] **Step 4: Deploy the development environment**

Apply the generated migration to the connected Supabase development project, deploy `admin-backend` while preserving its existing `verify_jwt` setting and current non-feature code, then deploy the current GitHub main frontend to Vercel.

- [ ] **Step 5: Verify live behavior**

Confirm:

- Catalog ranks are `0, 10, 20, 30` in the intended order.
- The Testing Plan store receives Standard, Premium, and Enterprise as eligible higher-priced monthly plans.
- Auditor cannot save hierarchy.
- Live site returns HTTP 200 and the deployed bundle contains tier hierarchy copy.
- Recent Edge Function logs contain no unhandled errors or HTTP 500 responses.
