# PerkUp PayMongo QR Ph Subscription Billing Plan

## Recommendation

Use Supabase as the billing backend:

- Supabase Cron starts an idempotent billing worker.
- A private Supabase Edge Function creates one PayMongo Payment Link per billing cycle.
- The existing Google Apps Script email service sends the link and retries failed notifications.
- A public Supabase Edge Function receives `link.payment.paid`, verifies PayMongo's signature against the raw body, and extends access by 30 days.
- A reconciliation pass checks unresolved links so a temporary webhook outage cannot leave a paid account frozen.

This is safer than putting the cron job in Vercel because the subscription state, row locking, RLS, audit trail, and scheduled job history remain next to the database. Vercel remains the frontend host.

## Implementation status — July 22, 2026

- Billing schema, RLS, invoice claiming, notification audit, and atomic fulfillment are live on `perkupshop`.
- `subscription-billing-worker`, `paymongo-webhook`, and the updated admin backend are deployed.
- PayMongo test secrets are stored only in Supabase; the public key is intentionally unused by this server-created Links flow.
- Test webhook `link.payment.paid` is enabled and its signing secret is stored in Supabase.
- Supabase Cron runs the worker hourly at minute 5; a live invocation returned HTTP 200.
- A PayMongo test Link smoke test returned an unpaid `/test/` checkout URL with the expected amount, currency, and reference number.
- The admin enrollment control and owner billing history/payment-page UI are live on `https://www.perktoday.com`.
- The Google Apps Script billing email route is deployed on the existing protected PerkUp endpoint. A test-mode billing email was successfully sent through that route after deployment.

## Important PayMongo limitation

The integration can be built and tested now with test keys. It cannot collect real payments until the PayMongo account is activated.

PayMongo's current Payment Links documentation says:

- Payment Links support hosted payment methods including QR Ph.
- Test Payment Links can be created with a secret test key.
- Live Payment Links require an activated merchant account and closed-loop wallet, which is activated after KYC.
- The Payment Links create request does not force a specific payment method. QR Ph appears on the hosted page when it is enabled for the merchant account.

Therefore:

1. Build and validate the complete flow in `test` mode now.
2. Keep production billing automation disabled while only test keys are configured.
3. Enable live collection only after PayMongo verification, live QR Ph capability, live keys, and a live webhook have been confirmed.

The supplied keys must never be committed. The secret key belongs only in Supabase Edge Function secrets. The public key is not required for the server-created Payment Links flow.

## Current PerkUp state

Verified against the linked `perkupshop` Supabase project on July 22, 2026:

- Project ref: `fstwqgnonsqcqewiipqq`.
- `pg_cron` is installed and already runs one unrelated promotion archival job.
- There is one primary store and its owner record has an email address.
- That store does not yet have `paymentSchedule` or `subscriptionEnd`, so it is not eligible for automated billing yet.
- Subscription plans are stored in `settings/subscriptions`; current prices are PHP 999, PHP 1,999, and PHP 2,999.
- Existing subscription fields live inside `stores.data` JSON. They are useful for display and compatibility, but are not sufficient as a payment ledger.
- The owner UI already has subscription access states (`active`, `warning`, `grace`, and `frozen`) and a payment-link field.
- The existing Google Apps Script endpoint already sends transactional email and is protected by `DRIVE_CRUD_SECRET`.

## Billing policy

Recommended defaults:

- Billing interval: exactly 30 days.
- Warning lead: 7 days before the next billing boundary.
- Link creation: once when the warning period starts, rather than waiting until the account is already due.
- Due reminder: on the billing date if unpaid.
- Grace period: 3 days, configurable per subscription.
- Freeze: after the grace period if the invoice remains unpaid.
- Renewal: a successful payment extends from the current period end when it is still in the future; otherwise it extends from the payment time. This prevents early payment from losing remaining access days.
- Time zone for customer-facing dates: `Asia/Manila`.
- Currency storage: integer centavos; PHP 999 is stored and sent to PayMongo as `99900`.

## Database design

Do not use only mutable fields in `stores.data` as the financial record. Add normalized tables while mirroring the current access fields during the transition.

### `billing_subscriptions`

One row per primary store subscription.

Key fields:

- `id uuid primary key`
- `store_id text unique references public.stores(id)`
- `owner_user_id text references public.users(id)`
- `plan_id text`
- `amount_centavos integer check (amount_centavos >= 100)`
- `currency text check (currency = 'PHP')`
- `interval_days integer default 30 check (interval_days = 30)`
- `current_period_start timestamptz`
- `current_period_end timestamptz`
- `next_billing_at timestamptz`
- `warning_lead_days integer default 7`
- `grace_period_days integer default 3`
- `status text` constrained to `active`, `past_due`, `frozen`, `paused`, or `cancelled`
- `automation_enabled boolean default false`
- timestamps

Indexes:

- A partial due-work index on `(next_billing_at)` where `automation_enabled` and status is billable.
- An index on `owner_user_id` for owner-scoped reads and RLS.

