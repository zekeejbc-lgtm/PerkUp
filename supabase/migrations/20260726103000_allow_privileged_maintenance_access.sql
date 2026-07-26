-- Keep public and tenant access fail-closed during maintenance while allowing
-- active, non-demo administrators and auditors to operate and recover the app.
create or replace function private.runtime_allows_app_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select private.current_runtime_mode()) <> 'maintenance'
    or exists (
      select 1
      from public.users u
      where u.id = (select auth.uid())::text
        and coalesce(u.data->>'accountStatus', 'active') = 'active'
        and coalesce(u.data->>'isDemo', 'false') <> 'true'
        and u.data->>'role' in ('admin', 'assistant_admin', 'auditor')
    )
$$;

revoke all on function private.runtime_allows_app_access() from public;
grant execute on function private.runtime_allows_app_access() to anon, authenticated;

create or replace function private.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce(u.data->>'accountStatus', 'active') in ('suspended', 'banned')
      then u.data->>'accountStatus'
    when coalesce(u.data->>'isDemo', 'false') = 'true'
      and (
        nullif(u.data->>'demoTenantId', '') is null
        or not exists (
          select 1
          from public.demo_tenants dt
          where dt.id = (u.data->>'demoTenantId')::uuid
            and dt.status = 'active'
            and dt.expires_at > now()
        )
      )
      then 'expired'
    when coalesce(u.data->>'isDemo', 'false') = 'true'
      and u.data->>'role' = 'admin'
      then 'demo_admin'
    when coalesce(u.data->>'isDemo', 'false') <> 'true'
      and u.data->>'role' in ('admin', 'assistant_admin', 'auditor')
      then 'admin'
    when (select private.current_runtime_mode()) = 'maintenance'
      then 'maintenance'
    else u.data->>'role'
  end
  from public.users u
  where u.id = (select auth.uid())::text
$$;

revoke all on function private.current_user_role() from public;
grant execute on function private.current_user_role() to authenticated;
