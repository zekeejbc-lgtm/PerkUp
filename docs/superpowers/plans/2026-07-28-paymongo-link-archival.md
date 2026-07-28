# PayMongo Payment Link Archival Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Archive unpaid PayMongo Payment Links before a store group or expired initial-payment account is deleted.

**Architecture:** A shared, testable PayMongo module selects externally payable invoice links, enforces live/test-mode safety, and archives each link through PayMongo's documented PATCH endpoint. Both destructive Edge Function paths invoke that module before their first local deletion and fail closed on any archive error.

**Tech Stack:** TypeScript, Supabase Edge Functions, PayMongo Payment Links API, Node 22 test runner

## Global Constraints

- Preserve all pre-existing uncommitted changes, including the current Perk branding edits in the three affected Edge Function files.
- Archive external links before any irreversible local deletion.
- Never allow an unarchived live-mode link to be orphaned.
- Do not add a database migration or background queue.
- Do not deploy production Edge Functions without an explicit deployment request.

---

### Task 1: Shared PayMongo archival policy and API helper

**Files:**
- Modify: `supabase/functions/_shared/paymongo.ts`
- Create: `supabase/functions/_shared/paymongo.test.ts`

**Interfaces:**
- Consumes: PayMongo Payment Link API and invoice rows containing `paymongo_link_id`, `status`, and `livemode`.
- Produces: `archivePayMongoInvoiceLinks(invoices, options): Promise<{ archived: number; skippedTest: number }>` and `archivePayMongoPaymentLink(linkId, secretKey, fetcher?): Promise<void>`.

- [ ] **Step 1: Write failing tests for selection, mode safety, and the PATCH contract**

Cover these independently observable behaviors:

```ts
test("archives an unpaid live link with the documented PATCH request", async () => {
  // A complete PayMongo archived response is returned by a boundary fake.
  // Assert the real helper result and inspect the captured HTTP request.
});

test("does not archive paid invoices or rows without link IDs", async () => {
  // Assert zero external requests and a zero archived count.
});

test("deduplicates repeated link IDs", async () => {
  // Assert one archive operation for duplicate invoice rows.
});

test("skips test links while configured live", async () => {
  // Assert no request and skippedTest equals one.
});

test("rejects a live link while configured test", async () => {
  // Assert a configuration-safety error before any request.
});

test("fails closed on PayMongo errors and malformed success responses", async () => {
  // Assert bounded errors and no success result.
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test supabase/functions/_shared/paymongo.test.ts
```

Expected: FAIL because the archival exports do not exist.

- [ ] **Step 3: Implement the minimal shared policy and archive request**

Add:

```ts
export type PayMongoMode = "test" | "live";

export type PayMongoInvoiceLink = {
  paymongo_link_id?: string | null;
  status?: string | null;
  livemode?: boolean | null;
};

export async function archivePayMongoPaymentLink(
  linkId: string,
  secretKey: string,
  fetcher: typeof fetch = fetch,
): Promise<void>;

export async function archivePayMongoInvoiceLinks(
  invoices: PayMongoInvoiceLink[],
  options: {
    mode: PayMongoMode;
    secretKey?: string;
    fetcher?: typeof fetch;
  },
): Promise<{ archived: number; skippedTest: number }>;
```

