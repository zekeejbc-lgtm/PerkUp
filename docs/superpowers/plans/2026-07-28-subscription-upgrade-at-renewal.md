# Subscription Upgrade at Renewal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an informed, upgrade-only subscription workflow that applies a higher plan through an existing qualifying renewal without creating, replacing, or bypassing any PayMongo payment.

**Architecture:** A protected backend builds authoritative quotes from the current plan catalog, subscription, and renewal invoices. Confirmed decisions are stored in a normalized Supabase ledger and attached to exactly one ordinary renewal invoice; the existing fulfillment functions apply the plan snapshot atomically after verified payment. A dedicated React modal displays the price computation, renewal timing, feature differences, and versioned terms, and gates confirmation on scrolling plus explicit acknowledgement.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Vitest, Testing Library, Supabase Postgres/RLS/pgTAP, Supabase Edge Functions on Deno, PayMongo Payment Links, Google Apps Script email.

## Global Constraints

- Self-service changes are upgrades only; no client-facing downgrade action is added.
- `amountDueTodayCentavos` is always `0`; there is no proration or immediate charge.
- If no active renewal invoice exists for the upcoming period, the upgrade targets that renewal.
- If an active renewal invoice already exists, it remains unchanged and the upgrade targets the following renewal.
- An invoice row is the cutoff; PayMongo link presence is not the cutoff.
- An unpaid initial invoice, overdue renewal, frozen access, or incomplete billing configuration blocks scheduling.
- Confirmation never creates a PayMongo Payment Link.
- Existing invoices and PayMongo links are never deleted, replaced, superseded, or locally voided by this feature.
- Automatic/manual renewal mode, webhook verification, reconciliation, warning, grace, freeze, receipt, and payment-state behavior remain unchanged.
- The active plan changes only through successful fulfillment of the target renewal invoice.
- The modal uses terms version `subscription-upgrade-v1`, requires scroll completion plus explicit acknowledgement, and resets acknowledgement whenever the quote changes.
- Authoritative prices, dates, limits, plan order, and invoice state are computed server-side; client-supplied snapshots and amounts are never trusted.
- All new `public` tables have RLS enabled, browser roles have no write grant, owner reads are ownership-filtered, and foreign-key/RLS predicate columns are indexed.
- No new `SECURITY DEFINER` function is introduced; service-only functions revoke execute from `PUBLIC`, `anon`, and `authenticated`.
- The rollout is disabled by default using `VITE_SUBSCRIPTION_UPGRADES_ENABLED=false` and `SUBSCRIPTION_UPGRADES_ENABLED=false`.
- Before editing, re-read `git status` and preserve the current user changes in `scripts/email-sender.gs`, `src/lib/subscriptionInvoicePdf.ts`, and untracked design/plan documents.
- Create each migration with `supabase migration new <name>` after checking `supabase --help`; never hand-invent a migration timestamp.

---

## File Map

### Create

- `src/lib/subscriptionUpgrade.ts` — browser-safe API types, currency/difference helpers, and acknowledgement state helpers.
- `src/lib/subscriptionUpgrade.test.ts` — focused unit coverage for plan differences and confirmation gating.
- `src/lib/subscriptionUpgradeApi.ts` — typed calls to the existing `admin-backend` Edge Function.
- `src/components/SubscriptionUpgradeTermsModal.tsx` — accessible quote, computation, differences, terms, and acknowledgement panel.
- `src/components/SubscriptionUpgradeTermsModal.test.tsx` — interaction tests for scroll, acknowledgement, expiry, stale quotes, and double submission.
- `src/test/setup.ts` — Testing Library cleanup and DOM test setup.
- `vitest.config.ts` — jsdom test configuration.
- `supabase/functions/_shared/subscription-upgrade.ts` — authoritative plan normalization, eligibility, target-period, and quote fingerprint logic.
- `supabase/functions/_shared/subscription-upgrade.test.ts` — Deno unit tests for business rules and stale-quote inputs.
- `supabase/tests/database/subscription_upgrade_at_renewal.test.sql` — pgTAP coverage for RLS, locking, invoice attachment, and idempotent application.
- The CLI output of `supabase migration new subscription_upgrade_at_renewal` — schema, RLS, service-only RPCs, invoice snapshot columns, queue, attachment, and fulfillment integration.

### Modify

- `package.json` and `package-lock.json` — Vitest/Testing Library dev dependencies and test scripts.
- `.env.example` — disabled-by-default browser feature flag.
- `src/lib/adminBackend.ts:1-70` — preserve structured backend error codes such as `STALE_UPGRADE_QUOTE`.
- `src/pages/store-owner/StoreOwnerSubscription.tsx:1-419` — upgrade options, pending state, modal launch, confirmation, cancellation, and refreshed billing data.
- `src/pages/admin/AdminStoreDetail.tsx:1-1600` — read-only upgrade status and audited admin cancellation with a reason.
- `supabase/functions/admin-backend/index.ts:1-3550` — options, quote, confirm, owner cancel, admin cancel, audit metadata, and feature flag.
- `supabase/functions/subscription-billing-worker/index.ts:1-570` — snapshot-aware plan labels and the plan-change notification queue; PayMongo API calls remain unchanged.
- `supabase/functions/subscription-payment-status/index.ts:230-430` — use the database manual-renewal preparation RPC and invoice plan snapshot.
- `scripts/google-drive-upload.gs:100-160` — route scheduled/applied/cancelled upgrade email actions.
- `scripts/email-sender.gs:275-470` — additive upgrade notification functions merged with current user edits.

---

### Task 1: Test Harness and Browser Domain Contract

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/lib/subscriptionUpgrade.ts`
- Create: `src/lib/subscriptionUpgrade.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `SubscriptionUpgradeQuote`, `SubscriptionPlanSnapshot`, `SubscriptionPlanChangeSummary`, `getUpgradeFeatureGains()`, `getUpgradeLimitRows()`, `canConfirmUpgrade()`, and `formatPhpCentavos()`.
- Consumes: `SubscriptionDependencies` from `src/lib/subscriptionBilling.ts`.

- [ ] **Step 1: Install the DOM test dependencies**

Run:

```powershell
npm install --save-dev vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

Expected: `package.json` and `package-lock.json` contain only dev-time test additions.

- [ ] **Step 2: Add deterministic test scripts and jsdom setup**

Add to `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    clearMocks: true,
  },
});
```

Create `src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());
```

- [ ] **Step 3: Write failing domain-contract tests**

Create tests covering:

```ts
expect(formatPhpCentavos(199900)).toBe("PHP 1,999");
expect(getUpgradeFeatureGains(current, target)).toEqual(["Priority support"]);
expect(getUpgradeLimitRows(current, target)).toContainEqual({
  key: "staffLimit",
  label: "Staff accounts",
  current: "1",
  target: "5",
});
expect(canConfirmUpgrade({
  reachedTermsEnd: true,
  accepted: true,
  expiresAt: "2026-07-28T12:15:00.000Z",
  now: new Date("2026-07-28T12:10:00.000Z"),
  submitting: false,
})).toBe(true);
expect(canConfirmUpgrade({
  reachedTermsEnd: false,
  accepted: true,
  expiresAt: "2026-07-28T12:15:00.000Z",
  now: new Date("2026-07-28T12:10:00.000Z"),
  submitting: false,
})).toBe(false);
```

- [ ] **Step 4: Run the tests and verify the expected failure**

Run:

```powershell
npx vitest run src/lib/subscriptionUpgrade.test.ts
```

Expected: FAIL because `subscriptionUpgrade.ts` does not exist.

- [ ] **Step 5: Implement the minimal typed contract**

Use this exact public shape:

```ts
export type SubscriptionPlanSnapshot = {
  id: string;
  name: string;
  order: number;
  priceCentavos: number;
  interval: string;
  intervalDays: number;
  features: string[];
  dependencies: {
    customerLimit: number;
    staffLimit: number;
    branchLimit: number;
    galleryPhotoLimit: number;
  };
};

export type SubscriptionUpgradeQuote = {
  storeId: string;
  subscriptionId: string;
  currentPlan: SubscriptionPlanSnapshot;
  targetPlan: SubscriptionPlanSnapshot;
  amountDueTodayCentavos: 0;
  differenceCentavos: number;
  nextRenewal: {
    periodStart: string;
    periodEnd: string;
    amountCentavos: number;
    planId: string;
    alreadyIssued: boolean;
    invoiceId: string | null;
  };
  targetRenewal: {
    periodStart: string;
    periodEnd: string;
    amountCentavos: number;
    planId: string;
  };
  renewalMode: "automatic" | "manual";
  termsVersion: string;
  quotedAt: string;
  expiresAt: string;
  quoteFingerprint: string;
};

export type SubscriptionPlanChangeSummary = {
  id: string;
  status: "scheduled" | "locked" | "applied" | "cancelled" | "failed";
  fromPlan: SubscriptionPlanSnapshot;
  toPlan: SubscriptionPlanSnapshot;
  targetPeriodStart: string;
  targetAmountCentavos: number;
  renewalInvoiceId: string | null;
  requestedAt: string;
  lockedAt: string | null;
  appliedAt: string | null;
};
```

Implement formatting without floating-point money conversion and compare feature strings after trim/lowercase normalization.

- [ ] **Step 6: Run the focused and existing tests**

Run:

```powershell
npx vitest run src/lib/subscriptionUpgrade.test.ts src/lib/customerMapMarkers.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add package.json package-lock.json vitest.config.ts src/test/setup.ts src/lib/subscriptionUpgrade.ts src/lib/subscriptionUpgrade.test.ts
git commit -m "test: add subscription upgrade domain contract"
```

---

### Task 2: Database Ledger, RLS, Scheduling, and Fulfillment

**Files:**
- Create via CLI: the file printed by `supabase migration new subscription_upgrade_at_renewal`
- Create: `supabase/tests/database/subscription_upgrade_at_renewal.test.sql`

**Interfaces:**
- Produces RPCs:
  - `public.confirm_subscription_upgrade(text,text,jsonb,jsonb,integer,integer,timestamptz,timestamptz,text,text,timestamptz)`
  - `public.cancel_subscription_upgrade(uuid,text,text,timestamptz)`
  - `public.prepare_manual_renewal_invoice(uuid,text,timestamptz)`
  - `public.claim_subscription_upgrade_notifications(integer,timestamptz)`
- Produces private helpers:
  - `private.attach_subscription_upgrade_to_invoice(uuid,timestamptz)`
  - `private.apply_subscription_upgrade_for_invoice(uuid,timestamptz)`
- Extends: `public.claim_due_billing_invoices`, `public.fulfill_billing_invoice`, and `public.fulfill_billing_invoice_manually`.

- [ ] **Step 1: Verify the current CLI and create the migration through the CLI**

Run:

```powershell
npx supabase --help
npx supabase migration new --help
npx supabase migration new subscription_upgrade_at_renewal
```

Expected: one new empty migration whose filename ends with `_subscription_upgrade_at_renewal.sql`.

- [ ] **Step 2: Write the failing pgTAP test first**

Create `supabase/tests/database/subscription_upgrade_at_renewal.test.sql` with a transaction and assertions for:

```sql
begin;
select plan(26);

select has_table('public', 'subscription_plan_changes');
select has_table('public', 'subscription_plan_change_notifications');
select has_column('public', 'billing_invoices', 'subscription_plan_change_id');
select has_column('public', 'billing_invoices', 'plan_id_snapshot');
select has_function('public', 'confirm_subscription_upgrade');
select has_function('public', 'cancel_subscription_upgrade');
select has_function('public', 'prepare_manual_renewal_invoice');

select policies_are(
  'public',
  'subscription_plan_changes',
  array['subscription_plan_changes_read_own_or_admin']
);

select isnt_empty(
  $$select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'subscription_plan_changes'
      and indexdef like '%owner_user_id%'$$
);

insert into public.users(id, data) values
  ('owner-a', '{"role":"store_owner","email":"a@example.com"}'),
  ('owner-b', '{"role":"store_owner","email":"b@example.com"}');
insert into public.stores(id, data) values
  ('store-a', '{"ownerId":"owner-a","isPrimaryBranch":true,"subscriptionLevel":"standard","owedAmount":999}'),
  ('store-b', '{"ownerId":"owner-b","isPrimaryBranch":true,"subscriptionLevel":"standard","owedAmount":999}');
insert into public.billing_subscriptions(
  id, store_id, owner_user_id, billing_email, plan_id, amount_centavos,
  currency, interval_days, current_period_start, current_period_end,
  next_billing_at, status, automation_enabled, renewal_mode,
  initial_payment_required
) values
  (
    '10000000-0000-0000-0000-000000000001', 'store-a', 'owner-a',
    'a@example.com', 'standard', 99900, 'PHP', 30,
    '2026-07-01T00:00:00Z', '2026-07-31T00:00:00Z',
    '2026-07-31T00:00:00Z', 'active', true, 'automatic', false
  ),
  (
    '10000000-0000-0000-0000-000000000002', 'store-b', 'owner-b',
    'b@example.com', 'standard', 99900, 'PHP', 30,
    '2026-07-01T00:00:00Z', '2026-07-31T00:00:00Z',
    '2026-07-31T00:00:00Z', 'active', true, 'automatic', false
  );