### `billing_invoices`

An immutable cycle-level ledger. One invoice is allowed per subscription period.

Key fields:

- `id uuid primary key`
- `subscription_id uuid references billing_subscriptions(id)`
- `period_start timestamptz`
- `period_end timestamptz`
- `due_at timestamptz`
- `amount_centavos integer`
- `currency text`
- `status text` constrained to `pending`, `link_created`, `sent`, `paid`, `failed`, `expired`, or `void`
- `paymongo_link_id text unique`
- `paymongo_reference_number text unique`
- `payment_url text`
- `paymongo_livemode boolean`
- `link_created_at`, `email_sent_at`, `paid_at`
- `attempt_count`, `next_retry_at`, and a bounded error summary
- timestamps

Constraints and indexes:

- Unique `(subscription_id, period_start)` prevents duplicate monthly invoices.
- A partial work index on `(next_retry_at)` for retryable statuses.
- An index on `subscription_id` because Postgres does not automatically index foreign keys.

### `billing_notifications`

Transactional outbox for payment-link and reminder emails.

- Unique `(invoice_id, notification_type)` prevents duplicate messages.
- Statuses: `pending`, `sending`, `sent`, and `failed`.
- Retry count and next retry timestamp.

### `paymongo_webhook_events`

Private webhook audit and idempotency table.

- `event_id text primary key`
- `event_type text`
- `livemode boolean`
- `payload jsonb` or a minimized redacted payload
- `payload_sha256 text`
- `received_at`, `processed_at`, and processing error

All four tables must have RLS enabled. Owners can read only their own subscription, invoices, and notification status. Browser roles receive no insert/update/delete grants. Only backend service credentials process billing and webhooks.

## Automated flow

### 1. Enrollment and backfill

An admin must explicitly enable automation for a primary store and choose:

- plan
- amount
- subscription start
- current period end / next billing time
- warning and grace periods
- billing email

The migration must not guess missing dates. Existing rows without complete billing configuration remain disabled.

The admin action writes `billing_subscriptions` and mirrors display fields into the primary store's existing `data` JSON so the current frontend continues to work.

### 2. Scheduled billing worker

Create `subscription-billing-worker` as a secret-authenticated Supabase Edge Function.

Schedule it hourly at minute 5. An hourly idempotent worker is safer than a strict equality check at midnight: it still catches a due cycle after an outage, deploy, or missed cron run. It performs only bounded due work, so it remains lightweight.

The worker:

1. Claims eligible subscription cycles atomically using a database function with `FOR UPDATE SKIP LOCKED`.
2. Creates or reuses the unique invoice for the cycle.
3. Calls `POST https://api.paymongo.com/v1/payment_links` using Basic authentication with the secret key as the username and an empty password.
4. Sends amount in centavos, currency `PHP`, a clear description, and string-only metadata containing the invoice ID, subscription ID, and store ID.
5. Sends `Idempotency-Key: <invoice UUID>`. PayMongo retains idempotency results for 24 hours; the database unique constraint remains the long-term duplicate guard.
6. Saves the returned link ID, reference number, mode, and URL before attempting email.
7. Queues a payment-due email. An email failure never creates another PayMongo link.
8. Updates the existing `subscriptionAccess.paymentLink` mirror for the owner portal.

The worker also retries failed link creation and notifications with capped exponential backoff. It processes a bounded batch per run and records errors without leaking keys or raw authorization headers.

### 3. Email delivery

Extend the existing Google Apps Script service with a protected `subscription_payment_due` action and matching email template.

The email includes:

- business and owner name
- plan and exact amount
- due date and grace deadline
- a button opening the PayMongo hosted link
- instruction to choose QR Ph and scan using a participating bank or wallet
- PerkUp support contact
- invoice/reference identifier

The email must not claim payment succeeded. PayMongo's webhook is the source of truth.

### 4. Signed webhook

Create `paymongo-webhook` as a public Edge Function with platform JWT verification disabled because PayMongo does not send a Supabase JWT.

The function must authenticate every request itself:

1. Read the raw request body before JSON parsing.
2. Parse `Paymongo-Signature` into `t`, `te`, and `li`.
3. Compute HMAC-SHA256 over `<timestamp>.<raw body>` using the PayMongo webhook secret.
4. Compare against `te` for test events or `li` for live events using a timing-safe comparison.
5. Reject timestamps outside a small replay window, recommended five minutes.
6. Accept only the expected `link.payment.paid` event.
7. Insert the event ID once. A duplicate event returns success without extending access again.
8. Lock and validate the invoice: link ID/reference, amount, currency, mode, and current status must match.
9. Mark the invoice paid and atomically extend the subscription by 30 days.
10. Set access to active, clear the payment link mirror, and create the next cycle boundary.
11. Return JSON with an HTTP 2xx response within PayMongo's delivery timeout.

Never trust a browser redirect or a client-provided “paid” flag.

### 5. Reconciliation

