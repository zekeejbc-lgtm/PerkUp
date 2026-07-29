# Remove Lifetime Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove customer-level lifetime points from persistence, backend updates, and both customer and store-owner interfaces while keeping one current balance per store card.

**Architecture:** The existing `cards.data.stars` field becomes the only general loyalty balance and `cards.data.promoProgress` remains the independent promotion balance. A migration strips the obsolete JSON key and replaces the existing RPC body without changing its deployment-sensitive signature; a small pure frontend helper centralizes store-specific customer segmentation.

**Tech Stack:** React 19, TypeScript 5.8, Vitest, Supabase Edge Functions, PostgreSQL JSONB, pgTAP.

## Global Constraints

- Preserve `public.increment_loyalty_totals(text,text,integer,text)` and its default fourth argument for rolling-deployment compatibility.
- Keep RPC execution restricted to `service_role`.
- Do not modify existing card `stars` balances or `promoProgress`.
- Historical migrations remain unchanged; removal is represented by one new migration.
- Preserve unrelated dirty-worktree changes.

---

### Task 1: Store-specific customer segmentation

**Files:**
- Create: `src/lib/customerLoyaltySegment.ts`
- Create: `src/lib/customerLoyaltySegment.test.ts`
- Modify: `src/pages/store-owner/StoreOwnerCustomers.tsx`

**Interfaces:**
- Consumes: a store card's numeric `stars` value.
- Produces: `getCustomerLoyaltySegment(points: number): "new" | "regular" | "loyal"` and `getCustomerLoyaltyLabel(points: number): "New Customer" | "Regular Customer" | "Loyal Regular"`.

- [ ] **Step 1: Write the failing segment tests**

```ts
import { describe, expect, test } from "vitest";
import {
  getCustomerLoyaltyLabel,
  getCustomerLoyaltySegment,
} from "./customerLoyaltySegment";

describe("customer loyalty segment", () => {
  test.each([
    [0, "new"],
    [5, "new"],
    [6, "regular"],
    [20, "regular"],
    [21, "loyal"],
  ])("maps %i current store points to %s", (points, expected) => {
    expect(getCustomerLoyaltySegment(points)).toBe(expected);
  });

  test("uses customer-facing labels", () => {
    expect(getCustomerLoyaltyLabel(0)).toBe("New Customer");
    expect(getCustomerLoyaltyLabel(6)).toBe("Regular Customer");
    expect(getCustomerLoyaltyLabel(21)).toBe("Loyal Regular");
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm.cmd test -- src/lib/customerLoyaltySegment.test.ts`

Expected: FAIL because `customerLoyaltySegment.ts` does not exist.

- [ ] **Step 3: Implement the pure segment helper**

```ts
export type CustomerLoyaltySegment = "new" | "regular" | "loyal";

export function getCustomerLoyaltySegment(points: number): CustomerLoyaltySegment {
  const balance = Number.isFinite(points) ? points : 0;
  if (balance > 20) return "loyal";
  if (balance > 5) return "regular";
  return "new";
}

export function getCustomerLoyaltyLabel(points: number) {
  const segment = getCustomerLoyaltySegment(points);
  if (segment === "loyal") return "Loyal Regular";
  if (segment === "regular") return "Regular Customer";
  return "New Customer";
}
```

- [ ] **Step 4: Remove lifetime loading and switch the owner UI to current points**

In `StoreOwnerCustomers.tsx`:

- remove `lifetimeStars` from the loaded customer model;
- stop reading the `customers` document solely for `lifetimeStars`, while retaining profile data actually used by the page;
- remove the “Lifetime Points Earned” profile row;
- replace all thresholds based on `customer.lifetimeStars` with the helper and `customer.stars`;
- keep the Current Points card and promotion stamp cards unchanged.

- [ ] **Step 5: Run the focused test and TypeScript**

Run: `npm.cmd test -- src/lib/customerLoyaltySegment.test.ts`

Expected: PASS.

Run: `npm.cmd run lint`

Expected: exit 0.

- [ ] **Step 6: Commit the store-owner change**

```powershell
git add -- src/lib/customerLoyaltySegment.ts src/lib/customerLoyaltySegment.test.ts src/pages/store-owner/StoreOwnerCustomers.tsx
git commit -m "refactor: segment customers by current points"
```

### Task 2: Remove lifetime points from application services and customer UI

**Files:**
- Modify: `src/pages/customer/CustomerOverview.tsx`
- Modify: `supabase/functions/update-customer-profile/index.ts`
- Modify: `supabase/functions/admin-backend/index.ts`
- Modify: `firebase-blueprint.json`
- Modify: `security_spec.md`

**Interfaces:**
- Consumes: existing customer profiles and store cards without requiring `lifetimeStars`.
- Produces: customer creation/update payloads that never recreate `lifetimeStars`.

- [ ] **Step 1: Add a repository-level failing assertion**

Run:

```powershell
rg -n -S "lifetimeStars|Lifetime Points|Lifetime Stars" src supabase/functions firebase-blueprint.json security_spec.md
```

Expected: matches in the five files listed above.

- [ ] **Step 2: Remove the customer overview metric**

In `CustomerOverview.tsx`, remove the `lifetimeStars` state, its customer-document read, and the Lifetime Stars summary card. Keep Active Cards and all other overview loading and rendering intact.

- [ ] **Step 3: Remove backend field initialization and preservation**