select lives_ok(
  $$select public.confirm_subscription_upgrade(
    'store-a',
    'owner-a',
    '{"id":"standard","name":"Standard","priceCentavos":99900,"dependencies":{"customerLimit":1000,"staffLimit":1,"branchLimit":1,"galleryPhotoLimit":3}}',
    '{"id":"premium","name":"Premium","priceCentavos":199900,"dependencies":{"customerLimit":10000,"staffLimit":5,"branchLimit":3,"galleryPhotoLimit":6}}',
    99900,
    199900,
    '2026-07-31T00:00:00Z',
    '2026-08-30T00:00:00Z',
    'subscription-upgrade-v1',
    'fingerprint-a',
    '2026-07-20T00:00:00Z'
  )$$,
  'an owner can schedule an upgrade for the upcoming unissued renewal'
);

select is(
  (
    select target_period_start
    from public.subscription_plan_changes
    where subscription_id = '10000000-0000-0000-0000-000000000001'
  ),
  '2026-07-31T00:00:00Z'::timestamptz,
  'the unissued renewal is the target period'
);

select throws_ok(
  $$select public.confirm_subscription_upgrade(
    'store-a',
    'owner-a',
    '{"id":"standard","name":"Standard","priceCentavos":99900}',
    '{"id":"premium","name":"Premium","priceCentavos":199900}',
    99900,
    199900,
    '2026-07-31T00:00:00Z',
    '2026-08-30T00:00:00Z',
    'subscription-upgrade-v1',
    'fingerprint-duplicate',
    '2026-07-20T00:00:00Z'
  )$$,
  '23505',
  null,
  'only one active change is allowed per subscription'
);

insert into public.billing_invoices(
  id, subscription_id, store_id, owner_user_id, invoice_type,
  period_start, period_end, due_at, amount_centavos, currency,
  status, paymongo_link_id, paymongo_reference_number, payment_url, livemode
) values (
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002',
  'store-b',
  'owner-b',
  'renewal',
  '2026-07-31T00:00:00Z',
  '2026-08-30T00:00:00Z',
  '2026-07-31T00:00:00Z',
  99900,
  'PHP',
  'link_created',
  'link_existing',
  'ref_existing',
  'https://paymongo.test/existing',
  false
);

select lives_ok(
  $$select public.confirm_subscription_upgrade(
    'store-b',
    'owner-b',
    '{"id":"standard","name":"Standard","priceCentavos":99900,"dependencies":{"staffLimit":1,"branchLimit":1}}',
    '{"id":"premium","name":"Premium","priceCentavos":199900,"dependencies":{"staffLimit":5,"branchLimit":3}}',
    99900,
    199900,
    '2026-08-30T00:00:00Z',
    '2026-09-29T00:00:00Z',
    'subscription-upgrade-v1',
    'fingerprint-b',
    '2026-07-20T00:00:00Z'
  )$$,
  'an issued upcoming invoice moves the upgrade to the following renewal'
);

select is(
  (
    select target_period_start
    from public.subscription_plan_changes
    where subscription_id = '10000000-0000-0000-0000-000000000002'
  ),
  '2026-08-30T00:00:00Z'::timestamptz,
  'the issued invoice period end becomes the target period start'
);

select is(
  (select amount_centavos from public.billing_invoices where id = '20000000-0000-0000-0000-000000000002'),
  99900,
  'the already-issued renewal amount is unchanged'
);

select is(
  (select subscription_plan_change_id from public.billing_invoices where id = '20000000-0000-0000-0000-000000000002'),
  null::uuid,
  'the already-issued renewal is not retroactively attached'
);

insert into public.billing_invoices(
  id, subscription_id, store_id, owner_user_id, invoice_type,
  period_start, period_end, due_at, amount_centavos, currency,
  status, paymongo_link_id, paymongo_reference_number, payment_url, livemode
) values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'store-a',
  'owner-a',
  'renewal',
  '2026-07-31T00:00:00Z',
  '2026-08-30T00:00:00Z',
  '2026-07-31T00:00:00Z',
  99900,
  'PHP',
  'link_created',
  'link_target',
  'ref_target',
  'https://paymongo.test/target',
  false
);

select lives_ok(
  $$select private.attach_subscription_upgrade_to_invoice(
    '20000000-0000-0000-0000-000000000001',
    '2026-07-21T00:00:00Z'
  )$$,
  'the exact target-period upgrade attaches to the invoice'
);

select is(
  (select amount_centavos from public.billing_invoices where id = '20000000-0000-0000-0000-000000000001'),
  199900,
  'attachment replaces the draft renewal amount with the acknowledged target amount'
);

select is(
  (
    select status
    from public.subscription_plan_changes
    where renewal_invoice_id = '20000000-0000-0000-0000-000000000001'
  ),
  'locked',
  'invoice attachment locks the plan change'
);

select lives_ok(
  $$select public.fulfill_billing_invoice(
    '20000000-0000-0000-0000-000000000001',
    'event-target-paid',
    'link_target',
    199900,
    'PHP',
    false,
    '2026-07-31T00:00:00Z'
  )$$,
  'ordinary verified fulfillment applies the attached upgrade'
);

