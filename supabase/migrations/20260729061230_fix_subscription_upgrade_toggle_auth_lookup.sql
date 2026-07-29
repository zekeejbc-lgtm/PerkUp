create or replace function public.set_subscription_upgrades_enabled(
  p_actor_user_id uuid,
  p_enabled boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_data jsonb;
  previous_enabled boolean;
  changed_at timestamptz := clock_timestamp();
begin
  select profile.data
  into actor_data
  from public.users profile
  where profile.id = p_actor_user_id::text
  for share;
  if not found
    or actor_data->>'role' is distinct from 'auditor'
    or coalesce(actor_data->>'accountStatus', 'active') <> 'active'
  then
    raise exception 'Only an active auditor can change subscription upgrade availability.'
      using errcode = '42501';
  end if;

  select config.subscription_upgrades_enabled
  into previous_enabled
  from public.system_runtime_config config
  where config.id = 'global'
  for update;
  if not found then
    raise exception 'Runtime configuration was not found.' using errcode = 'P0002';
  end if;

  update public.system_runtime_config
  set subscription_upgrades_enabled = p_enabled,
      subscription_upgrades_changed_at = changed_at,
      subscription_upgrades_changed_by = p_actor_user_id
  where id = 'global';

  insert into public.audit_events (
    actor_user_id,
    actor_email,
    actor_role,
    action,
    entity_type,
    entity_id,
    outcome,
    source,
    metadata,
    created_at
  ) values (
    p_actor_user_id,
    nullif(btrim(actor_data->>'email'), ''),
    'auditor',
    'set_subscription_upgrades_enabled',
    'system_runtime',
    'global',
    'success',
    'admin_backend',
    jsonb_build_object(
      'previousEnabled', previous_enabled,
      'enabled', p_enabled
    ),
    changed_at
  );

  return jsonb_build_object(
    'subscription_upgrades_enabled', p_enabled,
    'subscription_upgrades_changed_at', changed_at,
    'subscription_upgrades_changed_by', p_actor_user_id,
    'previousEnabled', previous_enabled
  );
end;
$$;

revoke all on function public.set_subscription_upgrades_enabled(
  uuid, boolean
) from public, anon, authenticated;
grant execute on function public.set_subscription_upgrades_enabled(
  uuid, boolean
) to service_role;
