begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

select has_function(
  'public',
  'sync_automatic_billing_subscription',
  'automatic billing sync is implemented as one guarded database operation'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.sync_automatic_billing_subscription(text,text,text,text,integer,integer,timestamptz,text,integer,timestamptz,timestamptz,integer,integer,text,boolean)',
    'EXECUTE'
  ),
  'authenticated browsers cannot call the guarded billing sync'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.sync_automatic_billing_subscription(text,text,text,text,integer,integer,timestamptz,text,integer,timestamptz,timestamptz,integer,integer,text,boolean)',
    'EXECUTE'
  ),
  'the service backend can call the guarded billing sync'
);

insert into public.users(id, data) values (
  '00000000-0000-0000-0000-0000000000c1',
  '{"role":"store_owner","email":"period-guard@example.com"}'
);

insert into public.stores(id, data) values (
  'subscription-period-guard-store',
  '{"ownerId":"00000000-0000-0000-0000-0000000000c1","isPrimaryBranch":true,"subscriptionLevel":"standard","owedAmount":999}'
);

insert into public.billing_subscriptions(
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
  status,
  automation_enabled,
  renewal_mode,
  initial_payment_required
) values (
  '10000000-0000-0000-0000-0000000000c1',
  'subscription-period-guard-store',
  '00000000-0000-0000-0000-0000000000c1',
  'period-guard@example.com',
  'standard',
  99900,
  'PHP',
  30,
  '2026-07-01T00:00:00Z',
  '2026-07-31T00:00:00Z',
  '2026-07-31T00:00:00Z',
  'active',
  true,
  'automatic',
  false
);

insert into public.subscription_plan_changes(
  id,
  subscription_id,
  store_id,
  owner_user_id,
  status,
  from_plan_id,
  to_plan_id,
  from_plan_snapshot,
  to_plan_snapshot,
  current_amount_centavos,
  target_amount_centavos,
  difference_centavos,
  target_period_start,
  target_period_end,
  terms_version,
  terms_accepted_at,
  terms_accepted_by,
  quote_fingerprint
) values (
  '30000000-0000-0000-0000-0000000000c1',
  '10000000-0000-0000-0000-0000000000c1',
  'subscription-period-guard-store',
  '00000000-0000-0000-0000-0000000000c1',
  'scheduled',
  'standard',
  'premium',
  '{"id":"standard","name":"Standard"}',
  '{"id":"premium","name":"Premium"}',
  99900,
  199900,
  100000,
  '2026-07-31T00:00:00Z',
  '2026-08-30T00:00:00Z',
  'subscription-upgrade-v1',
  '2026-07-20T00:00:00Z',
  '00000000-0000-0000-0000-0000000000c1',
  'period-guard-fingerprint'
);

select lives_ok(
  $$select public.sync_automatic_billing_subscription(
    'subscription-period-guard-store',
    '00000000-0000-0000-0000-0000000000c1',
    'period-guard@example.com',
    'standard',
    99900,
    null,
    null,
    'PHP',
    30,
    '2026-07-01T00:00:00Z',
    '2026-07-31T00:00:00Z',
    7,
    3,
    'active',
    false
  )$$,
  'unchanged billing facts remain synchronizable while an upgrade is active'
);

select throws_ok(
  $$select public.sync_automatic_billing_subscription(
    'subscription-period-guard-store',
    '00000000-0000-0000-0000-0000000000c1',
    'period-guard@example.com',
    'standard',
    99900,
    null,
    null,
    'PHP',
    30,
    '2026-06-01T00:00:00Z',
    '2026-07-01T00:00:00Z',
    7,
    3,
    'active',
    false
  )$$,
  '55000',
  null,
  'an active upgrade blocks manual billing-period changes'
);

select is(
  (
    select current_period_end
    from public.billing_subscriptions
    where id = '10000000-0000-0000-0000-0000000000c1'
  ),
  '2026-07-31T00:00:00Z'::timestamptz,
  'a rejected date edit leaves the billing period unchanged'
);

select * from finish();
rollback;
