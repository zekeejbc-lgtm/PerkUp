# Subscription Upgrade at Renewal Design

## Goal

Allow a store owner to schedule an upgrade to a higher Perk subscription plan without changing or destabilizing the existing Supabase and PayMongo renewal mechanism.

The owner must receive an authoritative quote and review a complete terms panel before confirming. Confirmation is unavailable until the owner has reached the end of the terms, explicitly acknowledged them, and the backend has verified that the quote is still current.

## Approved Business Policy

Perk exposes self-service upgrades only. It does not expose a self-service downgrade action.

- An upgrade never takes effect immediately and never creates a prorated charge.
- The current plan remains active until a qualifying renewal is successfully paid.
- If no renewal invoice has been created for the upcoming period, the upgrade is attached to that upcoming renewal.
- If a renewal invoice already exists for the upcoming period, that invoice and its PayMongo link remain unchanged. The upgrade is attached to the following renewal.
- An overdue renewal or unpaid initial invoice must be resolved before a new upgrade can be scheduled.
- Automatic versus manual renewal remains unchanged by an upgrade request.
- Lower-plan requests are handled outside this self-service flow through Perk support or an administrator.
- An administrator may cancel or exceptionally change a scheduled upgrade only through an audited operation.

This policy intentionally avoids proration, mid-period entitlement changes, replacement PayMongo links, and automatic refunds.

## Definitions

- **Upcoming renewal**: the next renewal period represented by `billing_subscriptions.current_period_end`.
- **Issued renewal**: a `billing_invoices` renewal row already exists for the upcoming period and has not been voided or expired, regardless of whether PayMongo link creation has completed.
- **Target renewal**: the renewal invoice that will carry the selected higher plan and price.
- **Effective renewal**: successful fulfillment of the target renewal invoice through the existing PayMongo webhook, reconciliation worker, payment-status reconciliation, or authorized manual-payment path.
- **Upgrade**: movement to a plan later in the configured plan order and with a full-period price that is not lower than the current plan price.

Configured plan order is the initial upgrade hierarchy because the current dashboard already preserves a deliberate plan order and has no reordering feature. A future explicit tier field may replace this rule, but it is not required for this feature.

## User Experience

### Subscription Page

The store-owner subscription page continues to show the active subscription, renewal mode, predicted dates, and invoice history.

When the owner has an active, billable subscription, it also shows:

- an `Upgrade plan` action;
- higher eligible plans only;
- each target plan's full-period price, interval, features, and limits;
- a pending-upgrade summary when a change is already scheduled;
- the target renewal date and whether the next already-issued invoice remains unchanged;
- a cancellation action only while the scheduled upgrade is not attached to an issued invoice.

No `Downgrade` button or lower-plan selector is shown. The page may show neutral copy such as `Need a lower plan? Contact Perk support.` This copy must not imply that cancellation is unavailable.

The upgrade action is unavailable with an explanatory message when:

- initial payment is still required;
- a renewal is overdue;
- subscription access is frozen or not billable;
- another upgrade is already scheduled or locked;
- the plan catalog no longer contains the active plan;
- billing data required to calculate the target renewal is incomplete.

### Authoritative Quote

Selecting a target plan first requests a quote from the backend. The frontend does not calculate an authoritative price or effective renewal.

The quote contains:

- current plan ID, name, price, interval, features, and limits;
- target plan ID, name, price, interval, features, and limits;
- full-period price difference;
- amount charged today, always PHP 0 for this flow;
- the next renewal invoice date and price;
- the target renewal date and target invoice price;
- whether an already-issued renewal caused the upgrade to move to the following renewal;
- features and limits gained;
- renewal mode;
- quote creation and expiration timestamps;
- the current terms version;
- a backend-computed quote fingerprint.

The quote expires after 15 minutes. Any material billing or plan change invalidates it even before the displayed expiration.

## Mandatory Terms and Computation Modal

A dedicated `SubscriptionUpgradeTermsModal` is used instead of the generic destructive-action confirmation modal.