select is(
  (
    select plan_id
    from public.billing_subscriptions
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  'premium',
  'paid target renewal updates the normalized active plan'
);

select is(
  (
    select count(*)::integer
    from public.subscription_plan_change_notifications n
    join public.subscription_plan_changes c on c.id = n.plan_change_id
    where c.subscription_id = '10000000-0000-0000-0000-000000000001'
      and n.notification_type = 'applied'
  ),
  1,
  'fulfillment queues one applied notification'
);

select lives_ok(
  $$select public.fulfill_billing_invoice(
    '20000000-0000-0000-0000-000000000001',
    'event-target-paid',
    'link_target',
    199900,
    'PHP',
    false,
    '2026-07-31T00:00:00Z'
  )$$,
  'duplicate fulfillment remains idempotent'
);

select is(
  (
    select count(*)::integer
    from public.subscription_plan_change_notifications n
    join public.subscription_plan_changes c on c.id = n.plan_change_id
    where c.subscription_id = '10000000-0000-0000-0000-000000000001'
      and n.notification_type = 'applied'
  ),
  1,
  'duplicate fulfillment does not queue a second applied notification'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"owner-a","role":"authenticated"}';

select is(
  (select count(*)::integer from public.subscription_plan_changes where owner_user_id = 'owner-a'),
  1,
  'an authenticated owner can read their own plan change'
);

select is(
  (select count(*)::integer from public.subscription_plan_changes where owner_user_id = 'owner-b'),
  0,
  'an authenticated owner cannot read another owner plan change'
);

reset role;
select * from finish();
rollback;
```

Keep the fixture values fixed so the test is deterministic in every time zone.

- [ ] **Step 3: Run the database test and verify it fails**

Run:

```powershell
npx supabase start
npx supabase db reset
npx supabase test db supabase/tests/database/subscription_upgrade_at_renewal.test.sql
```

Expected: FAIL because the tables and RPCs do not exist.

- [ ] **Step 4: Add the normalized ledger and indexes**

The migration creates:

```sql
create table public.subscription_plan_changes (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.billing_subscriptions(id) on delete restrict,
  store_id text not null references public.stores(id) on delete restrict,
  owner_user_id text not null references public.users(id) on delete restrict,
  change_type text not null default 'upgrade' check (change_type = 'upgrade'),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'locked', 'applied', 'cancelled', 'failed')),
  from_plan_id text not null,
  to_plan_id text not null,
  from_plan_snapshot jsonb not null,
  to_plan_snapshot jsonb not null,
  current_amount_centavos integer not null check (current_amount_centavos >= 100),
  target_amount_centavos integer not null check (target_amount_centavos >= 100),
  difference_centavos integer not null check (difference_centavos >= 0),
  amount_due_today_centavos integer not null default 0 check (amount_due_today_centavos = 0),
  target_period_start timestamptz not null,
  target_period_end timestamptz not null,
  renewal_invoice_id uuid references public.billing_invoices(id) on delete restrict,
  terms_version text not null,
  terms_accepted_at timestamptz not null,
  terms_accepted_by text not null,
  quote_fingerprint text not null,
  requested_at timestamptz not null default now(),
  locked_at timestamptz,
  applied_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_period_end > target_period_start),
  check (from_plan_id <> to_plan_id),
  check (target_amount_centavos >= current_amount_centavos)
);

create unique index subscription_plan_changes_one_active_idx
  on public.subscription_plan_changes(subscription_id)
  where status in ('scheduled', 'locked');
create index subscription_plan_changes_owner_idx
  on public.subscription_plan_changes(owner_user_id, requested_at desc);
create index subscription_plan_changes_target_idx
  on public.subscription_plan_changes(subscription_id, target_period_start)
  where status = 'scheduled';
```

Add the queue table with a unique `(plan_change_id, notification_type)` key and notification types `scheduled`, `applied`, and `cancelled`.

```sql
create table public.subscription_plan_change_notifications (
  id uuid primary key default gen_random_uuid(),
  plan_change_id uuid not null
    references public.subscription_plan_changes(id) on delete cascade,
  notification_type text not null
    check (notification_type in ('scheduled', 'applied', 'cancelled')),
  recipient text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_change_id, notification_type)
);

create index subscription_plan_change_notifications_claim_idx
  on public.subscription_plan_change_notifications(next_attempt_at, created_at)
  where status in ('pending', 'sending', 'failed');
```

Add invoice columns:

```sql
alter table public.billing_invoices
  add column subscription_plan_change_id uuid
    references public.subscription_plan_changes(id) on delete restrict,
  add column plan_id_snapshot text,
  add column plan_name_snapshot text,
  add column plan_snapshot jsonb;

create unique index billing_invoices_plan_change_idx
  on public.billing_invoices(subscription_plan_change_id)
  where subscription_plan_change_id is not null;
```

- [ ] **Step 5: Add RLS and least-privilege grants**

Use:

```sql
alter table public.subscription_plan_changes enable row level security;
alter table public.subscription_plan_change_notifications enable row level security;

create policy subscription_plan_changes_read_own_or_admin
on public.subscription_plan_changes for select to authenticated
using (
  owner_user_id = (select auth.uid())::text
  or (select private.current_user_role()) in ('admin', 'assistant_admin', 'auditor')
);

revoke all on public.subscription_plan_changes,
  public.subscription_plan_change_notifications
  from public, anon, authenticated;
grant select on public.subscription_plan_changes to authenticated;
grant select, insert, update, delete on public.subscription_plan_changes,
  public.subscription_plan_change_notifications to service_role;
```

Add `updated_at` triggers and indexes on every queue/foreign-key lookup used by RLS or worker claims.

- [ ] **Step 6: Implement row-locked confirmation and cancellation RPCs**

`confirm_subscription_upgrade` must:

1. lock the matching `billing_subscriptions` row;
2. validate owner, current plan, current amount, active status, initial-payment state, and accepted terms version;
3. reject an overdue unpaid renewal;
4. lock/read the current-period renewal invoice;
5. calculate the expected target start as current period end when no active invoice exists, otherwise the active invoice period end;
6. compare the expected start/end with the backend quote;
7. insert exactly one scheduled change and one scheduled notification;
8. return the inserted row.

`cancel_subscription_upgrade` must update only:

```sql
where id = p_plan_change_id
  and owner_user_id = p_owner_user_id
  and status = 'scheduled'
  and renewal_invoice_id is null
