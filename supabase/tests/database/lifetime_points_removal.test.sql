begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(5);

insert into public.customers(id, data)
values (
  'lifetime-removal-test-customer',
  '{"name":"Test Customer"}'::jsonb
);

insert into public.cards(id, data)
values (
  'lifetime-removal-test-card',
  jsonb_build_object(
    'customerId', 'lifetime-removal-test-customer',
    'storeId', 'lifetime-removal-test-store',
    'stars', 0
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

select ok(
  not exists (select 1 from public.customers where data ? 'lifetimeStars')
  and not exists (select 1 from public.users where data ? 'lifetimeStars'),
  'stored customer data and general loyalty credit contain no lifetime points'
);

select isnt(
  to_regprocedure('public.increment_loyalty_totals(text,text,integer,text)'),
  null::regprocedure,
  'the rolling-deployment-compatible RPC signature remains available'
);

select ok(
  not has_function_privilege('anon', 'public.increment_loyalty_totals(text,text,integer,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.increment_loyalty_totals(text,text,integer,text)', 'execute'),
  'only privileged backend callers can execute the loyalty RPC'
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