The modal is a panel large enough to present the decision without hiding material information. It includes the following sections in this order.

### Decision Summary

- `Current plan` and `Selected upgrade`
- `Charged today: PHP 0`
- `Upgrade activates: after the renewal due on [date] is successfully paid`
- A prominent notice when the next already-issued renewal is unchanged and the upgrade instead targets the following renewal

### Price Computation

The modal presents an explicit table:

| Item | Current | After upgrade | Difference |
| --- | ---: | ---: | ---: |
| Full billing-period price | current price | target price | target minus current |
| Amount charged today | PHP 0 | PHP 0 | PHP 0 |
| Next issued renewal, when locked | current invoice amount | current invoice amount | PHP 0 |
| Target renewal | current full price | target full price | target minus current |

Rows that do not apply are omitted rather than shown with misleading values.

The modal states that there is no proration and no immediate feature activation.

### Plan Differences

Show side-by-side limits and a concise gained-features list:

- customer limit;
- staff-account limit;
- branch limit;
- gallery-photo limit;
- plan features present in the target plan but not in the active plan.

The comparison uses the plan snapshots returned by the backend quote. It does not re-read mutable frontend configuration while the modal is open.

### Terms

The terms state, in plain language:

1. The active plan and limits stay unchanged until the target renewal is successfully paid.
2. Confirming schedules an upgrade; it does not charge the client immediately.
3. The displayed target plan price will be used for the identified target renewal, subject to quote revalidation at confirmation.
4. An already-issued renewal invoice and PayMongo payment link will not be replaced or repriced.
5. The upgrade does not change automatic or manual renewal preference.
6. For automatic renewal, the existing billing worker will prepare the target renewal normally.
7. For manual renewal, the owner must complete the target renewal payment before the upgrade is applied.
8. A scheduled upgrade may be cancelled only before a renewal invoice is attached to it.
9. Once its renewal invoice is issued, the upgrade is locked until the invoice is paid, expires, is voided through an authorized operation, or is resolved by an administrator.
10. Failed, expired, mismatched, or unpaid payments never activate the upgraded plan.
11. Plan access and limits are applied only after verified renewal fulfillment.
12. Lower-plan changes are not part of this self-service upgrade action.

The stored terms have an explicit version such as `subscription-upgrade-v1`. The modal displays that version and the quote timestamp in its footer.

### Read and Acknowledge Gate

The confirmation button is disabled until all of these are true:

- the scrollable terms region has reached its end;
- the owner checks `I have read and understood all subscription upgrade terms, prices, differences, and the effective renewal date.`;
- the quote has not expired;
- submission is not already in progress.

The checkbox remains disabled until the terms region reaches its end. Closing or changing the selected plan resets scroll completion and acknowledgement.

This interaction records acknowledgement; it does not claim to measure comprehension. The backend still rejects confirmation unless it receives the exact terms version, `termsAccepted: true`, and the current quote fingerprint.

The modal follows existing accessibility conventions and additionally traps focus, restores focus when closed, labels the scrollable terms region, exposes validation messages to assistive technology, supports Escape before submission, and prevents accidental backdrop dismissal during submission.

## Scheduling Rules

The backend determines the target renewal inside a transaction or a row-locked database operation.

### No Renewal Invoice Exists

If no active renewal invoice exists for `billing_subscriptions.current_period_end`:

- `target_period_start` is the current `current_period_end`;
- the next renewal invoice uses the target plan snapshot and target amount;
- the upgrade becomes locked when that invoice is created;
- the plan is applied only when that invoice is fulfilled.

### Renewal Invoice Already Exists

If an active renewal invoice already exists for the upcoming period:

- the existing invoice amount, description, reference, and PayMongo link remain unchanged;
- `target_period_start` is that invoice's `period_end`;
- the scheduled upgrade is attached to the following renewal when it is created;
- successful payment of the already-issued invoice renews the current plan and does not apply the upgrade.

