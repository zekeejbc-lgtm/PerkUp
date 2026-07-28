# Preferred Subscription Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let administrators and auditors choose exactly one preferred subscription plan, default legacy configurations to the last plan, and surface that preference in public plan displays.

**Architecture:** Keep preference in the existing subscription plan objects as an optional `preferred` boolean. Central pure helpers in `subscriptionBilling.ts` resolve and normalize the preference so the dashboard, pricing page, and application form share one rule without affecting billing calculations.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Vitest 3, Tailwind CSS, existing Firestore-compatible data layer.

## Global Constraints

- At most one plan is preferred.
- When no explicit preference exists, the last plan is preferred.
- Saving a non-empty plan list persists exactly one `preferred: true`.
- Plan order does not change.
- The application initially selects the preferred plan but still allows another selection.
- Preference does not change pricing, invoicing, subscription limits, or eligibility.
- Existing subscription settings remain backward-compatible and require no database migration.

---

## File Structure

- `src/lib/subscriptionBilling.ts`: Owns the plan type and pure preference-resolution/normalization helpers.
- `src/lib/subscriptionBilling.test.ts`: Verifies single-selection, legacy fallback, malformed data repair, selection, deletion fallback, and empty-list behavior.
- `src/pages/admin/AdminSubscriptions.tsx`: Adds the shared administrator/auditor preference control, preview badge, card highlight, and save normalization.
- `src/pages/MarketingPage.tsx`: Shows the preferred badge and highlight on public pricing cards.
- `src/components/PartnerApplicationModal.tsx`: Defaults selection to the preferred plan and shows its badge/highlight.

### Task 1: Preferred-plan domain helpers

**Files:**

- Create: `src/lib/subscriptionBilling.test.ts`
- Modify: `src/lib/subscriptionBilling.ts:1-45`

**Interfaces:**

- Produces: `getPreferredSubscriptionPlanIndex(plans: SubscriptionPlan[]): number`
- Produces: `getPreferredSubscriptionPlan(plans: SubscriptionPlan[]): SubscriptionPlan | undefined`
- Produces: `normalizePreferredSubscriptionPlans(plans: SubscriptionPlan[]): SubscriptionPlan[]`
- Produces: `setPreferredSubscriptionPlan(plans: SubscriptionPlan[], preferredIndex: number): SubscriptionPlan[]`

- [ ] **Step 1: Write failing helper tests**

Create `src/lib/subscriptionBilling.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  getPreferredSubscriptionPlan,
  getPreferredSubscriptionPlanIndex,
  normalizePreferredSubscriptionPlans,
  setPreferredSubscriptionPlan,
  type SubscriptionPlan,
} from "./subscriptionBilling";

const plans = (preferredIndexes: number[] = []): SubscriptionPlan[] =>
  ["Standard", "Premium", "Enterprise"].map((name, index) => ({
    id: name.toLowerCase(),
    name,
    preferred: preferredIndexes.includes(index),
  }));

describe("preferred subscription plans", () => {
  it("resolves an explicit preferred plan", () => {
    expect(getPreferredSubscriptionPlanIndex(plans([1]))).toBe(1);
    expect(getPreferredSubscriptionPlan(plans([1]))?.name).toBe("Premium");
  });

  it("uses the last plan for legacy data without a preference", () => {
    expect(getPreferredSubscriptionPlanIndex(plans())).toBe(2);
    expect(getPreferredSubscriptionPlan(plans())?.name).toBe("Enterprise");
  });

  it("normalizes multiple flags to the first explicit preference", () => {
    expect(normalizePreferredSubscriptionPlans(plans([0, 2])).map((plan) => plan.preferred))
      .toEqual([true, false, false]);
  });

  it("marks only the selected plan as preferred", () => {
    expect(setPreferredSubscriptionPlan(plans([0]), 2).map((plan) => plan.preferred))
      .toEqual([false, false, true]);
  });

  it("falls back to the new last plan after the preferred plan is removed", () => {
    const remaining = plans([2]).slice(0, 2);
    expect(normalizePreferredSubscriptionPlans(remaining).map((plan) => plan.preferred))
      .toEqual([false, true]);
  });

  it("returns no preference for an empty list", () => {
    expect(getPreferredSubscriptionPlanIndex([])).toBe(-1);
    expect(getPreferredSubscriptionPlan([])).toBeUndefined();
    expect(normalizePreferredSubscriptionPlans([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npx vitest run src/lib/subscriptionBilling.test.ts
```

Expected: FAIL because the four preferred-plan helpers and `preferred` property do not exist.

