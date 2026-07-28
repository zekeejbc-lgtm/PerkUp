begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(13);

insert into public.users (id, data)
values (
  'paymongo-archive-owner',
  '{"role":"store_owner","email":"archive-test@example.com"}'::jsonb
);

insert into public.stores (id, data)
values (
  'paymongo-archive-store',
  '{"ownerId":"paymongo-archive-owner","businessName":"Archive Test"}'::jsonb
);

insert into public.billing_subscriptions (
  id,
  store_id,
  owner_user_id,
  billing_email,
  plan_id,
  amount_centavos,
  currency,
  interval_days,
  current_period_start,
  current_period_end,
  next_billing_at,
  warning_lead_days,
  grace_period_days,
  status,
  automation_enabled
)
values (
  '00000000-0000-0000-0000-000000000101',
  'paymongo-archive-store',
  'paymongo-archive-owner',
  'archive-test@example.com',
  'starter',
  50000,
  'PHP',
  30,
  '2026-07-01T00:00:00Z',
  '2026-07-31T00:00:00Z',
  '2026-07-31T00:00:00Z',
  7,
  3,
  'active',
  true
);

insert into public.billing_invoices (
  id,
  subscription_id,
  store_id,
  owner_user_id,
  invoice_type,
  period_start,
  period_end,
  due_at,
  amount_centavos,
  currency,
  status,
  next_attempt_at
)
values (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000101',
  'paymongo-archive-store',
  'paymongo-archive-owner',
  'renewal',
  '2026-07-01T00:00:00Z',
  '2026-07-31T00:00:00Z',
  '2026-07-31T00:00:00Z',
  50000,
  'PHP',
  'pending',
  '2026-07-28T00:00:00Z'
);

select is(
  public.begin_paymongo_link_creation(
    '00000000-0000-0000-0000-000000000201',
    'attempt-one',
    '2026-07-28T00:00:00Z'
  ),
  true,
  'an eligible invoice acquires the payment-link creation marker'
);

select is(
  (
    select last_error
    from public.billing_invoices
    where id = '00000000-0000-0000-0000-000000000201'
  ),
  'PAYMONGO_LINK_CREATION_IN_PROGRESS:attempt-one',
  'link creation stores the deletion-blocking marker'
);

select is(
  public.retry_billing_invoice_safely(
    '00000000-0000-0000-0000-000000000201',
    '2026-07-28T00:00:30Z'
  )->>'result',
  'in_progress',
  'an administrative retry cannot clear an active creation marker'
);

select is(
  (
    with updated as (
      update public.billing_invoices
      set paymongo_link_id = 'link-from-wrong-attempt',
          last_error = null
      where id = '00000000-0000-0000-0000-000000000201'
        and last_error = 'PAYMONGO_LINK_CREATION_IN_PROGRESS:attempt-two'
      returning id
    )
    select count(*) from updated
  ),
  0::bigint,
  'a different creation token cannot persist or clear the active attempt'
);

select throws_ok(
  $$select public.begin_store_billing_deletion(array['paymongo-archive-store'])$$,
  '55P03',
  'PayMongo payment-link creation is still in progress. Retry deletion shortly.',
  'store deletion fails while payment-link creation is in progress'
);

update public.billing_invoices
set last_error = null,
    next_attempt_at = '2026-07-28T00:00:00Z'
where id = '00000000-0000-0000-0000-000000000201';

select is(
  public.retry_billing_invoice_safely(
    '00000000-0000-0000-0000-000000000201',
    '2026-07-28T00:00:30Z'
  )->>'result',
  'updated',
  'an invoice can be retried after the creation marker is cleared'
);

select is(
  public.begin_store_billing_deletion(array['paymongo-archive-store']),
  1,
  'store deletion locks and pauses its billing subscription'
);

select ok(
  (
    select status = 'paused' and automation_enabled = false
    from public.billing_subscriptions
    where id = '00000000-0000-0000-0000-000000000101'
  ),
  'the deletion lock disables automated billing'
);

select is(
  public.begin_paymongo_link_creation(
    '00000000-0000-0000-0000-000000000201',
    'attempt-three',
    '2026-07-28T00:01:00Z'
  ),
  false,
  'a paused deletion-locked subscription cannot start link creation'
);

insert into public.stores (id, data)
values (
  'paymongo-expired-store',
  '{"ownerId":"paymongo-archive-owner","businessName":"Expired Test"}'::jsonb
);

insert into public.billing_subscriptions (
  id,
  store_id,
  owner_user_id,
  billing_email,
  plan_id,
  amount_centavos,
  currency,
  interval_days,
  current_period_start,
  current_period_end,
  next_billing_at,
  warning_lead_days,
  grace_period_days,
  status,
  automation_enabled,
  initial_payment_required
)
values (
  '00000000-0000-0000-0000-000000000102',
  'paymongo-expired-store',
  'paymongo-archive-owner',
  'archive-test@example.com',
  'starter',
  50000,
  'PHP',
  30,
  '2026-07-01T00:00:00Z',
  '2026-07-31T00:00:00Z',
  '2026-07-31T00:00:00Z',
  7,
  3,
  'active',
  true,
  true
);

insert into public.billing_invoices (
  id,
  subscription_id,
  store_id,
  owner_user_id,
  invoice_type,
  period_start,
  period_end,
  due_at,
  amount_centavos,
  currency,
  status,
  paid_at,
  next_attempt_at
)
values (
  '00000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000102',
  'paymongo-expired-store',
  'paymongo-archive-owner',
  'initial',
  '2026-07-01T00:00:00Z',
  '2026-07-31T00:00:00Z',
  '2026-07-31T00:00:00Z',
  50000,
  'PHP',
  'paid',
  '2026-07-28T00:00:00Z',
  '2026-07-28T00:00:00Z'
);

select is(
  public.begin_expired_initial_account_deletion(
    array['paymongo-expired-store'],
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000202'
  ),
  false,
  'expired-account deletion refuses an invoice that became paid'
);

select ok(
  (
    select status = 'active' and automation_enabled = true
    from public.billing_subscriptions
    where id = '00000000-0000-0000-0000-000000000102'
  ),
  'refusing paid-account deletion leaves billing active'
);

update public.billing_invoices
set status = 'expired',
    paid_at = null
where id = '00000000-0000-0000-0000-000000000202';

select is(
  public.begin_expired_initial_account_deletion(
    array['paymongo-expired-store'],
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000202'
  ),
  true,
  'expired-account deletion starts only while the invoice is still expired'
);

select ok(
  (
    select status = 'paused' and automation_enabled = false
    from public.billing_subscriptions
    where id = '00000000-0000-0000-0000-000000000102'
  ),
  'validated expired-account deletion pauses automated billing'
);

select * from finish();

rollback;
