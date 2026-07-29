begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(2);

select is(
  to_regprocedure('public.increment_loyalty_totals(text,text,integer)'),
  null::regprocedure,
  'the obsolete three-argument loyalty RPC overload is absent'
);

insert into public.customers(id, data)
values (
  'loyalty-signature-test-customer',
  '{}'::jsonb
);

insert into public.cards(id, data)
values (
  'loyalty-signature-test-card',
  jsonb_build_object(
    'customerId', 'loyalty-signature-test-customer',
    'storeId', 'loyalty-signature-test-store',
    'stars', 0
  )
);

select lives_ok(
  $$select public.increment_loyalty_totals(
    'loyalty-signature-test-customer',
    'loyalty-signature-test-card',
    1
  )$$,
  'the three-field RPC payload resolves to the current loyalty function'
);

select * from finish();
rollback;