- [ ] **Step 3: Add the plan property and pure helpers**

In `src/lib/subscriptionBilling.ts`, extend `SubscriptionPlan` and add the helpers after `DEFAULT_SUBSCRIPTION_PLANS`:

```ts
export type SubscriptionPlan = {
  id?: string;
  name?: string;
  price?: number | string;
  interval?: string;
  features?: string[];
  dependencies?: SubscriptionDependencies;
  preferred?: boolean;
};

export function getPreferredSubscriptionPlanIndex(plans: SubscriptionPlan[]) {
  if (plans.length === 0) return -1;
  const explicitIndex = plans.findIndex((plan) => plan.preferred === true);
  return explicitIndex >= 0 ? explicitIndex : plans.length - 1;
}

export function getPreferredSubscriptionPlan(plans: SubscriptionPlan[]) {
  const preferredIndex = getPreferredSubscriptionPlanIndex(plans);
  return preferredIndex >= 0 ? plans[preferredIndex] : undefined;
}

export function setPreferredSubscriptionPlan(
  plans: SubscriptionPlan[],
  preferredIndex: number,
) {
  if (preferredIndex < 0 || preferredIndex >= plans.length) {
    return normalizePreferredSubscriptionPlans(plans);
  }
  return plans.map((plan, index) => ({ ...plan, preferred: index === preferredIndex }));
}

export function normalizePreferredSubscriptionPlans(plans: SubscriptionPlan[]) {
  return setPreferredSubscriptionPlanUnsafe(plans, getPreferredSubscriptionPlanIndex(plans));
}

function setPreferredSubscriptionPlanUnsafe(
  plans: SubscriptionPlan[],
  preferredIndex: number,
) {
  return plans.map((plan, index) => ({ ...plan, preferred: index === preferredIndex }));
}
```

Set `preferred: true` on the last entry in `DEFAULT_SUBSCRIPTION_PLANS` so brand-new settings persist the intended default explicitly.

- [ ] **Step 4: Run the focused test**

Run:

```powershell
npx vitest run src/lib/subscriptionBilling.test.ts
```

Expected: PASS with 6 tests.

- [ ] **Step 5: Commit the domain behavior**

```powershell
git add -- src/lib/subscriptionBilling.ts src/lib/subscriptionBilling.test.ts
git commit -m "feat: add preferred subscription plan helpers"
```

### Task 2: Administrator and auditor dashboard control

**Files:**

- Modify: `src/pages/admin/AdminSubscriptions.tsx:1-370`

**Interfaces:**

- Consumes: `getPreferredSubscriptionPlanIndex(plans)`
- Consumes: `normalizePreferredSubscriptionPlans(plans)`
- Consumes: `setPreferredSubscriptionPlan(plans, preferredIndex)`

- [ ] **Step 1: Import the preference helpers and normalize writes**

Add the three helpers to the import from `subscriptionBilling`.

At the start of `handleSave`, resolve the exact array that will be stored and used for subsequent calculations:

```ts
const normalizedPlans = normalizePreferredSubscriptionPlans(plans);
```

Replace the subscription document write with:

```ts
await setDoc(
  doc(db, "settings", "subscriptions"),
  { plans: normalizedPlans, updatedAt: serverTimestamp() },
  { merge: true },
);
```

Use `normalizedPlans` instead of `plans` in `getSubscriptionOwedAmount` and `getSubscriptionDependencies`, then finish the save with:

```ts
setPlans(normalizedPlans);
setOriginalPlans(normalizedPlans);
```

- [ ] **Step 2: Preserve the one-preferred invariant during edits**

Replace removal and add the selection handler:

```ts
const handleRemovePlan = (index: number) => {
  setPlans((current) =>
    normalizePreferredSubscriptionPlans(current.filter((_, planIndex) => planIndex !== index)),
  );
};

const handlePreferredPlanChange = (index: number) => {
  setPlans((current) => setPreferredSubscriptionPlan(current, index));
};
```

Keep `handleAddPlan` from changing an existing explicit preference. Its existing appended plan should use `preferred: plans.length === 0`, ensuring the first created plan is preferred.

- [ ] **Step 3: Add the dashboard selector, badge, and highlight**

Inside the plan-card map, calculate:

```ts
const isPreferred = getPreferredSubscriptionPlanIndex(plans) === planIndex;
```

Give preferred cards a green-accent border/ring while retaining dark-mode classes:

```tsx
className={`group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:shadow-md dark:bg-gray-800/50 ${
  isPreferred
    ? "border-green-500 ring-1 ring-green-500/30 dark:border-green-400"
    : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"
}`}
```

