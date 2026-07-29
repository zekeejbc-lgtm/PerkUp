begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

select has_table(
  'private',
  'primary_auditor_authority',
  'primary auditor authority has a database-owned source of truth'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.transfer_primary_auditor_authority(text,text)',
    'EXECUTE'
  ),
  'authenticated browsers cannot call the authority transfer directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.transfer_primary_auditor_authority(text,text)',
    'EXECUTE'
  ),
  'only the service backend can invoke the authority transfer'
);

insert into public.users (id, data)
values
  (
    '00000000-0000-0000-0000-0000000000a1',
    '{"email":"ezequieljohncrisostomo20@gmail.com","name":"Current Auditor","role":"auditor","accountStatus":"active"}'
  ),
  (
    '00000000-0000-0000-0000-0000000000a2',
    '{"email":"replacement@example.com","name":"Replacement","role":"admin","accountStatus":"active"}'
  );

select is(
  public.get_primary_auditor_user_id(),
  '00000000-0000-0000-0000-0000000000a1',
  'the existing protected auditor is claimed as the initial primary auditor'
);

select throws_ok(
  $$delete from public.users where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '42501',
  'Transfer primary auditor authority before deleting this account.',
  'the current primary auditor cannot be deleted'
);

set local role service_role;

select lives_ok(
  $$select public.transfer_primary_auditor_authority(
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000a2'
  )$$,
  'the service backend transfers authority atomically'
);

select is(
  public.get_primary_auditor_user_id(),
  '00000000-0000-0000-0000-0000000000a2',
  'the replacement becomes the primary auditor'
);

reset role;

select is(
  (select data->>'role' from public.users where id = '00000000-0000-0000-0000-0000000000a2'),
  'auditor',
  'the replacement is promoted to auditor'
);

select is(
  (select data->>'role' from public.users where id = '00000000-0000-0000-0000-0000000000a1'),
  'admin',
  'the previous auditor becomes a super administrator'
);

select results_eq(
  $$
    select actor_user_id, actor_role, action, entity_id, source
    from public.audit_events
    where action = 'transfer_auditor_authority'
      and actor_user_id = '00000000-0000-0000-0000-0000000000a1'
  $$,
  $$values (
    '00000000-0000-0000-0000-0000000000a1'::uuid,
    'auditor'::text,
    'transfer_auditor_authority'::text,
    '00000000-0000-0000-0000-0000000000a2'::text,
    'database'::text
  )$$,
  'the authority switch and its audit event commit together'
);

select throws_ok(
  $$update public.users
    set data = jsonb_set(data, '{role}', '"admin"', true)
    where id = '00000000-0000-0000-0000-0000000000a2'$$,
  '42501',
  'Transfer primary auditor authority before changing this account role or status.',
  'the replacement cannot be demoted without another transfer'
);

select lives_ok(
  $$delete from public.users where id = '00000000-0000-0000-0000-0000000000a1'$$,
  'the former auditor can be deleted after authority is transferred'
);

select * from finish();
rollback;