Webhooks are the primary confirmation mechanism, but PayMongo warns that events missed while an endpoint is unavailable may not always be replayed automatically.

The hourly worker should reconcile unresolved invoices by retrieving their Payment Link details/payments from PayMongo. If PayMongo reports a matching paid transaction, run the same idempotent fulfillment transaction used by the webhook.

### 6. Portal and admin UI

Store owner subscription page:

- current plan and access period
- next billing date and amount
- current invoice status
- safe “Pay with PayMongo / QR Ph” button when a link exists
- paid invoice history and reference numbers
- clear test-mode banner while test keys are active

Admin subscriptions page:

- explicit enrollment/disable control
- current cycle and payment status
- retry link/email controls
- warning/grace configuration
- audit history
- no editable “mark paid” action without a separately logged administrative override

## Secrets and configuration

Supabase Edge Function secrets:

- `PAYMONGO_SECRET_KEY`
- `PAYMONGO_MODE=test|live`
- `PAYMONGO_WEBHOOK_SECRET`
- existing `GAS_EMAIL_URL`
- existing `DRIVE_CRUD_SECRET`
- optional dedicated `BILLING_CRON_SECRET`

Rules:

- Do not add any PayMongo secret to `.env.example` as a real value, Vercel variables, frontend code, database rows, logs, or migrations.
- Do not prefix a secret with `VITE_`.
- Test and live webhook endpoints/secrets are separate.
- Require an explicit `PAYMONGO_MODE` match between key, invoice, and webhook event.
- Since the test secret was shared in chat, rotate it before relying on it for a long-lived shared test environment.

## Implementation phases

### Phase 1 — Schema and safe enrollment

1. Create a migration with the four billing tables, constraints, indexes, RLS, and grants.
2. Add atomic database functions for claiming due work and fulfilling an invoice.
3. Add an admin backend action to enroll/update a subscription.
4. Keep automation disabled for incomplete existing store data.

### Phase 2 — PayMongo test integration

1. Store the test secret using `supabase secrets set`; never write it to a file.
2. Implement `subscription-billing-worker`.
3. Implement and deploy `paymongo-webhook`.
4. Register a test webhook for `link.payment.paid` and store its returned signing secret.
5. Extend and redeploy the Google Apps Script email endpoint.
6. Create the Supabase Cron job only after the worker passes a manual dry run.

### Phase 3 — UI and operations

1. Update owner and admin subscription pages.
2. Add invoice history and test-mode labels.
3. Add structured logs, retry controls, and runbook queries.
4. Run Supabase database/security advisors and fix findings.

### Phase 4 — Test acceptance

The test integration is complete only when all of these pass:

1. A dry run finds no invoice for an unconfigured store.
2. Enrolling a test store creates exactly one cycle invoice.
3. Re-running the worker creates no duplicate invoice or Payment Link.
4. The payment email contains the correct amount, due date, and test URL.
5. The URL contains `/test/` and offers QR Ph when enabled on the test account.
6. A test payment emits `link.payment.paid`.
7. A valid webhook marks one invoice paid and extends access exactly 30 days.
8. Replaying the same webhook does not extend access twice.
9. Invalid signatures, wrong amounts, wrong modes, stale timestamps, and unknown links are rejected and audited.
10. A simulated email failure retries without creating another link.
11. A simulated webhook outage is repaired by reconciliation.
12. Owner A cannot read Owner B's billing rows under RLS.

### Phase 5 — Live readiness gate

Do not enable live automation until:

- PayMongo KYC/merchant activation is complete.
- The closed-loop wallet and QR Ph capability are active.
- Live secret keys are stored in Supabase.
- A separate live webhook and signing secret are configured.
- A low-value live QR Ph payment succeeds end-to-end.
- Test data is excluded from live reports and access extension.
- The admin explicitly enables live billing.

## Rollback

- Disable the billing cron job.
- Set `automation_enabled = false` for all subscriptions.
- Keep the webhook deployed so already-issued links can still be confirmed, or disable the PayMongo endpoint after open invoices are reconciled.
- Preserve invoices and webhook events for audit; do not delete financial history.
- Existing manual subscription access controls remain available during rollback.

## Official references

- [PayMongo Payment Links](https://docs.paymongo.com/docs/payment-channels-payment-links)
- [PayMongo Create Payment Link API](https://docs.paymongo.com/reference/post_v1-payment-links)
- [PayMongo test mode](https://docs.paymongo.com/docs/payment-channels-testing)
- [PayMongo QR Ph](https://docs.paymongo.com/docs/payment-acceptance-qr-ph)
- [PayMongo webhook setup and signature verification](https://docs.paymongo.com/docs/developer-tools-webhook-setup-management)
- [PayMongo idempotent requests](https://docs.paymongo.com/reference/idempotent-requests)
- [Supabase Cron](https://supabase.com/docs/guides/cron)
- [Supabase Edge Function security](https://supabase.com/docs/guides/functions/auth)
- [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
