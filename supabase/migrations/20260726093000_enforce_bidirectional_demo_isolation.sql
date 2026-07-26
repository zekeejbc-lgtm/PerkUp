-- Anonymous visitors continue to see the production catalogue, but an
-- authenticated demo identity is confined to its own sandbox. Production
-- identities cannot read demo catalogue rows, while auditors retain visibility
-- for management and diagnosis.
create or replace function private.can_read_store_catalogue(target_store_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.stores s
    where s.id = target_store_id
      and (
        (select private.current_user_is_auditor())
        or (
          (select private.current_user_demo_tenant_id()) is null
          and coalesce(s.data->>'isDemo', 'false') <> 'true'
        )
        or (
          coalesce(s.data->>'isDemo', 'false') = 'true'
          and nullif(s.data->>'demoTenantId', '') is not null
          and (s.data->>'demoTenantId')::uuid = (select private.current_user_demo_tenant_id())
          and (select private.demo_tenant_is_active((s.data->>'demoTenantId')::uuid))
        )
      )
  )
$$;

revoke all on function private.can_read_store_catalogue(text) from public;
grant execute on function private.can_read_store_catalogue(text) to authenticated;
