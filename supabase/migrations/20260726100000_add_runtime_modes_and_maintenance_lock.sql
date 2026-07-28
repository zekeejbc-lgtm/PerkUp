create table public.system_runtime_config (
  id text primary key default 'global'
    check (id = 'global'),
  mode text not null default 'production'
    check (mode in ('production', 'development', 'maintenance')),
  mode_before_maintenance text not null default 'production'
    check (mode_before_maintenance in ('production', 'development')),
  maintenance_title text not null default 'Scheduled maintenance'
    check (char_length(maintenance_title) between 1 and 120),
  maintenance_reason text not null default 'Perk is temporarily unavailable while maintenance is in progress.'
    check (char_length(maintenance_reason) between 1 and 2000),
  maintenance_details text not null default ''
    check (char_length(maintenance_details) <= 4000),
  maintenance_started_at timestamptz,
  maintenance_started_by uuid references auth.users(id) on delete set null,
  mode_changed_at timestamptz not null default now(),
  mode_changed_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.system_runtime_config (id, mode)
values ('global', 'production');

create index system_runtime_config_started_by_idx
  on public.system_runtime_config (maintenance_started_by)
  where maintenance_started_by is not null;
create index system_runtime_config_changed_by_idx
  on public.system_runtime_config (mode_changed_by)
  where mode_changed_by is not null;

alter table public.system_runtime_config enable row level security;
revoke all on public.system_runtime_config from public, anon, authenticated;
grant select (
  id,
  mode,
  mode_before_maintenance,
  maintenance_title,
  maintenance_reason,
  maintenance_details,
  maintenance_started_at,
  mode_changed_at,
  updated_at
) on public.system_runtime_config to anon, authenticated;
grant select, insert, update, delete on public.system_runtime_config to service_role;

create policy "runtime config public read"
on public.system_runtime_config
for select
to anon, authenticated
using (id = 'global');

drop trigger if exists set_system_runtime_config_updated_at on public.system_runtime_config;
create trigger set_system_runtime_config_updated_at
before update on public.system_runtime_config
for each row execute function public.set_updated_at();

create or replace function private.current_runtime_mode()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select config.mode
    from public.system_runtime_config config
    where config.id = 'global'
  ), 'maintenance')
$$;

create or replace function private.runtime_allows_app_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.current_runtime_mode()) <> 'maintenance'
$$;

revoke all on function private.current_runtime_mode() from public;
revoke all on function private.runtime_allows_app_access() from public;
grant execute on function private.current_runtime_mode() to anon, authenticated;
grant execute on function private.runtime_allows_app_access() to anon, authenticated;

-- A single restrictive policy per exposed table is composable with the
-- existing tenant policies. During maintenance it makes every direct Data API
-- read and write fail closed, regardless of the URL or client implementation.
do $$
declare
  target_table record;
begin
  for target_table in
    select cls.relname
    from pg_class cls
    join pg_namespace ns on ns.oid = cls.relnamespace
    where ns.nspname = 'public'
      and cls.relkind = 'r'
      and cls.relrowsecurity
      and cls.relname <> 'system_runtime_config'
  loop
    execute format(
      'create policy %I on public.%I as restrictive for all to anon, authenticated using ((select private.runtime_allows_app_access())) with check ((select private.runtime_allows_app_access()))',
      'maintenance runtime gate',
      target_table.relname
    );
  end loop;
end
$$;

-- A demo administrator is a sandbox preview role, never a production
-- administrator at the database layer.
alter table public.demo_accounts
  drop constraint demo_accounts_role_check;
alter table public.demo_accounts
  add constraint demo_accounts_role_check
  check (role in ('customer', 'staff', 'store_owner', 'admin'));

create or replace function private.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select private.current_runtime_mode()) = 'maintenance'
      then 'maintenance'
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
    when u.data->>'role' in ('assistant_admin', 'auditor')
      then 'admin'
    else u.data->>'role'
  end
  from public.users u
  where u.id = (select auth.uid())::text
$$;

revoke all on function private.current_user_role() from public;
grant execute on function private.current_user_role() to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'system_runtime_config'
  ) then
    alter publication supabase_realtime add table public.system_runtime_config;
  end if;
end
$$;
