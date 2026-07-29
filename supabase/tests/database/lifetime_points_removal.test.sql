begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

insert into public.users(id, data)
values (
  'lifetime-removal-test-customer',
  '{"lifetimeStars":12,"name":"Test Customer","role":"customer"}'::jsonb
);

insert into public.customers(id, data)
values (
  'lifetime-removal-test-customer',
  '{"lifetimeStars":12,"name":"Test Customer"}'::jsonb
);

insert into public.cards(id, data)
values (
  'lifetime-removal-test-card',
  jsonb_build_object(
    'customerId', 'lifetime-removal-test-customer',
    'storeId', 'lifetime-removal-test-store',
    'stars', 0,
    'promoProgress', jsonb_build_object('promotion-test', 2)
  )
);

insert into public.cards(id, data)
values (
  'lifetime-removal-other-card',
  jsonb_build_object(
    'customerId', 'lifetime-removal-test-customer',
    'storeId', 'lifetime-removal-other-store',
    'stars', 7,
    'promoProgress', jsonb_build_object('other-promotion', 4)
  )
);

select public.increment_loyalty_totals(
  'lifetime-removal-test-customer',
  'lifetime-removal-test-card',
  1,
  'lifetime-removal-test-receipt'
);

select is(
  (select (data->>'stars')::integer from public.cards where id = 'lifetime-removal-test-card'),
  1,
  'general loyalty credit updates the targeted store card'
);

select is(
  (select data->'promoProgress' from public.cards where id = 'lifetime-removal-test-card'),
  '{"promotion-test":2}'::jsonb,
  'general loyalty credit preserves promotion progress'
);

select is(
  (select data from public.cards where id = 'lifetime-removal-other-card'),
  '{"stars":7,"storeId":"lifetime-removal-other-store","customerId":"lifetime-removal-test-customer","promoProgress":{"other-promotion":4}}'::jsonb,
  'general loyalty credit leaves other store cards unchanged'
);

select ok(
  not exists (select 1 from public.customers where data ? 'lifetimeStars')
  and not exists (select 1 from public.users where data ? 'lifetimeStars'),
  'legacy lifetime points are stripped and cannot be recreated'
);

select is(
  (select data->>'name' from public.customers where id = 'lifetime-removal-test-customer'),
  'Test Customer',
  'legacy cleanup preserves other customer data'
);

select isnt(
  to_regprocedure('public.increment_loyalty_totals(text,text,integer,text)'),
  null::regprocedure,
  'the rolling-deployment-compatible RPC signature remains available'
);

select is(
  to_regprocedure('public.increment_loyalty_totals(text,text,integer)'),
  null::regprocedure,
  'the obsolete three-argument loyalty RPC overload is absent'
);

select lives_ok(
  $$select public.increment_loyalty_totals(
    'lifetime-removal-test-customer',
    'lifetime-removal-test-card',
    1
  )$$,
  'three-field RPC calls resolve through the defaulted receipt argument'
);

select ok(
  not has_function_privilege('anon', 'public.increment_loyalty_totals(text,text,integer,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.increment_loyalty_totals(text,text,integer,text)', 'execute'),
  'only privileged backend callers can execute the loyalty RPC'
);

select ok(
  has_function_privilege('service_role', 'public.increment_loyalty_totals(text,text,integer,text)', 'execute'),
  'the service-role backend retains loyalty RPC access'
);

select ok(
  position(
    'lifetimeStars' in coalesce((
      select with_check
      from pg_policies
      where schemaname = 'public'
        and tablename = 'users'
        and policyname = 'users scoped update'
    ), '')
  ) = 0,
  'the user profile update policy has no lifetime-points dependency'
);

select * from finish();
rollback;