Place this badge near the top of the card so it appears in edit and preview modes:

```tsx
{isPreferred && (
  <span className="absolute left-4 top-4 z-[1] rounded-full bg-green-600 px-3 py-1 text-xs font-semibold text-white dark:bg-green-500 dark:text-green-950">
    Preferred
  </span>
)}
```

In edit mode, add a radio-style control below the interval fields:

```tsx
<button
  type="button"
  role="radio"
  aria-checked={isPreferred}
  onClick={() => handlePreferredPlanChange(planIndex)}
  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
    isPreferred
      ? "border-green-500 bg-green-50 text-green-800 dark:bg-green-500/15 dark:text-green-200"
      : "border-gray-200 text-gray-600 hover:border-green-400 dark:border-gray-700 dark:text-gray-300"
  }`}
>
  <span>Preferred plan</span>
  <span aria-hidden="true" className={`h-4 w-4 rounded-full border-4 ${isPreferred ? "border-green-600 bg-white" : "border-gray-300 bg-white"}`} />
</button>
```

Adjust top padding/right padding so the badge and delete button do not overlap the plan name.

- [ ] **Step 4: Verify dashboard compilation**

Run:

```powershell
npm run lint
```

Expected: TypeScript exits successfully with no errors.

- [ ] **Step 5: Commit the shared dashboard control**

```powershell
git add -- src/pages/admin/AdminSubscriptions.tsx
git commit -m "feat: manage preferred plans in subscriptions dashboard"
```

### Task 3: Public pricing and application plan presentation

**Files:**

- Modify: `src/pages/MarketingPage.tsx:1-125`
- Modify: `src/components/PartnerApplicationModal.tsx:1-110`
- Modify: `src/components/PartnerApplicationModal.tsx:510-550`

**Interfaces:**

- Consumes: `getPreferredSubscriptionPlan(plans)`
- Consumes: `getPreferredSubscriptionPlanIndex(plans)`

- [ ] **Step 1: Highlight the preferred public pricing card**

Import `getPreferredSubscriptionPlanIndex` in `MarketingPage.tsx`. Change the plan map to receive `planIndex`, compute:

```ts
const isPreferred = getPreferredSubscriptionPlanIndex(plans) === planIndex;
```

Return a relative card with conditional green-accent styling and place the badge before the heading:

```tsx
{isPreferred && (
  <span className="absolute right-5 top-5 rounded-full bg-green-600 px-3 py-1 text-xs font-semibold text-white dark:bg-green-500 dark:text-green-950">
    Preferred
  </span>
)}
```

Keep plan order, features, pricing, and application link behavior unchanged.

- [ ] **Step 2: Default the application form to the preferred plan**

Type the state as `SubscriptionPlan[]` and import both `SubscriptionPlan` and `getPreferredSubscriptionPlan`.

Replace the load success block with:

```ts
const loadedPlans = docSnap.data().plans as SubscriptionPlan[];
setPlans(loadedPlans);
setSelectedPlanId(getPreferredSubscriptionPlan(loadedPlans)?.name || "");
```

This changes only the initial selection. The existing plan-card click handler continues to allow any plan.

- [ ] **Step 3: Add the preferred badge and highlight to application cards**

Before rendering plan cards, resolve:

```ts
const preferredPlan = getPreferredSubscriptionPlan(plans);
```

Inside the map, calculate:

```ts
const isPreferred = plan === preferredPlan;
```

Add a `Preferred` pill above the plan name and include a green-accent ring/border for the preferred card without overriding the stronger selected state. Keep the existing selected check icon, feature list, and click behavior.

- [ ] **Step 4: Run all automated verification**

Run:

```powershell
npx vitest run src/lib/subscriptionBilling.test.ts
npm test
npm run lint
npm run build
```

Expected: the focused test and full suite pass, TypeScript reports no errors, and the Vite production build completes successfully.

- [ ] **Step 5: Review the final diff**

Run:

```powershell
git diff --check
git status --short
git diff -- src/lib/subscriptionBilling.ts src/lib/subscriptionBilling.test.ts src/pages/admin/AdminSubscriptions.tsx src/pages/MarketingPage.tsx src/components/PartnerApplicationModal.tsx
```

Expected: no whitespace errors; only the intended preferred-plan changes appear in these files. Preserve unrelated working-tree files.

- [ ] **Step 6: Commit the public presentation**

```powershell
git add -- src/pages/MarketingPage.tsx src/components/PartnerApplicationModal.tsx
git commit -m "feat: surface preferred subscription plans"
```

