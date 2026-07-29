# Customer Ticket Store Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the expanded My Tickets list with a store directory and dedicated, chronological per-store ticket routes.

**Architecture:** Normalize scan rows into a typed ticket model, then use pure helpers to merge authoritative store metadata, group tickets by canonical store identity, filter summaries, and sort ticket histories. `CustomerTickets` loads the existing Supabase rows and store documents once, then renders either the directory or one safe group based on `useParams`; `CustomerDashboard` exposes both routes.

**Tech Stack:** React 19, React Router 7, TypeScript 5.8, Supabase JS 2, existing data-compatibility layer, Tailwind CSS 4, Vitest, Testing Library.

## Global Constraints

- Preserve the existing referral-ticket attribution behavior and copy.
- Preserve realtime insert refresh, five-second polling, manual refresh, dark mode, and responsive layout.
- Use canonical `storeId` when present; only legacy records may use a deterministic normalized store-name key.
- Never expose tickets belonging to a different store when a route key is invalid.
- Do not add a database migration.

---

### Task 1: Pure ticket directory model

**Files:**
- Create: `src/lib/customerTicketStores.ts`
- Create: `src/lib/customerTicketStores.test.ts`

**Interfaces:**
- Consumes: normalized tickets and store metadata from the page.
- Produces: `CustomerTicket`, `TicketStoreMetadata`, `TicketStoreGroup`, `buildTicketStoreGroups`, `filterTicketStores`, `filterStoreTickets`, and `getTicketStoreGroup`.

- [ ] **Step 1: Write failing grouping and sorting tests**

Cover canonical grouping, same-name stores with different IDs, metadata override/logo, deterministic legacy keys, chronological tie-breaking, safe selected-store lookup, directory search, and ticket search.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- src/lib/customerTicketStores.test.ts`

Expected: FAIL because `customerTicketStores.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure model**

Define:

```ts
export type CustomerTicket = {
  id: string;
  ticketNumber: string;
  type: string;
  status: string;
  storeId: string;
  storeName: string;
  staffName: string;
  promotionId: string;
  promotionTitle: string | null;
  points: number;
  issuedAt: string;
};

export type TicketStoreGroup = {
  key: string;
  storeId: string;
  storeName: string;
  logoUrl: string;
  latestIssuedAt: string;
  tickets: CustomerTicket[];
};
```

Implement legacy keys as `legacy-${normalized-name}`, stable ticket ordering by timestamp then ticket ID, metadata lookup by store ID, and exact group lookup by route key.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm.cmd test -- src/lib/customerTicketStores.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the pure model**

```bash
git add src/lib/customerTicketStores.ts src/lib/customerTicketStores.test.ts
git commit -m "feat: model customer ticket stores"
```

### Task 2: Store-first My Tickets page

**Files:**
- Modify: `src/pages/customer/CustomerTickets.tsx`
- Modify: `src/pages/customer/CustomerTickets.test.tsx`

**Interfaces:**
- Consumes: Task 1 helpers, `useParams`, `Link`, `doc/getDoc` from the compatibility layer, store images through `getDisplayImageUrl`.
- Produces: store directory at the base route and filtered chronological ticket history at the store route.

- [ ] **Step 1: Extend the component tests before production edits**

Keep the referral attribution test and add route tests that assert:

```tsx
renderTicketsRoute("/customer/tickets");
await screen.findByRole("link", { name: /open perk store ticket history/i });
expect(screen.queryByText("TKT-SCAN")).not.toBeInTheDocument();

renderTicketsRoute("/customer/tickets/store-1");
await screen.findByText("TKT-SCAN");
screen.getByText("General loyalty credit");
screen.getByText("Testing the Promotion");
```

Also assert an invalid route does not expose any ticket numbers.

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm.cmd test -- src/pages/customer/CustomerTickets.test.tsx`

Expected: FAIL because tickets are still expanded on the directory and the detail route is not implemented.

- [ ] **Step 3: Refactor the page to use the pure model**

Normalize `storeId`, `promotionId`, `type`, and existing fields from every row. Load authoritative store `name` and `logoUrl` through `getDoc(doc(db, "stores", storeId))`, falling back safely when metadata fails.

Render directory tiles as links to `/customer/tickets/${encodeURIComponent(group.key)}`. Render only the exact selected group on a detail route, with Back to stores, store identity, ticket count/date span, search, date filters, and chronological sort. Label promotion tickets with `Promotion credited` plus title; use `General loyalty credit` when no promotion title exists. Preserve the existing referral source panel.

- [ ] **Step 4: Run component and helper tests and verify GREEN**

Run: `npm.cmd test -- src/pages/customer/CustomerTickets.test.tsx src/lib/customerTicketStores.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the page**

```bash
git add src/pages/customer/CustomerTickets.tsx src/pages/customer/CustomerTickets.test.tsx
git commit -m "feat: add store-first customer tickets"
```

### Task 3: Route integration and complete verification

**Files:**
- Modify: `src/pages/CustomerDashboard.tsx`

**Interfaces:**
- Consumes: `CustomerTickets`.
- Produces: `/customer/tickets/:storeId` route while preserving the existing base route and active navigation state.

- [ ] **Step 1: Add the detail route**

Add:

```tsx
<Route path="/tickets/:storeId" element={<CustomerTickets />} />
```

Keep `/tickets` intact and update the Suspense fallback match so nested ticket routes still use the Tickets skeleton.

- [ ] **Step 2: Run focused tests**

Run: `npm.cmd test -- src/pages/customer/CustomerTickets.test.tsx src/lib/customerTicketStores.test.ts`

Expected: PASS.

- [ ] **Step 3: Run TypeScript and the full test suite**

Run: `npm.cmd run lint`

Expected: exit 0.

Run: `npm.cmd test`

Expected: all tests pass.

- [ ] **Step 4: Run the production build**

Run: `npm.cmd run -s build`

Expected: exit 0.

- [ ] **Step 5: Review the final diff and commit route integration**

```bash
git diff --check
git status --short
git add src/pages/CustomerDashboard.tsx
git commit -m "feat: route customer ticket histories"
```