This rule also applies when the invoice row exists but PayMongo link creation is pending or retrying. An invoice row is the billing cutoff, not the presence of a checkout URL.

### Blocking Invoice States

An unpaid initial invoice blocks scheduling.

An overdue or past-due renewal blocks scheduling until reconciled. A normal future renewal invoice does not block the request; it moves the target to the following renewal.

Invoice statuses `void` and `expired` do not lock a new quote, but the backend must recalculate the target renewal from current subscription state before confirmation.

## Data Model

Add `public.subscription_plan_changes` as the immutable decision and lifecycle record.

Key columns:

- `id uuid primary key`
- `subscription_id uuid not null references billing_subscriptions(id)`
- `store_id text not null references stores(id)`
- `owner_user_id text not null references users(id)`
- `change_type text not null check (change_type = 'upgrade')`
- `status text not null` constrained to `scheduled`, `locked`, `applied`, `cancelled`, and `failed`
- `from_plan_id text not null`
- `to_plan_id text not null`
- `from_plan_snapshot jsonb not null`
- `to_plan_snapshot jsonb not null`
- `current_amount_centavos integer not null`
- `target_amount_centavos integer not null`
- `difference_centavos integer not null`
- `amount_due_today_centavos integer not null check (amount_due_today_centavos = 0)`
- `target_period_start timestamptz not null`
- `target_period_end timestamptz not null`
- `renewal_invoice_id uuid null references billing_invoices(id)`
- `terms_version text not null`
- `terms_accepted_at timestamptz not null`
- `terms_accepted_by text not null`
- `quote_fingerprint text not null`
- `requested_at timestamptz not null`
- `locked_at timestamptz null`
- `applied_at timestamptz null`
- `cancelled_at timestamptz null`
- `cancelled_by text null`
- `failure_reason text null`
- standard timestamps

Use a partial unique index to allow at most one `scheduled` or `locked` plan change per subscription. Add indexes for `subscription_id`, `owner_user_id`, and due target-period lookup. Foreign-key columns used in joins must be indexed.

Add nullable snapshot columns to `billing_invoices`:

- `subscription_plan_change_id`
- `plan_id_snapshot`
- `plan_name_snapshot`
- `plan_snapshot`

The existing `invoice_type = 'renewal'` remains unchanged. No new adjustment-invoice type is introduced.

All new exposed tables use RLS. Owners may select only their own plan-change rows. Browser roles receive no insert, update, or delete grants. Mutations use protected backend operations.

## Backend Operations

### `quote_subscription_upgrade`

Available only to an authenticated store owner for their primary store.

It:

1. verifies ownership and primary-store scope;
2. reads the authoritative plan catalog;
3. resolves the active plan by stable ID or the existing normalized name fallback;
4. permits only plans later in the configured order and not cheaper than the active plan;
5. reads the subscription and relevant invoices;
6. applies the scheduling and blocking rules;
7. returns the authoritative quote, terms version, expiry, and fingerprint.

No database mutation is required for merely opening the modal.

### `confirm_subscription_upgrade`

It accepts only the store ID, target plan ID, terms version, acknowledgement flag, and quote fingerprint.

It re-runs the full quote calculation under a subscription row lock. It rejects:

- stale or expired quotes;
- a changed plan price, interval, features, or limits;
- a changed invoice cutoff;
- false acknowledgement;
- a terms-version mismatch;
- a target that is no longer an upgrade;
- a duplicate active change.

On success it stores the plan snapshots, computation, terms acceptance, target period, and audit event atomically. The response repeats the effective target renewal and current-versus-target computation for the success panel.

### `cancel_subscription_upgrade`

The owner may cancel only a `scheduled` change with no attached renewal invoice. Cancellation is row-locked, idempotent, and audited.

An administrator may resolve a locked change through a separate existing admin authorization path and must provide a reason. The operation must not void or replace a PayMongo link unless the corresponding remote operation is supported, completed, and verified.

## Preserving the Existing PayMongo Mechanism

