# PayMongo Payment Link Archival Design

## Goal

Prevent deleted or expired Perk stores from leaving externally payable PayMongo Payment Links behind.

## Scope

This change covers two destructive billing paths:

1. An administrator deletes an entire store group through `delete_store_group`, or deletes the final remaining branch through `delete_store`.
2. The subscription billing worker deletes a store group after its initial subscription invoice has remained unpaid for 15 days and is marked `expired`.

Deleting one branch while another branch survives remains unchanged. Billing records and payment links continue to belong to the surviving primary branch.

This change does not introduce general invoice retention, refunds, a background archival queue, or a new billing table.

## PayMongo Behavior

Perk uses PayMongo Payment Links under `/v1/payment_links`. A link is deactivated by sending:

```http
PATCH /v1/payment_links/{payment_link_id}
Content-Type: application/json

{ "archive": true }
```

An archived link no longer accepts payment. PayMongo does not apply an automatic time-to-live to Payment Links, so Perk must issue this request when a local invoice or store reaches a terminal state.

The existing `completed_sessions.limit` of `1` remains unchanged. It prevents repeat payment after one successful payment but does not replace explicit archival of an unpaid link.

## Architecture

### Shared PayMongo helper

Extend `supabase/functions/_shared/paymongo.ts` with a focused archive operation. The helper:

- accepts a non-empty PayMongo link ID and the secret API key;
- URL-encodes the link ID;
- sends `PATCH /v1/payment_links/{id}` with `{ "archive": true }`;
- treats a successful response whose link state is `archived` as success;
- treats an already archived link as success, making retries safe;
- throws a bounded error for authentication, not-found, malformed-response, and other non-success responses;
- never exposes the secret key in an error or log.

The helper accepts an injectable `fetch` implementation for isolated Deno tests. Production callers use the global `fetch`.

### Archivable invoice selection

Only invoices with a non-empty `paymongo_link_id` and a status other than `paid` require archival. This includes `pending`, `link_created`, `failed`, `expired`, and `void`.

Paid links are not archived as part of store deletion because the completed PayMongo transaction remains authoritative and the existing completed-session restriction already prevents a second successful payment.

Duplicate link IDs are removed before making API calls.

### Administrator deletion

Before the first irreversible local deletion in the `delete_store` or `delete_store_group` handler:

1. Resolve the target store IDs and whether a surviving primary store exists.
2. If a primary store survives, preserve and relink billing exactly as today; do not archive its links.
3. If no primary store survives, read the target stores' invoice status, link ID, and `livemode`.
4. Archive every archivable link.
5. Only after all required links are confirmed archived, continue deleting local store data, invoices, subscriptions, stores, profiles, and managed files.

If any required archive operation fails, the handler returns an error and performs no local deletion. The administrator can retry the same deletion safely.

### Expired initial-payment cleanup

The existing database function marks an overdue initial invoice `expired` and advances `next_attempt_at` by one hour. The billing worker then attempts account cleanup.

Before deleting any local data, `deleteExpiredInitialAccount` reads the expired invoice's PayMongo link details and archives the link. If archival fails:

- account cleanup stops before local deletion;
- the worker records the failure in its existing result and logs;
- the invoice and subscription remain available;
- the existing hourly `next_attempt_at` behavior makes the account eligible for a later retry.

No new Cron job or migration is required.

## Mode Safety

PayMongo API keys operate in either test or live mode.

- A test-mode link encountered while the worker is configured for live mode may be skipped because it cannot collect real money.
- A live-mode link must never be skipped. If the configured key cannot archive it, deletion fails closed.
- In test mode, encountering a live link is a configuration error and blocks deletion.

The decision uses the persisted invoice `livemode` value and the validated `PAYMONGO_MODE` environment variable.

## Failure and Consistency Model

External PayMongo state and Supabase data cannot be changed in one database transaction. The workflow therefore uses an archive-first, delete-second sequence:

```text
read invoices -> archive external links -> delete local records
```

This sequence intentionally prefers a harmless archived link with temporarily retained local data over an active payable link whose local invoice has disappeared.

Partial external success is safe. If three links are being archived and the third request fails, the first two stay archived while all local records remain. Retrying archives the remaining link; already archived links succeed idempotently.

## Testing

Add Deno tests for the shared helper and invoice-selection policy:

- sends the documented PATCH request and archive body;
- URL-encodes the link ID;
- accepts an archived response;
- accepts an already archived response on retry;
- rejects an active or malformed success response;
- reports a bounded PayMongo error on non-success responses;
- selects every unpaid linked invoice;
- excludes paid invoices and rows without link IDs;
- deduplicates repeated link IDs;
- skips only safe test-mode links in live mode;
- blocks live-mode links when the configured credentials cannot archive them.

Verify both callers with focused tests or testable extracted orchestration:

- store-group deletion does not begin local deletion until archival succeeds;
- branch deletion with a surviving primary does not archive transferred billing;
- expired initial-account cleanup stops before local deletion when archival fails;
- successful archival allows the existing deletion flow to continue.

Run Deno tests, TypeScript checks, the existing application test suite relevant to billing, and formatting/diff checks before completion.

## Rollout and Operations

Deploy the shared module together with both dependent Edge Functions:

- `admin-backend`
- `subscription-billing-worker`

No database migration is required. After deployment:

1. Exercise the flow with test-mode Payment Links.
2. Confirm deletion archives the link in PayMongo before local rows disappear.
3. Confirm an archived checkout URL no longer accepts payment.
4. Review Edge Function logs for archive failures.

Production deployment is outside the local implementation step unless explicitly requested.
