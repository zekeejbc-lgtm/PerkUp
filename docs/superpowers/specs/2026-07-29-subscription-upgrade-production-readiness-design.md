# Subscription Upgrade Production Readiness Design

## Goal

Make subscription upgrades safe to enable in the development Supabase project
through an auditor-controlled, fail-closed runtime switch. Close the known quote
expiration and confirmation race gaps without changing the existing PayMongo
renewal mechanism.

## Scope

This hardening applies to:

- runtime enablement and rollback;
- authoritative upgrade quotes;
- quote expiration and tamper resistance;
- atomic confirmation;
- owner and auditor user interfaces;
- database authorization, concurrency, and audit records;
- automated and hosted verification.

It does not add downgrades, proration, immediate charges, replacement invoices,
new payment paths, or automatic activation before payment.

## Runtime Control

`public.system_runtime_config` gains:

- `subscription_upgrades_enabled boolean not null default false`;
- `subscription_upgrades_changed_at timestamptz`;
- `subscription_upgrades_changed_by uuid references auth.users(id)`.

The migration explicitly preserves `false` for existing deployments. The
browser build-time flag and Edge Function environment flag cease to be
authoritative.

Only an active auditor may change the switch. The protected
`admin-backend` action requires:

- the auditor role from the server-side user record;
- a fresh MFA-qualified session under the existing privileged-operation rules;
- the auditor's current password;
- the exact phrase `ENABLE SUBSCRIPTION UPGRADES` or
  `DISABLE SUBSCRIPTION UPGRADES`;
- the requested boolean state.

The action updates the singleton runtime row and appends an audit event in the
same request. It returns the stored state and change metadata. Store owners
cannot call the action or update the runtime table directly.

The Runtime Modes page shows an auditor-only Subscription Upgrades control with
the current state, a concise risk summary, the last-change timestamp, and a
password-and-phrase confirmation dialog.

## Disabled-State and Rollback Semantics

Disabling is fail-closed for new commercial decisions:

- no new upgrade options are offered;
- new quote requests are rejected;
- new confirmations are rejected, including confirmations using a previously
  issued token;
- direct invocation of the database confirmation RPC is rejected.

Disabling does not orphan existing financial state:

- scheduled upgrades remain readable;
- owners may cancel a still-scheduled, unattached upgrade;
- auditors may cancel through the existing reasoned administrative action;
- locked upgrade invoices continue through payment, webhook, reconciliation,
  manual fulfillment, receipt, and plan application;
- workers and triggers never depend on the switch once an invoice is locked.

The store-owner page always asks the backend for upgrade state. When disabled,
it hides plan choices, shows a neutral unavailable message, and continues to
show any existing scheduled or locked change with only the actions that remain
valid.

## Signed Quote Contract

The Edge Function uses a dedicated
`SUBSCRIPTION_UPGRADE_QUOTE_SECRET`, stored as a Supabase Edge Function secret.
It is never returned or exposed to the frontend.

The quote response includes an opaque `quoteToken`. The token contains a
canonical payload and an HMAC-SHA-256 signature. The payload binds:

- token version;
- owner user ID;
- store ID;
- subscription ID;
- current and target plan IDs;
- current and target amounts in integer centavos;
- target period start and end;
- current renewal invoice ID and status, when present;
- renewal mode;
- terms version;
- plan-catalog `updated_at`;
- material quote fingerprint;
- issued-at timestamp;
- expiration timestamp.

The token expires exactly 15 minutes after issue. Verification uses a
constant-time signature comparison where the runtime permits it. Confirmation
rejects:

- malformed tokens;
- invalid signatures;
- expired or future-issued tokens;
- another owner's or store's token;
- a target-plan mismatch;
- a terms-version mismatch;
- a material fingerprint mismatch;
- changed catalog, subscription, invoice, or renewal state.

The existing `quotedAt`, `expiresAt`, and `quoteFingerprint` fields remain for
display, state comparison, and compatibility, but only the signed token makes
their lifetime authoritative.

## Atomic Confirmation

The confirmation Edge action:

1. authenticates the store owner and primary-store scope;
2. rejects confirmation when the runtime switch is off;
3. verifies the signed token and its expiration;
4. reloads authoritative billing and catalog state;
5. rebuilds the material quote and compares it with the token;
6. calls the protected database RPC with the authoritative snapshots and the
   token-bound catalog and invoice expectations.

