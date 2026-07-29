# Customer Promotions Store Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a routed store directory for customer promotions and a store-specific page with active and archived promotion sections that open the existing details modal.

**Architecture:** Extract promotion grouping, lifecycle classification, directory filtering, and route isolation into a pure tested model. Keep data loading and presentation in `CustomerPromotions.tsx`, use the optional route parameter to select a store, and preserve the existing promotion views and modal.

**Tech Stack:** React 19, React Router 7, TypeScript 5.8, Tailwind CSS 4, Vitest 3, Supabase-backed `dataCompat`.

## Global Constraints

- `/customer/promotions` is the store directory and `/customer/promotions/:storeId` is the selected store page.
- Only stores with at least one loaded promotion appear.
- Store detail sections are ordered `Active promotions`, then `Archived & unavailable`.
- Every non-active lifecycle remains visible and retains its precise existing status badge.
- Promotion selection opens the existing details modal.
- No database or backend changes.

---

### Task 1: Tested Store Promotion Model

**Files:**
- Create: `src/lib/customerPromotionStores.test.ts`
- Create: `src/lib/customerPromotionStores.ts`

**Interfaces:**
- Consumes: loaded promotion view models containing `storeId`, `store`, lifecycle fields, and claim counts.
- Produces: `getCustomerPromotionSection`, `buildCustomerPromotionStores`, `filterCustomerPromotionStores`, and `getStorePromotionGroups`.

- [ ] **Step 1: Write failing tests**

Cover duplicate store grouping with literal active/archive counts, store-name/category filtering, ended/discontinued/fully-claimed classification, active-first section order, and strict store-ID isolation.

- [ ] **Step 2: Verify RED**

Run `npm.cmd test -- src/lib/customerPromotionStores.test.ts`.

Expected: FAIL because `customerPromotionStores.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure model**

Use Philippine date parsing for start/end boundaries, `getRemainingPromotionClaims` for availability, canonical string IDs, and alphabetical store/promotion ordering.

- [ ] **Step 4: Verify GREEN**

Run `npm.cmd test -- src/lib/customerPromotionStores.test.ts`.

Expected: PASS.

### Task 2: Routed Store-First Promotions UI

**Files:**
- Modify: `src/pages/CustomerDashboard.tsx`
- Modify: `src/pages/customer/CustomerPromotions.tsx`
- Test: `src/lib/customerPromotionStores.test.ts`

**Interfaces:**
- Consumes: Task 1 model functions.
- Produces: the store directory, invalid-route state, store-specific promotion sections, and unchanged promotion-details modal behavior.

- [ ] **Step 1: Register `/promotions/:storeId`**

Add the optional detail route beside the existing promotions route.

- [ ] **Step 2: Build directory and selected-store view models**

Read `storeId` with `useParams`, build summaries with `buildCustomerPromotionStores`, filter the directory on the root route, and obtain only the selected store's section groups on the detail route.

- [ ] **Step 3: Render the store directory**

Render semantic links with logo fallback, store identity, active count, archived/unavailable count, total count, search, empty results, and store-based pagination.

- [ ] **Step 4: Render the selected store page**

Render a back link, store header, store-specific search, existing view selector, ordered sections, promotion-based pagination, invalid-route state, and the existing details modal.

- [ ] **Step 5: Run focused tests and TypeScript**

Run `npm.cmd test -- src/lib/customerPromotionStores.test.ts` and `npm.cmd run lint`.

Expected: PASS.

### Task 3: Full Verification

**Files:**
- Verify: all changed feature and documentation files.

**Interfaces:**
- Consumes: the completed implementation.
- Produces: fresh passing evidence.

- [ ] **Step 1: Run `npm.cmd test`**

Expected: all Vitest tests pass.

- [ ] **Step 2: Run `npm.cmd run lint`**

Expected: TypeScript exits successfully.

- [ ] **Step 3: Run `npm.cmd run -s build`**

Expected: Vite produces the production bundle.

- [ ] **Step 4: Run `git diff --check` and inspect `git status --short`**

Expected: no whitespace errors and unrelated pre-existing work remains untouched.
