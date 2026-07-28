begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(28);

select has_table('public', 'subscription_plan_changes');
select has_table('public', 'subscription_plan_change_notifications');
select has_column('public', 'billing_invoices', 'subscription_plan_change_id');
select has_column('public', 'billing_invoices', 'plan_id_snapshot');
select has_column('public', 'billing_invoices', 'plan_name_snapshot');
select has_column('public', 'billing_invoices', 'plan_snapshot');
select has_function('public', 'confirm_subscription_upgrade');
select has_function('public', 'cancel_subscription_upgrade');

select policies_are(
  'public',
  'subscription_plan_changes',
  array['subscription_plan_changes_read_own_or_admin']
);

insert into public.users(id, data) values
  ('00000000-0000-0000-0000-0000000000a1', '{"role":"store_owner","email":"a@example.com"}'),
  ('00000000-0000-0000-0000-0000000000b1', '{"role":"store_owner","email":"b@example.com"}');

insert into public.stores(id, data) values
  (
    'upgrade-test-store-a',
    '{"ownerId":"00000000-0000-0000-0000-0000000000a1","isPrimaryBranch":true,"subscriptionLevel":"standard","owedAmount":999,"subscriptionDependencies":{"customerLimit":1000,"staffLimit":1,"branchLimit":1,"galleryPhotoLimit":3}}'
  ),
  (
    'upgrade-test-store-b',
    '{"ownerId":"00000000-0000-0000-0000-0000000000b1","isPrimaryBranch":true,"subscriptionLevel":"standard","owedAmount":999}'
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
) values
  (
    '10000000-0000-0000-0000-000000000001',
    'upgrade-test-store-a',
    '00000000-0000-0000-0000-0000000000a1',
    'a@example.com',
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
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'upgrade-test-store-b',
    '00000000-0000-0000-0000-0000000000b1',
    'b@example.com',
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

select lives_ok(
  $$select public.confirm_subscription_upgrade(
    'upgrade-test-store-a',
    '00000000-0000-0000-0000-0000000000a1',
    '{"id":"standard","name":"Standard","order":0,"priceCentavos":99900,"interval":"month","intervalDays":30,"features":["Basic analytics"],"dependencies":{"customerLimit":1000,"staffLimit":1,"branchLimit":1,"galleryPhotoLimit":3}}',
    '{"id":"premium","name":"Premium","order":1,"priceCentavos":199900,"interval":"month","intervalDays":30,"features":["Basic analytics","Priority support"],"dependencies":{"customerLimit":10000,"staffLimit":5,"branchLimit":3,"galleryPhotoLimit":6}}',
    99900,
    199900,
    '2026-07-31T00:00:00Z',
    '2026-08-30T00:00:00Z',
    'subscription-upgrade-v1',
    'fingerprint-test-a-0001',
    '2026-07-20T00:00:00Z'
  )$$,
  'an upgrade can target the upcoming renewal before its invoice exists'
);

select is(
  (
    select target_period_start
    from public.subscription_plan_changes
    where subscription_id = '10000000-0000-0000-0000-000000000001'
  ),
  '2026-07-31T00:00:00Z'::timestamptz,
  'the unissued upcoming renewal is selected'
);

select throws_ok(
  $$select public.confirm_subscription_upgrade(
    'upgrade-test-store-a',
    '00000000-0000-0000-0000-0000000000a1',
    '{"id":"standard","name":"Standard","order":0,"priceCentavos":99900,"interval":"month","intervalDays":30,"features":["Basic analytics"],"dependencies":{"customerLimit":1000,"staffLimit":1,"branchLimit":1,"galleryPhotoLimit":3}}',
    '{"id":"premium","name":"Premium","order":1,"priceCentavos":199900,"interval":"month","intervalDays":30,"features":["Basic analytics","Priority support"],"dependencies":{"customerLimit":10000,"staffLimit":5,"branchLimit":3,"galleryPhotoLimit":6}}',
    99900,
    199900,
    '2026-07-31T00:00:00Z',
    '2026-08-30T00:00:00Z',
    'subscription-upgrade-v1',
    'fingerprint-duplicate-0001',
    '2026-07-20T00:00:00Z'
  )$$,
  '23505',
  null,
  'a subscription cannot have two active plan changes'
);

insert into public.billing_invoices(
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
  paymongo_link_id,
  paymongo_reference_number,
  payment_url,
  livemode
) values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'upgrade-test-store-a',
  '00000000-0000-0000-0000-0000000000a1',
  'renewal',
  '2026-07-31T00:00:00Z',
  '2026-08-30T00:00:00Z',
  '2026-07-31T00:00:00Z',
  99900,
  'PHP',
  'link_created',
  'link_upgrade_test',
  'ref_upgrade_test',
  'https://paymongo.test/upgrade',
  false
);

select is(
  (
    select amount_centavos
    from public.billing_invoices
    where id = '20000000-0000-0000-0000-000000000001'
  ),
  199900,
  'invoice insertion uses the acknowledged target amount'
);