```

Both functions use `security invoker`, `set search_path = ''`, and service-only execute grants.

- [ ] **Step 7: Implement exact-period invoice attachment**

`private.attach_subscription_upgrade_to_invoice(p_invoice_id, p_now)`:

- locks the invoice;
- selects one `scheduled` change matching both subscription and `target_period_start = invoice.period_start`;
- updates the invoice amount and immutable plan snapshot;
- writes `renewal_invoice_id`, `locked_at`, and `status = 'locked'`;
- returns the selected plan ID and amount;
- returns the ordinary current/pending-price result when no matching change exists.

Update the latest `claim_due_billing_invoices` definition so newly inserted renewal invoices call this helper before the claim result is returned. Keep the RPC return column names and ordering unchanged, and return:

```sql
coalesce(i.plan_id_snapshot, s.plan_id) as plan_id
```

- [ ] **Step 8: Centralize manual-renewal invoice preparation**

Implement `prepare_manual_renewal_invoice` to:

- lock the subscription;
- enforce the current manual-renewal eligibility rules;
- insert the same renewal invoice shape currently created in `subscription-payment-status`;
- preserve the existing unique `(subscription_id, period_start)` idempotency;
- call `private.attach_subscription_upgrade_to_invoice`;
- return the invoice ID.

Only `service_role` can execute it.

- [ ] **Step 9: Apply the upgrade inside both existing fulfillment transactions**

`private.apply_subscription_upgrade_for_invoice(p_invoice_id, p_paid_at)` must:

- return immediately when the invoice has no `subscription_plan_change_id`;
- lock the referenced `locked` change;
- verify the invoice is paid and its period matches the target period;
- set `billing_subscriptions.plan_id` and `amount_centavos`;
- merge `subscriptionLevel`, `owedAmount`, and normalized `subscriptionDependencies` from `to_plan_snapshot` into `stores.data`;
- mark the change `applied` once;
- queue one `applied` notification.

Call this helper at the end of the current `fulfill_billing_invoice` and `fulfill_billing_invoice_manually` functions before their return values. Do not change PayMongo amount, currency, mode, link-ID, or duplicate-event checks.

- [ ] **Step 10: Run database tests, migration checks, and advisors**

Run:

```powershell
npx supabase db reset
npx supabase test db supabase/tests/database/subscription_upgrade_at_renewal.test.sql
npx supabase migration list --local
npx supabase db advisors --local
```

Expected: all pgTAP assertions pass, migration history is ordered, and no security/performance advisor introduced by the migration remains unresolved.

- [ ] **Step 11: Commit**

```powershell
git add supabase/migrations supabase/tests/database/subscription_upgrade_at_renewal.test.sql
git commit -m "feat: add renewal-bound subscription upgrade ledger"
```

---

### Task 3: Authoritative Quote and Protected Backend Actions

**Files:**
- Create: `supabase/functions/_shared/subscription-upgrade.ts`
- Create: `supabase/functions/_shared/subscription-upgrade.test.ts`
- Modify: `supabase/functions/admin-backend/index.ts:1-3550`
- Modify: `.env.example`

**Interfaces:**
- Produces Edge actions: `get_subscription_upgrade_options`, `quote_subscription_upgrade`, `confirm_subscription_upgrade`, `cancel_subscription_upgrade`, and `admin_cancel_subscription_upgrade`.
- Consumes Task 2 RPCs and Task 1 response shapes.

- [ ] **Step 1: Write failing Deno unit tests**

Test fixed state objects for:

```ts
import { assertEquals, assertNotEquals, assertThrows } from "jsr:@std/assert@1";
import {
  computeSubscriptionUpgradeFingerprint,
  listEligibleUpgradePlans,
  resolveUpgradeTargetPeriod,
} from "./subscription-upgrade.ts";

const plan = (id: string, name: string, order: number, priceCentavos: number) => ({
  id,
  name,
  order,
  priceCentavos,
  interval: "month",
  intervalDays: 30,
  features: [],
  dependencies: {
    customerLimit: 1000,
    staffLimit: 1,
    branchLimit: 1,
    galleryPhotoLimit: 3,
  },
});

Deno.test("targets upcoming renewal when no renewal invoice exists", () => {
  const target = resolveUpgradeTargetPeriod({
    currentPeriodEnd: "2026-07-31T00:00:00.000Z",
    intervalDays: 30,
    currentRenewalInvoice: null,
    now: "2026-07-20T00:00:00.000Z",
  });
  assertEquals(target.periodStart, "2026-07-31T00:00:00.000Z");
  assertEquals(target.periodEnd, "2026-08-30T00:00:00.000Z");
  assertEquals(target.alreadyIssued, false);
});

Deno.test("targets following renewal when an active invoice exists", () => {
  const target = resolveUpgradeTargetPeriod({
    currentPeriodEnd: "2026-07-31T00:00:00.000Z",
    intervalDays: 30,
    currentRenewalInvoice: {
      id: "invoice-current",
      status: "link_created",
      dueAt: "2026-07-31T00:00:00.000Z",
      periodStart: "2026-07-31T00:00:00.000Z",
      periodEnd: "2026-08-30T00:00:00.000Z",
      amountCentavos: 99900,
    },
    now: "2026-07-20T00:00:00.000Z",
  });
  assertEquals(target.periodStart, "2026-08-30T00:00:00.000Z");
  assertEquals(target.periodEnd, "2026-09-29T00:00:00.000Z");
  assertEquals(target.alreadyIssued, true);
});

Deno.test("rejects equal, earlier, and cheaper targets", () => {
  const plans = [
    plan("standard", "Standard", 0, 99900),
    plan("premium", "Premium", 1, 199900),
    plan("promo", "Promo", 2, 89900),
  ];
  assertEquals(
    listEligibleUpgradePlans(plans, "premium").map((plan) => plan.id),
    [],
  );
});

Deno.test("fingerprint changes when authoritative state changes", async () => {
  const base = {
    subscriptionId: "subscription-a",
    fromPlanId: "standard",
    toPlanId: "premium",
    currentAmountCentavos: 99900,
    targetPeriodStart: "2026-07-31T00:00:00.000Z",
    targetPeriodEnd: "2026-08-30T00:00:00.000Z",
    currentRenewalInvoiceId: null,
    currentRenewalInvoiceStatus: null,
    termsVersion: "subscription-upgrade-v1",
    planCatalogUpdatedAt: "2026-07-28T00:00:00.000Z",
  };
  const first = await computeSubscriptionUpgradeFingerprint({
    ...base,
    targetAmountCentavos: 199900,
  });
  const second = await computeSubscriptionUpgradeFingerprint({
    ...base,
    targetAmountCentavos: 200000,
  });
  assertNotEquals(first.quoteFingerprint, second.quoteFingerprint);
});

