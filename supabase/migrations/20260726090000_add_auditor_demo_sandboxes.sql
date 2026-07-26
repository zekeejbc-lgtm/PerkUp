create table public.demo_tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  slug text not null check (
    char_length(slug) between 3 and 48
    and slug = lower(slug)
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  status text not null default 'active'
    check (status in ('active', 'deactivated', 'expired')),
  store_id text not null unique references public.stores(id) on delete restrict,
  owner_user_id uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  deactivated_at timestamptz,
  deactivated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint demo_tenants_expiry_after_creation check (expires_at > created_at)
);

create unique index demo_tenants_slug_unique_idx on public.demo_tenants (lower(slug));
create index demo_tenants_status_expiry_idx
  on public.demo_tenants (status, expires_at, created_at desc);
create index demo_tenants_created_by_idx
  on public.demo_tenants (created_by, created_at desc)
  where created_by is not null;
create index demo_tenants_owner_user_id_idx
  on public.demo_tenants (owner_user_id)
  where owner_user_id is not null;
create index demo_tenants_deactivated_by_idx
  on public.demo_tenants (deactivated_by)
  where deactivated_by is not null;

create table public.demo_accounts (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.demo_tenants(id) on delete cascade,
  role text not null check (role in ('customer', 'staff', 'store_owner')),
  email text not null check (char_length(email) between 3 and 254),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  status text not null default 'active'
    check (status in ('active', 'deactivated', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create index demo_accounts_tenant_role_status_idx
  on public.demo_accounts (tenant_id, role, status, created_at);
create index demo_accounts_active_tenant_idx
  on public.demo_accounts (tenant_id, created_at)
  where status = 'active';

alter table public.demo_tenants enable row level security;
alter table public.demo_accounts enable row level security;
revoke all on public.demo_tenants, public.demo_accounts from public, anon, authenticated;
grant select, insert, update, delete on public.demo_tenants, public.demo_accounts to service_role;

drop trigger if exists set_demo_tenants_updated_at on public.demo_tenants;
create trigger set_demo_tenants_updated_at
before update on public.demo_tenants
for each row execute function public.set_updated_at();

drop trigger if exists set_demo_accounts_updated_at on public.demo_accounts;
create trigger set_demo_accounts_updated_at
before update on public.demo_accounts
for each row execute function public.set_updated_at();

create or replace function private.current_user_demo_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce(u.data->>'isDemo', 'false') = 'true'
      and nullif(u.data->>'demoTenantId', '') is not null
    then (u.data->>'demoTenantId')::uuid
    else null
  end
  from public.users u
  where u.id = (select auth.uid())::text
$$;

create or replace function private.current_user_is_auditor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select u.data->>'role' = 'auditor'
      and coalesce(u.data->>'accountStatus', 'active') = 'active'
    from public.users u
    where u.id = (select auth.uid())::text
  ), false)
$$;

create or replace function private.demo_tenant_is_active(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_tenant_id is not null and exists (
    select 1
    from public.demo_tenants dt
    where dt.id = target_tenant_id
      and dt.status = 'active'
      and dt.expires_at > now()
  )
$$;

revoke all on function private.current_user_demo_tenant_id() from public;
revoke all on function private.current_user_is_auditor() from public;
revoke all on function private.demo_tenant_is_active(uuid) from public;
grant execute on function private.current_user_demo_tenant_id() to authenticated;
grant execute on function private.current_user_is_auditor() to authenticated;
grant execute on function private.demo_tenant_is_active(uuid) to authenticated;

-- Expired and deactivated demo accounts resolve to a non-privileged role even
-- while an old JWT remains valid. This makes all role-aware RLS policies fail
-- closed without waiting for an Auth token refresh.
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
    when u.data->>'role' in ('assistant_admin', 'auditor')
      then 'admin'
    else u.data->>'role'
  end
  from public.users u
  where u.id = (select auth.uid())::text
$$;

revoke all on function private.current_user_role() from public;
grant execute on function private.current_user_role() to authenticated;

-- Store ownership must also fail closed for expired demo tenants. Several
-- catalogue policies call owns_store directly, so checking only the role helper
-- would leave a bypass.
create or replace function private.owns_store(target_store_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.stores s
    join public.users u on u.id = (select auth.uid())::text
    where s.id = target_store_id
      and s.data->>'ownerId' = (select auth.uid())::text
      and u.data->>'role' = 'store_owner'
      and coalesce(u.data->>'accountStatus', 'active') = 'active'
      and (
        coalesce(u.data->>'isDemo', 'false') <> 'true'
        or exists (
          select 1
          from public.demo_tenants dt
          where dt.id = (u.data->>'demoTenantId')::uuid
            and dt.status = 'active'
            and dt.expires_at > now()
        )
      )
  )
$$;

revoke all on function private.owns_store(text) from public;
grant execute on function private.owns_store(text) to authenticated;

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
        coalesce(s.data->>'isDemo', 'false') <> 'true'
        or (
          (select private.current_user_is_auditor())
          or (
            nullif(s.data->>'demoTenantId', '') is not null
            and (s.data->>'demoTenantId')::uuid = (select private.current_user_demo_tenant_id())
            and (select private.demo_tenant_is_active((s.data->>'demoTenantId')::uuid))
          )
        )
      )
  )
$$;

revoke all on function private.can_read_store_catalogue(text) from public;
grant execute on function private.can_read_store_catalogue(text) to authenticated;

