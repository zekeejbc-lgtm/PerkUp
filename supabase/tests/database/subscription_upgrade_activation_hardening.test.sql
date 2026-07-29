begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(13);

select has_column(
  'public',
  'system_runtime_config',
  'subscription_upgrades_enabled',
  'runtime config owns the subscription upgrade switch'
);

select col_type_is(
  'public',
  'system_runtime_config',
  'subscription_upgrades_enabled',
  'boolean',
  'subscription upgrade switch is boolean'
);

select col_default_is(
  'public',
  'system_runtime_config',
  'subscription_upgrades_enabled',
  'false',
  'subscription upgrades default to disabled'
);

select has_column(
  'public',
  'system_runtime_config',
  'subscription_upgrades_changed_at',
  'runtime config records when upgrade availability changed'
);

select has_column(
  'public',
  'system_runtime_config',
  'subscription_upgrades_changed_by',
  'runtime config records which auditor changed upgrade availability'
);

select has_function(
  'public',
  'set_subscription_upgrades_enabled',
  array['uuid', 'boolean'],
  'runtime changes use an atomic database function'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.set_subscription_upgrades_enabled(uuid,boolean)',
    'EXECUTE'
  ),
  'authenticated browsers cannot execute the runtime toggle'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.set_subscription_upgrades_enabled(uuid,boolean)',
    'EXECUTE'
  ),
  'the service backend can execute the runtime toggle'
);

insert into auth.users(id, aud, role, email, created_at, updated_at)
values (
  '00000000-0000-0000-0000-0000000000c1',
  'authenticated',
  'authenticated',
  'toggle-auditor@example.com',
  now(),
  now()
);

insert into public.users(id, data)
values (
  '00000000-0000-0000-0000-0000000000c1',
  '{"role":"admin","accountStatus":"active","email":"toggle-auditor@example.com"}'
);

select throws_ok(
  $$select public.set_subscription_upgrades_enabled(
    '00000000-0000-0000-0000-0000000000c1',
    true
  )$$,
  '42501',
  null,
  'a non-auditor service request cannot change the runtime switch'
);

update public.users
set data = jsonb_set(data, '{role}', '"auditor"', true)
where id = '00000000-0000-0000-0000-0000000000c1';

set local role service_role;

select lives_ok(
  $$select public.set_subscription_upgrades_enabled(
    '00000000-0000-0000-0000-0000000000c1',
    true
  )$$,
  'the service backend can atomically enable subscription upgrades'
);

reset role;

select is(
  (
    select subscription_upgrades_enabled
    from public.system_runtime_config
    where id = 'global'
  ),
  true,
  'the atomic toggle stores the requested state'
);

select is(
  (
    select subscription_upgrades_changed_by
    from public.system_runtime_config
    where id = 'global'
  ),
  '00000000-0000-0000-0000-0000000000c1'::uuid,
  'the atomic toggle records the auditor'
);

select results_eq(
  $$
    select actor_role, metadata
    from public.audit_events
    where action = 'set_subscription_upgrades_enabled'
      and actor_user_id = '00000000-0000-0000-0000-0000000000c1'
    order by created_at
  $$,
  $$values (
    'auditor'::text,
    '{"enabled":true,"previousEnabled":false}'::jsonb
  )$$,
  'the runtime change and its exact audit event commit together'
);

select * from finish();
rollback;
