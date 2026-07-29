# Subscription Upgrade Confirmation Timeout Repair

## Goal

Make store-owner subscription upgrade confirmation finish promptly and preserve
the existing stale-quote safety check.

## Root cause

PostgreSQL stores `settings.updated_at` with microsecond precision. The Edge
Function converts that value through JavaScript `Date`, which serializes only
millisecond precision. A catalog timestamp such as
`2026-07-29T06:57:31.544001+00:00` therefore reaches
`confirm_subscription_upgrade` as `2026-07-29T06:57:31.544Z`.

The database compares those timestamps exactly and rejects the confirmation as
stale. It currently raises SQLSTATE `40001`, which means serialization failure
and is intended for retryable transaction conflicts. Treating an expected
business-state rejection as retryable causes the request to repeat or wait
until the Edge Function returns HTTP 500 after roughly two minutes.

## Repair

1. Compare the stored catalog timestamp and quoted catalog timestamp at
   millisecond precision inside `confirm_subscription_upgrade`. This is the
   precision that survives the Edge Function's JSON/JavaScript boundary.
2. Replace the function's intentionally raised `40001` stale-quote errors with
   a dedicated, non-retryable SQLSTATE.
3. Update `admin-backend` to translate that dedicated code into the existing
   `STALE_UPGRADE_QUOTE` HTTP 409 response.
4. Keep genuine catalog, subscription, invoice, and renewal changes fail-closed;
   only sub-millisecond representation differences are equivalent.

## Data flow and error handling

The quote path continues to sign the normalized timestamp into the quote token.
On confirmation, the Edge Function validates the signed token and reconstructs
the current quote before invoking the database function. The database performs
the final locked validation and insert.

If the catalog differs by at least one millisecond, or another protected
billing value changes, the database returns the dedicated stale-quote code.
`admin-backend` responds immediately with HTTP 409 and the frontend refreshes
the quote. No stale confirmation is inserted.

## Testing

- Add a database regression case proving a catalog timestamp with PostgreSQL
  microseconds matches its JavaScript millisecond representation.
- Add a database regression case proving a material catalog timestamp change
  fails with the dedicated non-retryable code.
- Update Edge Function tests for the stale-code mapping where the handler
  boundary is testable.
- Run the focused Deno and database tests, the application test suite, TypeScript
  checking, and the production build.
- Apply the migration and deploy `admin-backend`.
- Verify production logs no longer show a long-running confirmation and confirm
  that the target store receives exactly one scheduled plan change.

## Scope

This repair does not change upgrade pricing, renewal scheduling, payment
behavior, quote lifetime, or terms. It does not weaken stale-quote protection
and does not modify unrelated advisor findings.