Deno.test("blocks an overdue renewal", () => {
  assertThrows(
    () => resolveUpgradeTargetPeriod({
      currentPeriodEnd: "2026-07-01T00:00:00.000Z",
      intervalDays: 30,
      currentRenewalInvoice: {
        id: "invoice-overdue",
        status: "link_created",
        dueAt: "2026-07-01T00:00:00.000Z",
        periodStart: "2026-07-01T00:00:00.000Z",
        periodEnd: "2026-07-31T00:00:00.000Z",
        amountCentavos: 99900,
      },
      now: "2026-07-20T00:00:00.000Z",
    }),
    Error,
    "Resolve the overdue renewal before scheduling an upgrade.",
  );
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
deno test supabase/functions/_shared/subscription-upgrade.test.ts
```

Expected: FAIL because the shared module does not exist.

- [ ] **Step 3: Implement the authoritative helper**

Export:

```ts
export const SUBSCRIPTION_UPGRADE_TERMS_VERSION = "subscription-upgrade-v1";
export const SUBSCRIPTION_UPGRADE_QUOTE_TTL_MS = 15 * 60 * 1000;

export function normalizePlanCatalog(settingsData: unknown): PlanSnapshot[];
export function listEligibleUpgradePlans(
  plans: PlanSnapshot[],
  currentPlanIdOrName: string,
): PlanSnapshot[];
export function resolveUpgradeTargetPeriod(input: BillingQuoteState): TargetRenewal;
export function computeSubscriptionUpgradeFingerprint(
  input: UpgradeFingerprintInput,
): Promise<{ quoteFingerprint: string }>;
export function buildSubscriptionUpgradeQuote(input: UpgradeQuoteInput): Promise<UpgradeQuote>;
```

Fingerprint the canonical JSON of:

```ts
{
  subscriptionId,
  fromPlanId,
  toPlanId,
  currentAmountCentavos,
  targetAmountCentavos,
  targetPeriodStart,
  targetPeriodEnd,
  currentRenewalInvoiceId,
  currentRenewalInvoiceStatus,
  termsVersion,
  planCatalogUpdatedAt,
}
```

Use:

```ts
const bytes = new TextEncoder().encode(canonicalJson);
const digest = await crypto.subtle.digest("SHA-256", bytes);
```

The fingerprint detects stale state and is not an authorization token.

- [ ] **Step 4: Add the disabled-by-default configuration**

Add to `.env.example`:

```dotenv
VITE_SUBSCRIPTION_UPGRADES_ENABLED="false"
SUBSCRIPTION_UPGRADES_ENABLED="false"
```

The backend returns a disabled response unless `SUBSCRIPTION_UPGRADES_ENABLED` is exactly `true`, independent of the browser flag.

- [ ] **Step 5: Add store-owner read and quote actions**

Create one backend loader that:

- verifies the actor role is `store_owner`;
- verifies direct primary-store ownership;
- reads `settings/subscriptions`, `billing_subscriptions`, current/overdue invoices, and the active change;
- returns only eligible plans and owner-scoped data.

`get_subscription_upgrade_options` returns:

```ts
{
  enabled: true,
  currentPlan,
  eligiblePlans,
  pendingChange,
  blockedReason: string | null
}
```

`quote_subscription_upgrade` returns the Task 1 quote shape.

- [ ] **Step 6: Add confirm and cancel actions**

`confirm_subscription_upgrade` accepts only:

```ts
{
  action: "confirm_subscription_upgrade";
  storeId: string;
  targetPlanId: string;
  termsVersion: string;
  termsAccepted: true;
  quoteFingerprint: string;
}
```

Rebuild the quote, compare the fingerprint and version, then call the row-locked RPC. A race returns HTTP 409 with `code: "STALE_UPGRADE_QUOTE"`; it never silently changes the effective renewal.

`cancel_subscription_upgrade` calls the owner cancellation RPC. `admin_cancel_subscription_upgrade` requires a privileged role and a non-empty reason of 10–500 characters.

- [ ] **Step 7: Add audit classification**

Add the three mutation actions to `AUTO_AUDITED_MUTATIONS`. Extend `mutationEntityType`, `mutationEntityId`, and `mutationAuditMetadata` so audit rows contain:

```ts
{
  fromPlanId,
  toPlanId,
  targetPeriodStart,
  termsVersion,
  quoteFingerprint,
  reason,
}
```

Do not include plan feature arrays, email addresses, or raw request bodies in audit metadata.

- [ ] **Step 8: Run unit, type, and formatting checks**

Run:

```powershell
deno test supabase/functions/_shared/subscription-upgrade.test.ts
deno check supabase/functions/admin-backend/index.ts
npm run lint
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add .env.example supabase/functions/_shared/subscription-upgrade.ts supabase/functions/_shared/subscription-upgrade.test.ts supabase/functions/admin-backend/index.ts
git commit -m "feat: add protected subscription upgrade quotes"
```

---

### Task 4: Preserve Automatic and Manual PayMongo Renewal Paths

**Files:**
- Modify: `supabase/functions/subscription-billing-worker/index.ts:1-570`
- Modify: `supabase/functions/subscription-payment-status/index.ts:230-430`
- Modify: `supabase/tests/database/subscription_upgrade_at_renewal.test.sql`

**Interfaces:**
- Consumes Task 2 invoice snapshot columns and manual preparation RPC.
- Preserves `createPaymentLink`, `createPayMongoPaymentLink`, `fulfill_billing_invoice`, and PayMongo webhook payloads.

- [ ] **Step 1: Extend the pgTAP regression test before Edge changes**

Add assertions proving:

- no scheduled change produces the same amount and null `subscription_plan_change_id`;
- upcoming upgrade invoice uses its target amount and snapshot;
- following-renewal upgrade does not attach to the already-issued invoice;
- manual preparation attaches the exact target-period upgrade;
- repeated manual preparation returns the existing invoice;
- a paid target invoice applies the plan once.

- [ ] **Step 2: Run the focused database test**

Run:

```powershell
npx supabase test db supabase/tests/database/subscription_upgrade_at_renewal.test.sql
```

Expected: PASS against the Task 2 database implementation.

- [ ] **Step 3: Make the worker consume immutable invoice labels**

Keep `ClaimedInvoice.plan_id` and the existing PayMongo call unchanged. When sending later receipt/reminder notifications, prefer:

```ts
invoice.plan_id_snapshot || subscription.plan_id
```

Add snapshot columns only to database selects; do not modify payment-link amount, reference-number, idempotency-key, mode, or endpoint logic.

- [ ] **Step 4: Replace the manual direct insert with the preparation RPC**

In `subscription-payment-status`, replace only the manual renewal insert/calculation block with:

```ts
const { data: preparedInvoiceId, error: prepareError } = await admin.rpc(
  "prepare_manual_renewal_invoice",
  {
    p_subscription_id: subscription.id,
    p_owner_user_id: ownerUserId,
    p_now: new Date().toISOString(),
  },
);
if (prepareError) throw prepareError;
```

Reload that invoice with `plan_id_snapshot`, and pass:

```ts
planId: invoice.plan_id_snapshot || invoiceSubscription?.plan_id
```

to the unchanged shared PayMongo link creator.

- [ ] **Step 5: Verify Edge functions compile**

Run:

```powershell
deno check supabase/functions/subscription-billing-worker/index.ts
deno check supabase/functions/subscription-payment-status/index.ts
deno check supabase/functions/paymongo-webhook/index.ts
```

Expected: PASS; `paymongo-webhook/index.ts` has no behavioral change.

- [ ] **Step 6: Commit**

```powershell
git add supabase/functions/subscription-billing-worker/index.ts supabase/functions/subscription-payment-status/index.ts supabase/tests/database/subscription_upgrade_at_renewal.test.sql
git commit -m "feat: attach upgrades to existing renewals"
```

---

### Task 5: Terms, Computation, and Differences Modal

**Files:**
- Create: `src/components/SubscriptionUpgradeTermsModal.tsx`
- Create: `src/components/SubscriptionUpgradeTermsModal.test.tsx`
- Modify: `src/lib/subscriptionUpgrade.ts`

**Interfaces:**
- Props:

```ts
type SubscriptionUpgradeTermsModalProps = {
  isOpen: boolean;
  quote: SubscriptionUpgradeQuote | null;
  isSubmitting: boolean;
  error: string;
  onConfirm: (acceptance: {
    termsVersion: string;
    termsAccepted: true;
    quoteFingerprint: string;
  }) => Promise<void>;
  onClose: () => void;
  onRefreshQuote: () => Promise<void>;
};
```

- [ ] **Step 1: Write modal interaction tests first**

Cover:

```ts
it("shows PHP 0 today, target renewal amount, difference, and effective date");
it("explains that an already-issued next invoice remains unchanged");
it("shows gained features and every before/after limit");
it("keeps acknowledgement and confirmation disabled before terms end");
it("enables acknowledgement only after terms scroll reaches the end");
it("requires acknowledgement before confirmation");
it("resets acknowledgement when the quote fingerprint changes");
it("blocks an expired quote and offers refresh");
it("submits terms version and fingerprint exactly once");
it("restores focus and supports Escape before submission");
```

Use `Object.defineProperty` for `scrollHeight`, `clientHeight`, and `scrollTop`, then dispatch `scroll`.

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npx vitest run src/components/SubscriptionUpgradeTermsModal.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the accessible modal shell**

Use:

```tsx
<section
  role="dialog"
  aria-modal="true"
  aria-labelledby="subscription-upgrade-title"
  aria-describedby="subscription-upgrade-summary"
>
```

Trap focus within the panel, focus the close button initially, restore the previous element, lock body scrolling, allow Escape only when not submitting, and ignore backdrop clicks during submission.

- [ ] **Step 4: Render the complete decision and computation**

Render:

- current and target plan cards;
- `Charged today: PHP 0`;
- target renewal date;
- current price, target price, and difference;
- unchanged already-issued invoice row when applicable;
- target-renewal price row;
- all four dependency limits;
- normalized gained features;
- automatic/manual renewal statement.

Do not render price values from local plan settings; use `quote` only.

- [ ] **Step 5: Implement the read gate and twelve versioned terms**

The scroll region has `tabIndex={0}`, a visible progress hint, and:

```ts
const atEnd = element.scrollTop + element.clientHeight >= element.scrollHeight - 4;
```

The checkbox is disabled until `atEnd`. Confirm is enabled only through `canConfirmUpgrade()`. Reset `reachedTermsEnd` and `accepted` whenever `quote?.quoteFingerprint` changes or the modal closes.

- [ ] **Step 6: Run modal and domain tests**

Run:

```powershell
npx vitest run src/components/SubscriptionUpgradeTermsModal.test.tsx src/lib/subscriptionUpgrade.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/components/SubscriptionUpgradeTermsModal.tsx src/components/SubscriptionUpgradeTermsModal.test.tsx src/lib/subscriptionUpgrade.ts
git commit -m "feat: add informed upgrade terms confirmation"
```

---

### Task 6: Store-Owner Upgrade Workflow

**Files:**
- Create: `src/lib/subscriptionUpgradeApi.ts`
- Modify: `src/lib/adminBackend.ts:1-70`
- Modify: `src/pages/store-owner/StoreOwnerSubscription.tsx:1-419`
- Create: `src/pages/store-owner/StoreOwnerSubscription.test.tsx`

**Interfaces:**
- Produces API functions:

```ts
getSubscriptionUpgradeOptions(storeId: string): Promise<UpgradeOptionsResponse>;
quoteSubscriptionUpgrade(storeId: string, targetPlanId: string): Promise<SubscriptionUpgradeQuote>;
confirmSubscriptionUpgrade(input: ConfirmUpgradeInput): Promise<SubscriptionPlanChangeSummary>;
cancelSubscriptionUpgrade(storeId: string, planChangeId: string): Promise<void>;
```

- [ ] **Step 1: Write page-flow tests first**

Mock `subscriptionUpgradeApi` and verify:

- only higher eligible plans render;
- no downgrade control or lower-plan choice renders;
- blocked reasons disable the action;
- selecting a target opens the terms modal with a backend quote;
- confirmation refreshes subscription and pending-change data;
- HTTP 409 `STALE_UPGRADE_QUOTE` fetches a fresh quote and requires re-acknowledgement;
- pending scheduled change can be cancelled;
- locked change has no owner cancellation button;
- `Need a lower plan? Contact Perk support.` is visible.

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npx vitest run src/pages/store-owner/StoreOwnerSubscription.test.tsx
```

Expected: FAIL because the API module and page controls do not exist.

- [ ] **Step 3: Implement the typed API wrapper**

First add:

```ts
export class BackendOperationError extends Error {
  code: string;

  constructor(message: string, code = "") {
    super(message);
    this.name = "BackendOperationError";
    this.code = code;
  }
}
```

to `adminBackend.ts`. When the Function response body contains `{ error, code }`, throw `BackendOperationError(error, code)`; all callers that only use `.message` retain their current behavior.

Each upgrade API function delegates to `invokeAdminBackend`, sends no prices/snapshots/dates, and exposes `BackendOperationError.code` for stale quote handling.

- [ ] **Step 4: Load options with the existing billing history**

When both flags allow the feature and a primary subscription store exists, load options alongside billing data. Keep existing subscription/invoice loading, cancellation, PDF, and payment-link behavior unchanged.

Use a focused `refreshUpgradeOptions()` function after confirm/cancel rather than reloading the browser page.

- [ ] **Step 5: Add upgrade and pending-change panels**

The available plan cards show price, interval, features, and limits. The pending panel shows:

- from/to plan;
- target renewal date;
- target amount;
- `scheduled` or `locked`;
- cancellation only for `scheduled` with no invoice.

Render support copy for lower-plan requests without representing it as self-service.

- [ ] **Step 6: Wire quote, modal, stale state, and success feedback**

Open the terms modal only after a successful quote. On confirm:

- send exact terms version, `true`, and fingerprint;
- guard double submission;
- show the backend-confirmed target date and amount;
- close only after success;
- refresh options and billing summary.

On stale quote:

- keep the modal open;
- display `Billing details changed. Review the refreshed terms before confirming.`;
- replace the quote;
- rely on fingerprint change to reset scroll and acknowledgement.

- [ ] **Step 7: Run focused tests and typecheck**

Run:

```powershell
npx vitest run src/pages/store-owner/StoreOwnerSubscription.test.tsx src/components/SubscriptionUpgradeTermsModal.test.tsx
npm run lint
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add src/lib/adminBackend.ts src/lib/subscriptionUpgradeApi.ts src/pages/store-owner/StoreOwnerSubscription.tsx src/pages/store-owner/StoreOwnerSubscription.test.tsx
git commit -m "feat: add owner subscription upgrade workflow"
```

---

### Task 7: Durable Client Notifications and Admin Visibility

**Files:**
- Modify: `supabase/functions/subscription-billing-worker/index.ts:1-570`
- Modify: `scripts/google-drive-upload.gs:100-160`
- Modify: `scripts/email-sender.gs:275-470`
- Modify: `src/pages/admin/AdminStoreDetail.tsx:1-1600`
- Create: `src/pages/admin/AdminStoreDetail.subscriptionUpgrade.test.tsx`

**Interfaces:**
- Consumes `claim_subscription_upgrade_notifications`.
- Produces GAS actions `subscription_upgrade_scheduled`, `subscription_upgrade_applied`, and `subscription_upgrade_cancelled`.

- [ ] **Step 1: Write the admin visibility test**

Verify the admin store detail shows:

- request source/owner;
- from/to plans;
- target renewal;
- amount difference;
- terms version and accepted time;
- status and attached invoice;
- cancellation with a required reason only while safely cancellable.

- [ ] **Step 2: Add notification queue handling to the worker**

After existing billing notifications, claim upgrade notifications. Send this payload:

```ts
{
  action: `subscription_upgrade_${notification.notification_type}`,
  recipientEmail: notification.recipient,
  userName,
  upgrade: {
    fromPlanName,
    toPlanName,
    amountDueTodayCentavos: 0,
    currentAmountCentavos,
    targetAmountCentavos,
    differenceCentavos,
    targetPeriodStart,
    termsVersion,
    renewalMode,
  },
}
```

Reuse bounded retries, quota deferral, and error truncation from the existing billing notification loop.

- [ ] **Step 3: Add GAS routes and email functions without overwriting user work**

Re-read both scripts immediately before editing. Add three explicit routes in `google-drive-upload.gs`.

Add email functions that clearly state:

- PHP 0 charged at scheduling;
- current and target plan;
- price difference;
- target renewal date;
- activation only after verified renewal payment;
- locked or cancelled status where relevant;
- link to `/owner/subscription`.

Do not attach an invoice or receipt to the scheduling email.

- [ ] **Step 4: Add admin read and safe cancellation**

Load owner-scoped plan changes by `store_id`, newest first. Admin cancellation calls `admin_cancel_subscription_upgrade` with a reason. If a change is locked, show the attached invoice and instruct the admin to resolve that invoice through existing billing controls; do not offer local void/replacement.

- [ ] **Step 5: Run tests and static checks**

Run:

```powershell
npx vitest run src/pages/admin/AdminStoreDetail.subscriptionUpgrade.test.tsx
deno check supabase/functions/subscription-billing-worker/index.ts
npm run lint
```

Expected: PASS.

- [ ] **Step 6: Commit only the merged feature changes**

Review `git diff` to ensure pre-existing edits remain intact, then:

```powershell
git add supabase/functions/subscription-billing-worker/index.ts scripts/google-drive-upload.gs scripts/email-sender.gs src/pages/admin/AdminStoreDetail.tsx src/pages/admin/AdminStoreDetail.subscriptionUpgrade.test.tsx
git commit -m "feat: notify and audit subscription upgrades"
```

---

### Task 8: Full Regression, PayMongo Test Mode, and Controlled Rollout

**Files:**
- Modify only if verification exposes a feature defect in files already listed above.

**Interfaces:**
- Verifies the complete feature and unchanged baseline billing lifecycle.

- [ ] **Step 1: Run the complete local automated suite**

Run:

```powershell
npm test
npm run test:auditor
npm run lint
npm run build
deno test supabase/functions/_shared/subscription-upgrade.test.ts
deno check supabase/functions/admin-backend/index.ts
deno check supabase/functions/subscription-billing-worker/index.ts
deno check supabase/functions/subscription-payment-status/index.ts
deno check supabase/functions/paymongo-webhook/index.ts
npx supabase db reset
npx supabase test db
npx supabase db advisors --local
npx supabase migration list --local
```

Expected: all commands pass; generated SEO/service-worker output is reviewed so unrelated generated files are not accidentally committed.

- [ ] **Step 2: Record the baseline no-upgrade PayMongo test**

With `SUBSCRIPTION_UPGRADES_ENABLED=false`:

1. claim a normal test renewal;
2. verify exactly one PayMongo `/test/` Payment Link;
3. verify amount, PHP currency, description, and reference;
4. pay it in PayMongo test mode;
5. verify webhook or reconciliation marks one invoice paid;
6. verify period extension, receipt, and access state match the pre-feature behavior;
7. verify no plan-change row exists.

- [ ] **Step 3: Test an upcoming-renewal upgrade**

With server flag enabled for an internal test store:

1. request a quote before any renewal invoice exists;
2. verify modal computation and acknowledgement gate;
3. confirm and verify no PayMongo link is created at confirmation;
4. run the worker and verify one ordinary renewal invoice/link with target snapshot and amount;
5. pay it;
6. verify the existing fulfillment path applies the target plan once;
7. replay the webhook and run reconciliation; verify no duplicate application or notification.

- [ ] **Step 4: Test an already-issued renewal**

1. create the ordinary upcoming renewal and its PayMongo link first;
2. quote an upgrade;
3. verify the terms identify the following renewal;
4. confirm and verify the existing invoice/link ID, amount, and description are unchanged;
5. pay the existing invoice and verify the current plan renews;
6. generate the following renewal and verify the upgrade attaches only there;
7. pay it and verify the upgrade applies.

- [ ] **Step 5: Test manual renewal and adverse cases**

Verify:

- manual renewal keeps `renewal_mode = 'manual'`;
- unpaid initial and overdue invoices block;
- stale quote resets acknowledgement;
- wrong amount/currency/mode/link ID cannot apply an upgrade;
- expired/void/unpaid target invoice cannot apply;
- concurrent confirms create one active change;
- concurrent workers create one renewal invoice and attach one change;
- owner RLS cannot read another owner's change or write any change.

- [ ] **Step 6: Deploy in dependency order**

After all test-mode checks pass:

1. deploy the database migration;
2. run hosted database advisors and a read-only schema check;
3. deploy `admin-backend`, `subscription-billing-worker`, and `subscription-payment-status`;
4. deploy the merged Google Apps Script email routes;
5. keep both feature flags disabled;
6. repeat the baseline no-upgrade test against hosted test mode;
7. enable the server flag for the internal rollout environment;
8. deploy the frontend with its flag enabled only for the controlled rollout;
9. monitor Edge logs, webhook events, billing failures, and plan-change notification retries.

- [ ] **Step 7: Final diff and status review**

Run:

```powershell
git status --short
git diff --check
git log --oneline -10
```

Expected: only intended feature changes are committed; the user's unrelated working files and documents remain preserved.