The feature is additive around the existing renewal invoice. It does not introduce an immediate charge or a second payment path.

The following behavior remains unchanged:

- Supabase Cron invokes the existing billing worker.
- The worker creates one PayMongo Payment Link for one renewal invoice.
- PayMongo webhook signatures are verified against the raw request body.
- `link.payment.paid` resolves the existing invoice.
- reconciliation covers missed or delayed webhooks.
- authorized manual fulfillment uses the existing invoice.
- successful renewal advances the subscription period.
- warning, grace, freeze, receipts, and billing notifications continue to use the existing lifecycle.

Integration changes are limited to selecting and recording the plan carried by a renewal:

1. When a renewal invoice is created, invoice-claim logic looks for one scheduled upgrade whose `target_period_start` equals that invoice's `period_start`.
2. If found, it uses the stored target amount and plan snapshot; otherwise it executes the current amount-selection behavior unchanged.
3. The invoice stores the plan-change reference and immutable plan snapshot.
4. The existing worker receives the same claimed-invoice shape, including the correct plan label for its existing PayMongo description.
5. Invoice creation atomically moves the plan change from `scheduled` to `locked`.
6. Successful invoice fulfillment atomically applies the referenced plan snapshot, changes `billing_subscriptions.plan_id` and `amount_centavos`, mirrors `subscriptionLevel`, `owedAmount`, and `subscriptionDependencies` into the primary store, and marks the change `applied`.
7. If fulfillment is repeated, the already-applied change returns safely without applying twice.

Automatic worker invoice creation and manual-renewal invoice preparation must share these selection rules. A manual path must not bypass or lose a scheduled upgrade.

The current `pending_amount_centavos` mechanism for administrator-created price changes remains supported. A scheduled plan-upgrade snapshot has priority only for its exact target renewal invoice. It does not overwrite the existing pending-price fields, so unrelated price-change behavior remains intact.

No code may delete, recreate, supersede, or locally void an existing payable PayMongo link as part of this feature.

## Plan and Terms Versioning

Confirmed changes use stored snapshots so later plan edits cannot silently alter an acknowledged decision.

If an administrator edits or removes a target plan before confirmation, the quote becomes stale and must be reviewed again.

After confirmation:

- the acknowledged snapshot and amount remain attached to the target renewal;
- retiring a plan does not silently substitute another plan;
- an administrator must cancel an unavailable scheduled upgrade with a reason and notify the owner;
- historical invoices and acknowledgements remain readable.

Any material copy change to the terms creates a new terms version. Owners never confirm against hidden, newer text than the text they reviewed.

## Notifications

On confirmation, send a scheduled-upgrade notice containing:

- current and target plans;
- PHP 0 charged today;
- target renewal date and amount;
- price difference;
- whether an existing next invoice remains unchanged;
- how to cancel while still allowed.

When the target invoice is created, the existing payment-due notification carries the target plan snapshot and price.

When payment is fulfilled, the existing receipt is supplemented with an upgrade-applied notice and the new limits.

When an administrator cancels or a system failure prevents application, notify the owner with a non-sensitive explanation and support path. Notification delivery failure does not roll back a correctly recorded scheduling or payment transaction; it is retried and remains observable.

## Concurrency, Security, and Audit

- All authoritative prices, dates, status decisions, and plan comparisons are server-derived.
- Client-supplied amounts, plan snapshots, effective dates, or feature limits are ignored.
- Confirmation and cancellation lock the subscription and active plan-change rows.
- Invoice creation locks and attaches at most one scheduled upgrade.
- Fulfillment is idempotent across webhook, reconciliation, status-check, and manual-payment entry points.
- Audit metadata includes actor, source, old and new plan IDs, target period, terms version, quote fingerprint, invoice ID when available, and outcome.
- Sensitive backend operations continue using service credentials; service credentials never reach the browser.
- New security-definer code is avoided. If privileged database code is unavoidable, execute is revoked from `PUBLIC`, `anon`, and `authenticated` and granted only to `service_role`.

## Error Handling