select is(
  (
    select plan_id_snapshot
    from public.billing_invoices
    where id = '20000000-0000-0000-0000-000000000001'
  ),
  'premium',
  'invoice insertion stores the immutable target plan id'
);

select is(
  (
    select status
    from public.subscription_plan_changes
    where renewal_invoice_id = '20000000-0000-0000-0000-000000000001'
  ),
  'locked',
  'invoice insertion locks the matching scheduled upgrade'
);

update public.billing_invoices
set status = 'paid',
    paid_at = '2026-07-31T00:00:00Z'
where id = '20000000-0000-0000-0000-000000000001';

select is(
  (
    select plan_id
    from public.billing_subscriptions
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  'premium',
  'paid target renewal applies the normalized active plan'
);

select is(
  (
    select data->>'subscriptionLevel'
    from public.stores
    where id = 'upgrade-test-store-a'
  ),
  'premium',
  'paid target renewal mirrors the active plan into the store'
);

select is(
  (
    select (data->'subscriptionDependencies'->>'staffLimit')::integer
    from public.stores
    where id = 'upgrade-test-store-a'
  ),
  5,
  'paid target renewal mirrors the acknowledged limits'
);

select is(
  (
    select count(*)::integer
    from public.subscription_plan_change_notifications
    where notification_type = 'applied'
  ),
  1,
  'plan application queues one applied notification'
);

update public.billing_invoices
set status = 'paid'
where id = '20000000-0000-0000-0000-000000000001';

select is(
  (
    select count(*)::integer
    from public.subscription_plan_change_notifications
    where notification_type = 'applied'
  ),
  1,
  'a repeated paid update does not queue a duplicate notification'
);

insert into public.billing_invoices(
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
  paymongo_link_id,
  paymongo_reference_number,
  payment_url,
  livemode
) values (
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002',
  'upgrade-test-store-b',
  '00000000-0000-0000-0000-0000000000b1',
  'renewal',
  '2026-07-31T00:00:00Z',
  '2026-08-30T00:00:00Z',
  '2026-07-31T00:00:00Z',
  99900,
  'PHP',
  'link_created',
  'link_existing_renewal',
  'ref_existing_renewal',
  'https://paymongo.test/existing-renewal',
  false
);

select is(
  (
    select amount_centavos
    from public.billing_invoices
    where id = '20000000-0000-0000-0000-000000000002'
  ),
  99900,
  'an already-issued renewal keeps its original amount'
);

select lives_ok(
  $$select public.confirm_subscription_upgrade(
    'upgrade-test-store-b',
    '00000000-0000-0000-0000-0000000000b1',
    '{"id":"standard","name":"Standard","order":0,"priceCentavos":99900,"interval":"month","intervalDays":30,"features":["Basic analytics"],"dependencies":{"customerLimit":1000,"staffLimit":1,"branchLimit":1,"galleryPhotoLimit":3}}',
    '{"id":"premium","name":"Premium","order":1,"priceCentavos":199900,"interval":"month","intervalDays":30,"features":["Basic analytics","Priority support"],"dependencies":{"customerLimit":10000,"staffLimit":5,"branchLimit":3,"galleryPhotoLimit":6}}',
    99900,
    199900,
    '2026-08-30T00:00:00Z',
    '2026-09-29T00:00:00Z',
    'subscription-upgrade-v1',
    'fingerprint-test-b-0001',
    '2026-07-20T00:00:00Z'
  )$$,
  'an already-issued renewal moves the upgrade to the following renewal'
);

select is(
  (
    select target_period_start
    from public.subscription_plan_changes
    where subscription_id = '10000000-0000-0000-0000-000000000002'
  ),
  '2026-08-30T00:00:00Z'::timestamptz,
  'the following renewal is selected after an invoice already exists'
);

select is(
  (
    select renewal_invoice_id
    from public.subscription_plan_changes
    where subscription_id = '10000000-0000-0000-0000-000000000002'
  ),
  null::uuid,
  'the future upgrade remains unattached until its target invoice is created'
);

select lives_ok(
  $$select public.cancel_subscription_upgrade(
    (
      select id
      from public.subscription_plan_changes
      where subscription_id = '10000000-0000-0000-0000-000000000002'
    ),
    '00000000-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-0000000000b1',
    '2026-07-21T00:00:00Z'
  )$$,
  'an owner can cancel an upgrade before it is attached to an invoice'
);

select is(
  (
    select status
    from public.subscription_plan_changes
    where subscription_id = '10000000-0000-0000-0000-000000000002'
  ),
  'cancelled',
  'cancellation records the terminal plan-change status'
);

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is(
  (
    select count(*)::integer
    from public.subscription_plan_changes
    where owner_user_id = '00000000-0000-0000-0000-0000000000a1'
  ),
  1,
  'an owner can read their own plan change'
);

select is(
  (
    select count(*)::integer
    from public.subscription_plan_changes
    where owner_user_id = '00000000-0000-0000-0000-0000000000b1'
  ),
  0,
  'an owner cannot read another owner plan change'
);

reset role;

select * from finish();
rollback;
