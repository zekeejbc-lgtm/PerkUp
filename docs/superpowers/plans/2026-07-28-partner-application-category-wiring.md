# Partner Application Category Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every newly submitted and approved partner application supplies a category that is persisted on the resulting store.

**Architecture:** Extend the existing application request and record with a required `category` string. Isolate the application-to-store field mapping in a pure helper so the approval boundary has a focused regression test, then use that helper in the admin setup form while keeping category editable for legacy applications.

**Tech Stack:** React 19, TypeScript 5.8, Node test runner, Supabase Edge Functions, existing `CategoryInput` and store-directory category utilities.

## Global Constraints

- Category is required for new public applications and for admin approval.
- Category is trimmed and limited to 120 characters by the public Edge Function.
- Custom and comma-separated categories remain supported.
- Existing stores are not automatically modified.
- Legacy applications without a category require admin entry during setup.
- Do not alter unrelated working-tree changes.

---

## File Structure

- `src/lib/partnerApplicationStore.ts`: Pure mapping from an application record and setup overrides into store defaults.
- `src/lib/partnerApplicationStore.test.ts`: Regression coverage for fields that must survive approval.
- `src/lib/partnerApplication.ts`: Typed public submission contract.
- `src/components/PartnerApplicationModal.tsx`: Required category input in the public application UI.
- `supabase/functions/partner-application/index.ts`: Server-side category validation and persistence.
- `src/pages/admin/AdminApplications.tsx`: Category review, search, editable setup state, and store-creation wiring.

### Task 1: Protect the application-to-store mapping

**Files:**
- Create: `src/lib/partnerApplicationStore.ts`
- Test: `src/lib/partnerApplicationStore.test.ts`

**Interfaces:**
- Consumes: `PartnerApplicationStoreSource` with application fields and optional setup overrides.
- Produces: `getPartnerApplicationStoreDefaults(source, overrides?)`, returning the store fields consumed by `create_store`.

- [ ] **Step 1: Write the failing mapping test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { getPartnerApplicationStoreDefaults } from "./partnerApplicationStore.ts";