In `update-customer-profile/index.ts`, remove `lifetimeStars` from the merged customer payload.

In `admin-backend/index.ts`, remove `lifetimeStars: 0` from administrative customer creation.

- [ ] **Step 4: Update compatibility and security documentation**

In `firebase-blueprint.json`, remove the `lifetimeStars` property and its required-field entry from the customer schema.

In `security_spec.md`, replace the obsolete customer-level lifetime-star tampering scenario with direct unauthorized modification of `cards.data.stars`.

- [ ] **Step 5: Verify active application references are gone**

Run:

```powershell
rg -n -S "lifetimeStars|Lifetime Points|Lifetime Stars" src supabase/functions firebase-blueprint.json security_spec.md
```

Expected: no matches.

Run: `npm.cmd run lint`

Expected: exit 0.

- [ ] **Step 6: Commit the application removal**

```powershell
git add -- src/pages/customer/CustomerOverview.tsx supabase/functions/update-customer-profile/index.ts supabase/functions/admin-backend/index.ts firebase-blueprint.json security_spec.md
git commit -m "refactor: remove lifetime points from app"
```

### Task 3: Remove persisted lifetime points and cumulative update logic

**Files:**
- Create: `supabase/migrations/<generated>_remove_lifetime_points.sql`
- Create: `supabase/tests/database/lifetime_points_removal.test.sql`

**Interfaces:**
- Consumes: `public.increment_loyalty_totals(p_customer_id text, p_card_id text, p_points integer, p_stamp_receipt_id text default null)`.
- Produces: the same RPC signature and permissions, but it updates only the targeted card's `stars`, receipt ID, and `updatedAt`.

- [ ] **Step 1: Discover the installed migration command**

Run: `npx.cmd supabase migration new --help`

Expected: help text showing the migration-name argument.

- [ ] **Step 2: Generate the migration file**

Run: `npx.cmd supabase migration new remove_lifetime_points`

Expected: one new timestamped SQL file under `supabase/migrations`.

- [ ] **Step 3: Write the failing pgTAP regression test**

Create a transaction-scoped test that:

1. plans four assertions;
2. inserts a customer with `{"lifetimeStars":12,"name":"Test"}`;
3. inserts a card with zero stars;
4. calls the four-argument RPC with one point and a receipt ID;
5. asserts the card now has one star;
6. asserts the customer no longer has a `lifetimeStars` key, which fails against the current function before the removal migration is applied;
7. asserts the RPC signature still resolves;
8. asserts `anon` and `authenticated` lack execute permission.

- [ ] **Step 4: Run the database test and verify it fails**

Run: `npx.cmd supabase test db supabase/tests/database/lifetime_points_removal.test.sql`

Expected: FAIL because the current RPC still writes `customers.data.lifetimeStars`.

- [ ] **Step 5: Implement the migration**

The migration must:

```sql
update public.customers
set data = data - 'lifetimeStars'
where data ? 'lifetimeStars';
```

It must then `create or replace` the four-argument `security invoker` RPC with the existing validation, update only `public.cards`, preserve the default `null` receipt argument, retain the card/customer ownership predicate, and keep the current `revoke all`/`grant execute to service_role` statements. It must not insert or update `public.customers`.

- [ ] **Step 6: Run database regression tests**

Run: `npx.cmd supabase test db supabase/tests/database/lifetime_points_removal.test.sql`

Expected: PASS.

Run: `npx.cmd supabase test db supabase/tests/database/loyalty_totals_rpc_signature.test.sql`

Expected: PASS.

- [ ] **Step 7: Run database advisors**

Run: `npx.cmd supabase db advisors`

Expected: no new security or performance findings caused by the migration.

- [ ] **Step 8: Commit the database removal**

```powershell
git add -- supabase/migrations/*_remove_lifetime_points.sql supabase/tests/database/lifetime_points_removal.test.sql
git commit -m "refactor: remove persisted lifetime points"
```

### Task 4: Full verification and cleanup

**Files:**
- Verify all files modified in Tasks 1–3.

**Interfaces:**
- Consumes: the completed frontend, Edge Function, documentation, migration, and tests.
- Produces: evidence that the repository no longer has active lifetime-point behavior.

- [ ] **Step 1: Run focused frontend tests**

Run: `npm.cmd test -- src/lib/customerLoyaltySegment.test.ts`

Expected: PASS.

- [ ] **Step 2: Run the full frontend test suite**

Run: `npm.cmd test`

Expected: all tests pass.

- [ ] **Step 3: Run TypeScript and production build**

Run: `npm.cmd run lint`

Expected: exit 0.

Run: `npm.cmd run build`

Expected: exit 0.

- [ ] **Step 4: Check active and historical references**

Run:

```powershell
rg -n -S "lifetimeStars|Lifetime Points|Lifetime Stars" src supabase/functions firebase-blueprint.json security_spec.md supabase/tests
```

Expected: no active-source or test matches.

Run:

```powershell
rg -n -S "lifetimeStars" supabase/migrations
```

Expected: matches only in historical migrations and the new removal migration.

- [ ] **Step 5: Check patch integrity**

Run: `git diff --check`

Expected: no whitespace errors in the implementation changes.

Run: `git status --short`

Expected: unrelated pre-existing changes remain untouched and identifiable.

- [ ] **Step 6: Commit any verification-only corrections**

If verification required a scoped correction, stage only the affected lifetime-points files and commit:

```powershell
git commit -m "test: verify lifetime points removal"
```
