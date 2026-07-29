begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(1);

insert into auth.users(id, aud, role, email, created_at, updated_at)
values (
  '00000000-0000-0000-0000-0000000000d1',
  'authenticated',
  'authenticated',
  'promotion-time-test@example.com',
  now(),
  now()
);

insert into public.stores(id, data)
values (
  'promotion-time-test-store',
  '{"name":"Promotion time test store"}'::jsonb
);

insert into public.promotions(id, data)
values (
  'promotion-time-test-promotion',
  jsonb_build_object(
    'storeId', 'promotion-time-test-store',
    'active', true,
    'requiredStamps', 1,
    'claimExpiryDays', 1,
    'startDate', to_char(
      statement_timestamp() at time zone 'Asia/Manila' - interval '1 hour',
      'YYYY-MM-DD"T"HH24:MI'
    ),
    'endDate', to_char(
      statement_timestamp() at time zone 'Asia/Manila' + interval '1 day',
      'YYYY-MM-DD"T"HH24:MI'
    )
  )
);

insert into public.cards(id, data)
values (
  'promotion-time-test-card',
  jsonb_build_object(
    'customerId', '00000000-0000-0000-0000-0000000000d1',
    'storeId', 'promotion-time-test-store',
    'status', 'active',
    'promoProgress', jsonb_build_object('promotion-time-test-promotion', 1)
  )
);

select lives_ok(
  $$select public.claim_promotion_reward(
    '00000000-0000-0000-0000-0000000000d1',
    'promotion-time-test-promotion'
  )$$,
  'a completed promotion that started in Philippine local time can be claimed'
);

select * from finish();
rollback;
