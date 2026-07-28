begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(2);

set local role service_role;

insert into public.applications (id, data)
values (
  '00000000-0000-0000-0000-000000000001',
  '{"businessName":"Public ID privilege regression"}'::jsonb
);

reset role;

select matches(
  (
    select public_id
    from public.applications
    where id = '00000000-0000-0000-0000-000000000001'
  ),
  '^APP-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$',
  'service-role inserts receive an application public ID'
);

select is(
  has_function_privilege('service_role', 'private.generate_public_id(text)', 'EXECUTE'),
  false,
  'the service role cannot directly execute the private public-ID generator'
);

select * from finish();

rollback;