test("carries the application category into the approved store defaults", () => {
  assert.deepEqual(
    getPartnerApplicationStoreDefaults({
      businessName: "My Coffee Shop",
      category: "Coffee",
      description: "Neighborhood coffee and pastries.",
      address: "Tagum City",
      coordinates: [7.4478, 125.8078],
      logoUrl: "https://example.com/logo.png",
      businessWebsiteUrl: "https://example.com",
      businessFacebookUrl: "https://facebook.com/example",
    }),
    {
      name: "My Coffee Shop",
      businessName: "My Coffee Shop",
      category: "Coffee",
      description: "Neighborhood coffee and pastries.",
      location: "Tagum City",
      address: "Tagum City",
      lat: 7.4478,
      lng: 125.8078,
      logoUrl: "https://example.com/logo.png",
      website: "https://example.com",
      businessFacebookUrl: "https://facebook.com/example",
    },
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test --experimental-strip-types src/lib/partnerApplicationStore.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `partnerApplicationStore.ts`.

- [ ] **Step 3: Implement the pure mapping helper**

```ts
export type PartnerApplicationStoreSource = {
  businessName?: string;
  category?: string;
  description?: string;
  address?: string;
  coordinates?: unknown;
  logoUrl?: string;
  businessWebsiteUrl?: string;
  businessFacebookUrl?: string;
};

export type PartnerApplicationStoreOverrides = {
  name?: string;
  category?: string;
  address?: string;
  coordinates?: [number, number] | null;
  logoUrl?: string;
};

const getCoordinates = (value: unknown): [number, number] | null => {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const coordinates = value.map(Number);
  return coordinates.every(Number.isFinite)
    ? [coordinates[0], coordinates[1]]
    : null;
};

export const getPartnerApplicationStoreDefaults = (
  source: PartnerApplicationStoreSource,
  overrides: PartnerApplicationStoreOverrides = {},
) => {
  const name = String(overrides.name ?? source.businessName ?? "").trim();
  const address = String(overrides.address ?? source.address ?? "").trim();
  const category = String(overrides.category ?? source.category ?? "").trim();
  const coordinates = overrides.coordinates === undefined
    ? getCoordinates(source.coordinates)
    : overrides.coordinates;

  return {
    name,
    businessName: name,
    category,
    description: String(source.description ?? "").trim(),
    location: address,
    address,
    ...(coordinates ? { lat: coordinates[0], lng: coordinates[1] } : {}),
    logoUrl: String(overrides.logoUrl ?? source.logoUrl ?? "").trim(),
    website: String(source.businessWebsiteUrl ?? "").trim(),
    businessFacebookUrl: String(source.businessFacebookUrl ?? "").trim(),
  };
};
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
node --test --experimental-strip-types src/lib/partnerApplicationStore.test.ts
```

Expected: one passing test and zero failures.

- [ ] **Step 5: Commit the mapping boundary**

```powershell
git add -- src/lib/partnerApplicationStore.ts src/lib/partnerApplicationStore.test.ts
git commit -m "test: protect partner application store mapping"
```

### Task 2: Wire category through submission, review, and approval

**Files:**
- Modify: `src/lib/partnerApplication.ts`
- Modify: `src/components/PartnerApplicationModal.tsx`
- Modify: `supabase/functions/partner-application/index.ts`
- Modify: `src/pages/admin/AdminApplications.tsx`
- Modify: `src/lib/partnerApplicationStore.test.ts`

**Interfaces:**
- Consumes: `getPartnerApplicationStoreDefaults(source, overrides?)` from Task 1.
- Produces: A required public `category` application field and a required editable admin setup field that is included in `create_store`.

- [ ] **Step 1: Extend the regression test for editable legacy setup**

Add:

```ts
test("uses admin setup overrides for legacy applications", () => {
  const result = getPartnerApplicationStoreDefaults(
    {
      businessName: "Legacy Shop",
      description: "Imported application",
      address: "Old address",
    },
    {
      name: "Legacy Shop Main",
      category: "Retail",
      address: "New address",
      coordinates: [7.5, 125.8],
      logoUrl: "https://example.com/new-logo.png",
    },
  );

  assert.equal(result.name, "Legacy Shop Main");
  assert.equal(result.businessName, "Legacy Shop Main");
  assert.equal(result.category, "Retail");
  assert.equal(result.address, "New address");
  assert.equal(result.location, "New address");
  assert.equal(result.lat, 7.5);
  assert.equal(result.lng, 125.8);
  assert.equal(result.logoUrl, "https://example.com/new-logo.png");
});
```

- [ ] **Step 2: Run the focused test**

Run:

```powershell
node --test --experimental-strip-types src/lib/partnerApplicationStore.test.ts
```

Expected: both tests pass because Task 1 already supports overrides; this characterizes the API that the UI will now consume.

- [ ] **Step 3: Add category to the public typed request**

In `PartnerApplicationInput`, add:

```ts
category: string;
```

- [ ] **Step 4: Add the required category entry to the application modal**

Import `CategoryInput` and `FEATURED_STORE_CATEGORIES`, add:

```ts
const [category, setCategory] = useState("");
```

Reset it in `resetForm`, include it in `submitPartnerApplication`, and render after Business Name:

```tsx
<div className="space-y-1 text-left">
  <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Business Category</label>
  <CategoryInput
    required
    value={category}
    onChange={setCategory}
    suggestions={FEATURED_STORE_CATEGORIES}
    placeholder="Coffee, Bakery, Retail..."
    className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white"
  />
</div>
```

- [ ] **Step 5: Validate and persist category in the public Edge Function**

Near the other cleaned fields:

```ts
const category = cleanText(body.category, 120);
```

Add `!category` to the required-field guard and add `category` to
`applicationData`.

- [ ] **Step 6: Add editable category state to application processing**

In `AdminApplications`, import `CategoryInput`,
`FEATURED_STORE_CATEGORIES`, and `getPartnerApplicationStoreDefaults`.
Add:

```ts
const [storeCategory, setStoreCategory] = useState("");
```

Set it in `handleApproveApplication`:

```ts
setStoreCategory(String(app.category || ""));
```

Render a required `CategoryInput` after Store Name in the New Store Setup
modal using `FEATURED_STORE_CATEGORIES`.

- [ ] **Step 7: Use the tested mapping in the approval request**

Before invoking the admin backend:

```ts
const storeDefaults = getPartnerApplicationStoreDefaults(
  selectedApplication || {},
  {
    name: storeName,
    category: storeCategory,
    address: storeLocation,
    coordinates: storeCoordinates,
    logoUrl,
  },
);
```

Replace the manually repeated name/location/address/coordinate/logo/business
link fields with:

```ts
store: {
  ...storeDefaults,
  status: "active",
  subscriptionLevel: subLevel,
  owedAmount: selectedOwedAmount,
  subscriptionDependencies: selectedSubscriptionDependencies,
  branchLimit: selectedBranchLimit,
  subscriptionStart: dateInputToDate(subStart),
  subscriptionEnd: dateInputToDate(subEnd),
  paymentSchedule,
  billingIntervalDays,
  ...(payMongoDefaultsEnabled ? { subscriptionAccess: PAYMONGO_STANDARD_ACCESS } : {}),
},
```

- [ ] **Step 8: Expose category during admin review and search**

Add `app.category` to `filteredApplications` search values. In the application
detail Business section, render:

```tsx
<p className="mt-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
  {detailApplication.category || "Category not supplied"}
</p>
```

- [ ] **Step 9: Run focused tests and TypeScript validation**

Run:

```powershell
node --test --experimental-strip-types src/lib/partnerApplicationStore.test.ts
npm run lint
```

Expected: two passing tests; TypeScript exits with code 0.

- [ ] **Step 10: Run the production build**

Run:

```powershell
npm run build
```

Expected: Vite, SEO generation, and service-worker generation all exit with
code 0.

- [ ] **Step 11: Review the scoped diff**

Run:

```powershell
git diff --check
git diff -- src/lib/partnerApplication.ts src/components/PartnerApplicationModal.tsx supabase/functions/partner-application/index.ts src/pages/admin/AdminApplications.tsx src/lib/partnerApplicationStore.ts src/lib/partnerApplicationStore.test.ts
```

Expected: no whitespace errors and only the approved category wiring.

- [ ] **Step 12: Commit the end-to-end wiring**

```powershell
git add -- src/lib/partnerApplication.ts src/components/PartnerApplicationModal.tsx supabase/functions/partner-application/index.ts src/pages/admin/AdminApplications.tsx src/lib/partnerApplicationStore.test.ts
git commit -m "fix: preserve partner application categories"
```