drop policy if exists "stores public read" on public.stores;
drop policy if exists "stores production public read" on public.stores;
drop policy if exists "stores scoped authenticated read" on public.stores;
create policy "stores production public read"
on public.stores for select to anon
using (coalesce(data->>'isDemo', 'false') <> 'true');
create policy "stores scoped authenticated read"
on public.stores for select to authenticated
using ((select private.can_read_store_catalogue(id)));

drop policy if exists "promotions public read" on public.promotions;
drop policy if exists "promotions production public read" on public.promotions;
drop policy if exists "promotions scoped authenticated read" on public.promotions;
create policy "promotions production public read"
on public.promotions for select to anon
using (
  not exists (
    select 1 from public.stores s
    where s.id = promotions.data->>'storeId'
      and coalesce(s.data->>'isDemo', 'false') = 'true'
  )
);
create policy "promotions scoped authenticated read"
on public.promotions for select to authenticated
using ((select private.can_read_store_catalogue(data->>'storeId')));

drop policy if exists "products public read" on public.products;
drop policy if exists "products production public read" on public.products;
drop policy if exists "products scoped authenticated read" on public.products;
create policy "products production public read"
on public.products for select to anon
using (
  not exists (
    select 1 from public.stores s
    where s.id = products.data->>'storeId'
      and coalesce(s.data->>'isDemo', 'false') = 'true'
  )
);
create policy "products scoped authenticated read"
on public.products for select to authenticated
using ((select private.can_read_store_catalogue(data->>'storeId')));

drop policy if exists "store reviews public read" on public.store_reviews;
drop policy if exists "store reviews production public read" on public.store_reviews;
drop policy if exists "store reviews scoped authenticated read" on public.store_reviews;
create policy "store reviews production public read"
on public.store_reviews for select to anon
using (
  not exists (
    select 1 from public.stores s
    where s.id = store_reviews.data->>'storeId'
      and coalesce(s.data->>'isDemo', 'false') = 'true'
  )
);
create policy "store reviews scoped authenticated read"
on public.store_reviews for select to authenticated
using ((select private.can_read_store_catalogue(data->>'storeId')));
create policy "store reviews demo boundary insert"
on public.store_reviews as restrictive for insert to authenticated
with check ((select private.can_read_store_catalogue(data->>'storeId')));
create policy "store reviews demo boundary update"
on public.store_reviews as restrictive for update to authenticated
using ((select private.can_read_store_catalogue(data->>'storeId')))
with check ((select private.can_read_store_catalogue(data->>'storeId')));

create policy "feedback demo boundary insert"
on public.feedback as restrictive for insert to authenticated
with check ((select private.can_read_store_catalogue(data->>'storeId')));
create policy "feedback demo boundary update"
on public.feedback as restrictive for update to authenticated
using ((select private.can_read_store_catalogue(data->>'storeId')))
with check ((select private.can_read_store_catalogue(data->>'storeId')));

drop policy if exists "branch requests owner create" on public.branch_requests;
create policy "branch requests owner create"
on public.branch_requests for insert to authenticated
with check (
  data->>'ownerId' = (select auth.uid())::text
  and coalesce((select private.current_user_data())->>'isDemo', 'false') <> 'true'
  and data->>'status' = 'pending'
  and nullif(btrim(data->>'branchName'), '') is not null
  and nullif(btrim(data->>'address'), '') is not null
  and jsonb_typeof(data->'lat') = 'number'
  and jsonb_typeof(data->'lng') = 'number'
);

create or replace function private.protect_demo_store_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'UPDATE'
    or coalesce(old.data->>'isDemo', 'false') <> 'true'
    or (select auth.role()) = 'service_role'
  then
    return new;
  end if;

  if coalesce(new.data->>'isDemo', 'false') <> 'true'
    or coalesce(new.data->>'demoTenantId', '') <> coalesce(old.data->>'demoTenantId', '')
    or coalesce(new.data->>'ownerId', '') <> coalesce(old.data->>'ownerId', '')
  then
    raise exception 'Demo store sandbox identity cannot be changed.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_demo_store_identity() from public, anon, authenticated;
drop trigger if exists protect_demo_store_identity on public.stores;
create trigger protect_demo_store_identity
before update on public.stores
for each row execute function private.protect_demo_store_identity();

-- The effective status is checked dynamically by RLS. This helper also lets
-- auditor workflows reconcile display state without granting direct table
-- access to browser clients.
create or replace function private.expire_demo_tenants()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_count integer;
begin
  with expired as (
    update public.demo_tenants
    set status = 'expired',
        updated_at = now()
    where status = 'active'
      and expires_at <= now()
    returning id
  )
  update public.demo_accounts da
  set status = 'expired',
      updated_at = now()
  where da.tenant_id in (select id from expired)
    and da.status = 'active';

  get diagnostics expired_count = row_count;

  update public.users u
  set data = u.data
    || jsonb_build_object(
      'accountStatus', 'suspended',
      'accountStatusReason', 'This demo sandbox has expired.',
      'updatedAt', jsonb_build_object('seconds', floor(extract(epoch from now()))::bigint, 'nanoseconds', 0)
    )
  where coalesce(u.data->>'isDemo', 'false') = 'true'
    and nullif(u.data->>'demoTenantId', '') is not null
    and (u.data->>'demoTenantId')::uuid in (
      select dt.id from public.demo_tenants dt where dt.status = 'expired'
    )
    and coalesce(u.data->>'accountStatus', 'active') = 'active';

  return expired_count;
end;
$$;

revoke all on function private.expire_demo_tenants() from public, anon, authenticated;
grant execute on function private.expire_demo_tenants() to service_role;