- **Quote becomes stale:** keep the modal open, clear acknowledgement, fetch a new quote, and require a complete review again.
- **Confirmation races invoice creation:** the row-locked backend recalculates the target period. If it changed, reject as stale rather than silently scheduling a different date.
- **Payment Link creation fails:** leave the current plan unchanged and use the existing retry behavior.
- **Invoice remains unpaid:** do not apply the upgrade.
- **Payment details mismatch:** preserve the current plan and use the existing mismatch alert path.
- **Duplicate webhook or reconciliation:** return the existing successful result without applying the upgrade twice.
- **Application update fails:** roll back invoice fulfillment and plan application together where the existing payment transaction permits; otherwise record a high-priority recoverable failure and prevent divergent entitlements.
- **Plan snapshot cannot be applied:** do not invent replacement limits; retain the current plan and flag the locked change for admin resolution.

## Testing and Regression Protection

### Quote and Business Rules

- active plan exposes only later, non-cheaper plans;
- lower, equal, missing, and retired plans are rejected;
- PHP 0 is always due at confirmation;
- price difference is calculated in integer centavos;
- no issued invoice targets the upcoming renewal;
- an issued upcoming invoice moves the target to the following renewal;
- an unpaid initial or overdue renewal blocks scheduling;
- automatic and manual renewal modes are preserved;
- a plan or invoice change makes the quote stale.

### Modal

- authoritative current and target prices, differences, dates, features, and limits render correctly;
- special following-renewal copy appears when an invoice already exists;
- checkbox is disabled before scrolling to the end;
- confirmation is disabled before both scroll completion and acknowledgement;
- changing the selected plan or refreshing a stale quote resets acceptance;
- an expired quote cannot be confirmed;
- keyboard focus, Escape, labels, and error announcements work;
- double submission creates only one scheduled change.

### Database and Billing Integration

- an ordinary subscription with no upgrade produces the same invoice and fulfillment result as before;
- a scheduled upgrade is attached only to its exact target renewal;
- invoice amount and PayMongo description use the target snapshot;
- invoice creation locks the upgrade once;
- successful webhook fulfillment applies the target plan once;
- reconciliation and payment-status fulfillment apply the same result;
- authorized manual payment applies the same result;
- paying the already-issued current-plan invoice does not apply a following-renewal upgrade;
- failed, expired, void, mismatched, and unpaid invoices do not apply the upgrade;
- existing pending admin price changes still work when no plan upgrade targets the invoice;
- renewal mode, grace, warning, freeze, receipt, and notification behavior regressions are absent;
- concurrent invoice workers cannot attach duplicate plan changes;
- owners can read only their own change history and cannot mutate it directly.

### Required Verification

Before completion:

1. run focused unit and database integration tests;
2. run TypeScript and lint checks;
3. run the production build;
4. run Supabase database advisors;
5. exercise PayMongo test-mode renewal with no upgrade as a regression control;
6. exercise PayMongo test-mode upcoming-renewal upgrade;
7. exercise PayMongo test-mode following-renewal scheduling with an already-issued invoice;
8. verify webhook and reconciliation idempotency;
9. verify manual-renewal behavior;
10. confirm that no additional live or test Payment Link is created merely by selecting or confirming an upgrade.

## Rollout and Rollback

Roll out behind a disabled-by-default subscription-upgrade feature flag.

Enable it first in test mode for an internal store. After the regression controls pass, enable it for selected accounts, then for all eligible owners.

Rollback disables the owner UI and quote/confirm actions. Existing scheduled or locked records remain auditable. Locked upgrades associated with payable invoices must continue through normal reconciliation or explicit admin resolution; rollback must never orphan a valid PayMongo payment.

## Out of Scope

- self-service downgrade;
- immediate upgrade;
- proration;
- mid-period refunds;
- a second PayMongo link for a plan change;
- changing automatic versus manual renewal;
- plan reordering;
- replacing existing renewal invoices;
- deleting or reducing client data;
- changing cancellation policy.
