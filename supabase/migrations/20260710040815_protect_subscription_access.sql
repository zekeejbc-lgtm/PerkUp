create or replace function private.protect_store_subscription_access()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  if old.data->'subscriptionAccess' is distinct from new.data->'subscriptionAccess'
    and coalesce((select private.current_user_role()), '') not in ('admin', 'assistant_admin')
  then
    raise exception 'Only an administrator can change subscription access controls.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_store_subscription_access() from public, anon, authenticated;

drop trigger if exists protect_store_subscription_access on public.stores;
create trigger protect_store_subscription_access
before update on public.stores
for each row
execute function private.protect_store_subscription_access();