The database RPC performs a single transaction that:

1. locks the singleton runtime configuration row and requires the switch to be
   on;
2. locks and verifies the subscription and primary store;
3. locks the subscription plan-catalog settings row and requires its
   `updated_at` to equal the token-bound value;
4. locks and verifies the active upcoming renewal invoice, including its ID,
   status, and target-period consequence;
5. rejects initial-payment, overdue, frozen, suspended, duplicate, stale,
   lower-tier, incompatible-interval, or non-increasing-price requests;
6. inserts the immutable plan-change decision and notification atomically.

Invoice creation continues to lock a scheduled upgrade only for its exact
target period. Payment application remains idempotent and independent of the
runtime switch.

## Authorization

- The runtime table retains RLS and no direct browser write grants.
- The toggle action is auditor-only at the Edge Function.
- Upgrade quote and confirmation actions remain store-owner-only.
- The confirmation and cancellation RPCs remain revoked from `PUBLIC`, `anon`,
  and `authenticated`, and executable only by `service_role`.
- New database functions use an empty `search_path` and schema-qualified
  objects.
- The service-role key and quote-signing secret never enter frontend code or
  logs.

## Error Handling

The API uses stable error codes:

- `SUBSCRIPTION_UPGRADES_DISABLED`;
- `INVALID_UPGRADE_QUOTE`;
- `EXPIRED_UPGRADE_QUOTE`;
- `STALE_UPGRADE_QUOTE`;
- `UPGRADE_ALREADY_SCHEDULED`.

An expired or stale quote leaves the modal open, clears acknowledgement,
requests a new quote, and requires the owner to review the terms again.
Unexpected database errors roll back the entire confirmation operation and are
reported through the existing client-error path without exposing secrets or
raw database details.

## Testing

### Unit and UI

- signed token round-trip succeeds;
- token tampering, wrong secret, wrong owner/store/target, future issue time,
  and expiration fail;
- changing every material quote field invalidates confirmation;
- auditor toggle requires the exact role, password, and phrase;
- admin, assistant-admin, store-owner, staff, and customer roles cannot toggle;
- disabled owner UI hides plan selection but preserves pending-change display
  and cancellability;
- stale and expired quote responses reset terms acceptance;
- double submission creates one change.

### Database

The pgTAP suite covers:

- disabled-by-default migration state;
- service-role-only RPC execution;
- RLS protection;
- runtime, catalog, subscription, and invoice locking;
- stale catalog and changed invoice rejection;
- duplicate confirmation;
- scheduled cancellation while disabled;
- exact-period invoice attachment;
- ordinary renewal regression with no upgrade;
- automatic and manual renewal;
- paid-invoice application and duplicate fulfillment idempotency;
- failed, void, expired, mismatched, and unpaid invoices do not apply an
  upgrade.

Tests run transactionally against the linked development project because the
local machine has no Docker runtime.

### Release Verification

Before enabling:

1. run focused tests in red-green TDD order;
2. run the full Vitest suite;
3. run TypeScript validation;
4. run the production build;
5. run the linked pgTAP database suite;
6. verify deployed migration and Edge Function versions;
7. run hosted security and performance advisors;
8. query invariants for paid-but-unapplied upgrade invoices, duplicate active
   changes, failed notifications, and invalid runtime metadata;
9. verify an ordinary renewal and upgrade renewal in PayMongo test mode when
   authenticated test-store credentials are available;
10. confirm no Payment Link is created by quote or confirmation.

The switch remains off unless all executable automated and hosted checks pass.
If external PayMongo interaction cannot be completed, the implementation is
reported as deployed but not activated.

## Deployment and Rollback

Deploy in this order:

1. add the disabled runtime column and hardened RPC migration;
2. configure the dedicated signing secret;
3. deploy `admin-backend`;
4. deploy the frontend;
5. run hosted verification;
6. enable only through the auditor control after end-to-end test-mode
   validation.

Rollback immediately disables the switch. New quotes and confirmations stop,
scheduled changes remain cancellable, and locked invoices continue to a
consistent paid or administratively resolved state.