The archive request must use `PATCH /v1/payment_links/{encoded-id}`, JSON `{ "archive": true }`, Basic authentication, bounded error details, and an `archived` response-state check.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
node --test supabase/functions/_shared/paymongo.test.ts
```

Expected: all archival helper tests pass.

- [ ] **Step 5: Review the focused diff**

Run:

```powershell
git diff --check -- supabase/functions/_shared/paymongo.ts supabase/functions/_shared/paymongo.test.ts
git diff -- supabase/functions/_shared/paymongo.ts supabase/functions/_shared/paymongo.test.ts
```

Confirm the existing `perk-invoice-*` idempotency key and `Perk` description remain unchanged.

### Task 2: Fail-safe administrator store deletion

**Files:**
- Modify: `supabase/functions/admin-backend/index.ts`

**Interfaces:**
- Consumes: `archivePayMongoInvoiceLinks` from Task 1 and target-store invoice rows.
- Produces: Store-group deletion that makes no local mutation until every externally payable link is archived.

- [ ] **Step 1: Add the shared helper import and invoice-link preflight**

Immediately after target stores and the possible surviving primary are resolved:

```ts
if (!primaryStoreId) {
  const { data: invoiceLinks, error: invoiceLinksError } = await admin
    .from("billing_invoices")
    .select("paymongo_link_id,status,livemode")
    .in("store_id", storeIds)
    .not("paymongo_link_id", "is", null);
  if (invoiceLinksError) throw invoiceLinksError;

  const mode = (Deno.env.get("PAYMONGO_MODE") || "test").toLowerCase();
  if (mode !== "test" && mode !== "live") {
    throw new Error("PAYMONGO_MODE must be test or live.");
  }
  await archivePayMongoInvoiceLinks(invoiceLinks || [], {
    mode,
    secretKey: Deno.env.get("PAYMONGO_SECRET_KEY") || "",
  });
}
```

The preflight must remain before staff, file, asset, invoice, subscription, store, profile, and Auth deletions. A surviving primary branch skips archival because billing is transferred.

- [ ] **Step 2: Run the shared tests and the auditor boundary check**

Run:

```powershell
node --test supabase/functions/_shared/paymongo.test.ts
npm run test:auditor
```

Expected: both commands exit successfully.

- [ ] **Step 3: Inspect ordering and preserved user edits**

Run:

```powershell
git diff --check -- supabase/functions/admin-backend/index.ts
git diff -- supabase/functions/admin-backend/index.ts
```

Confirm archival occurs before the first `.delete()` in the handler and existing Perk branding changes remain.

### Task 3: Fail-safe expired initial-payment cleanup

**Files:**
- Modify: `supabase/functions/subscription-billing-worker/index.ts`

**Interfaces:**
- Consumes: `archivePayMongoInvoiceLinks`, the worker's validated `PAYMONGO_MODE`, and the expired initial invoice row.
- Produces: Hourly-retryable account cleanup that stops before local deletion when archival fails.

- [ ] **Step 1: Pass billing mode into expired-account cleanup**

Import the shared helper, add a `mode: "test" | "live"` argument to `deleteExpiredInitialAccount`, and pass the already validated worker mode from the caller.

- [ ] **Step 2: Archive the expired invoice before cleanup**

Extend the invoice select to include:

```text
id,paymongo_link_id,status,livemode
```

Then invoke:

```ts
await archivePayMongoInvoiceLinks([unpaidInvoice], {
  mode,
  secretKey: Deno.env.get("PAYMONGO_SECRET_KEY") || "",
});
```

Place this call before reading/deleting staff, files, assets, invoices, subscriptions, stores, Auth accounts, or profiles. The existing database `next_attempt_at` value provides the one-hour retry.

- [ ] **Step 3: Run focused and project verification**

Run:

```powershell
node --test supabase/functions/_shared/paymongo.test.ts
npm run lint
npm run test:auditor
npm run build
```

Expected: all commands exit successfully with zero test failures and zero TypeScript/build errors.

- [ ] **Step 4: Run final diff and requirement checks**

Run:

```powershell
git diff --check
git status --short
git diff -- supabase/functions/_shared/paymongo.ts supabase/functions/_shared/paymongo.test.ts supabase/functions/admin-backend/index.ts supabase/functions/subscription-billing-worker/index.ts
```

Confirm:

- unpaid live links are archived before local deletion;
- any PayMongo failure blocks local deletion;
- paid or absent links require no archive request;
- test links can be skipped only in live mode;
- branch deletion with a surviving primary preserves billing;
- expired-account failures remain eligible for the existing hourly retry;
- no unrelated user changes were reverted or staged.
