-- Replace the original permissive compatibility policies with tenant-aware rules.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create or replace function private.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when u.data->>'role' = 'assistant_admin' then 'admin'
    else u.data->>'role'
  end
  from public.users u
  where u.id = (select auth.uid())::text
$$;
create or replace function private.current_user_store_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.data->>'storeId'
  from public.users u
  where u.id = (select auth.uid())::text
$$;
create or replace function private.current_user_data()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select u.data
  from public.users u
  where u.id = (select auth.uid())::text
$$;
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
    where s.id = target_store_id
      and s.data->>'ownerId' = (select auth.uid())::text
  )
$$;
create or replace function private.can_access_customer(target_customer_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.cards c
    where c.data->>'customerId' = target_customer_id
      and (
        exists (
          select 1
          from public.stores s
          where s.id = c.data->>'storeId'
            and s.data->>'ownerId' = (select auth.uid())::text
        )
        or exists (
          select 1
          from public.users u
          where u.id = (select auth.uid())::text
            and u.data->>'role' = 'staff'
            and u.data->>'storeId' = c.data->>'storeId'
        )
      )
  )
$$;
revoke all on function private.current_user_role() from public;
revoke all on function private.current_user_store_id() from public;
revoke all on function private.current_user_data() from public;
revoke all on function private.owns_store(text) from public;
revoke all on function private.can_access_customer(text) from public;
grant usage on schema private to authenticated;
grant execute on function private.current_user_role() to authenticated;
grant execute on function private.current_user_store_id() to authenticated;
grant execute on function private.current_user_data() to authenticated;
grant execute on function private.owns_store(text) to authenticated;
grant execute on function private.can_access_customer(text) to authenticated;
do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'users', 'customers', 'stores', 'applications', 'settings',
    'promotions', 'products', 'cards', 'promotions_scanned', 'test'
  ]
  loop
    for policy_name in
      select pol.polname
      from pg_policy pol
      join pg_class cls on cls.oid = pol.polrelid
      join pg_namespace ns on ns.oid = cls.relnamespace
      where ns.nspname = 'public' and cls.relname = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
    end loop;
  end loop;
end
$$;
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'users', 'customers', 'stores', 'applications', 'settings',
    'promotions', 'products', 'cards', 'promotions_scanned', 'test', 'feedback'
  ]
  loop
    if not exists (
      select 1
      from pg_constraint
      where conname = table_name || '_bounded_document'
        and conrelid = format('public.%I', table_name)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I check (char_length(id) between 1 and 100 and jsonb_typeof(data) = ''object'' and pg_column_size(data) <= 65536) not valid',
        table_name,
        table_name || '_bounded_document'
      );
    end if;
  end loop;
end
$$;
-- Public catalogue/settings reads.
create policy "settings public read" on public.settings for select to anon, authenticated using (true);
create policy "stores public read" on public.stores for select to anon, authenticated using (true);
create policy "promotions public read" on public.promotions for select to anon, authenticated using (true);
create policy "products public read" on public.products for select to anon, authenticated using (true);
create policy "applications public create" on public.applications
for insert to anon, authenticated
with check (
  char_length(id) between 1 and 100
  and jsonb_typeof(data) = 'object'
  and coalesce(data->>'status', 'pending') = 'pending'
);
-- Users may manage their own non-privileged profile. Admins manage directory rows.
create policy "users scoped read" on public.users
for select to authenticated
using (
  id = (select auth.uid())::text
  or (select private.current_user_role()) in ('admin', 'auditor')
  or (
    (select private.current_user_role()) = 'store_owner'
    and data->>'role' = 'staff'
    and (select private.owns_store(data->>'storeId'))
  )
  or (
    data->>'role' = 'customer'
    and (select private.can_access_customer(id))
  )
);
create policy "users self customer create" on public.users
for insert to authenticated
with check (
  id = (select auth.uid())::text
  and coalesce(data->>'role', 'customer') = 'customer'
);
create policy "users admin create" on public.users
for insert to authenticated
with check ((select private.current_user_role()) = 'admin');
create policy "users self profile update" on public.users
for update to authenticated
using (id = (select auth.uid())::text)
with check (
  id = (select auth.uid())::text
  and coalesce(data->>'role', '') = coalesce((select private.current_user_role()), '')
  and coalesce(data->>'storeId', '') = coalesce((select private.current_user_store_id()), '')
  and coalesce(data->'lifetimeStars', '0'::jsonb) = coalesce((select private.current_user_data())->'lifetimeStars', '0'::jsonb)
  and coalesce(data->'qrVersion', '1'::jsonb) = coalesce((select private.current_user_data())->'qrVersion', '1'::jsonb)
  and coalesce(data->'forcePasswordReset', 'false'::jsonb) = coalesce((select private.current_user_data())->'forcePasswordReset', 'false'::jsonb)
);
create policy "users admin update" on public.users
for update to authenticated
using ((select private.current_user_role()) = 'admin')
with check ((select private.current_user_role()) = 'admin');
create policy "users admin delete" on public.users
for delete to authenticated
using ((select private.current_user_role()) = 'admin');
-- Customer private records.
create policy "customers scoped read" on public.customers
for select to authenticated
using (
  id = (select auth.uid())::text
  or (select private.current_user_role()) in ('admin', 'auditor')
  or (select private.can_access_customer(id))
);
create policy "customers self create" on public.customers
for insert to authenticated
with check (id = (select auth.uid())::text);
create policy "customers admin delete" on public.customers
for delete to authenticated
using ((select private.current_user_role()) = 'admin');
-- Store administration.
create policy "stores admin create" on public.stores
for insert to authenticated
with check ((select private.current_user_role()) = 'admin');
create policy "stores owner admin update" on public.stores
for update to authenticated
using ((select private.current_user_role()) = 'admin' or (select private.owns_store(id)))
with check (
  (select private.current_user_role()) = 'admin'
  or (
    (select private.owns_store(id))
    and data->>'ownerId' = (select auth.uid())::text
  )
);
create policy "stores admin delete" on public.stores
for delete to authenticated
using ((select private.current_user_role()) = 'admin');
-- Administrative resources.
create policy "applications admin read" on public.applications
for select to authenticated using ((select private.current_user_role()) in ('admin', 'auditor'));
create policy "applications admin update" on public.applications
for update to authenticated
using ((select private.current_user_role()) = 'admin')
with check ((select private.current_user_role()) = 'admin');
create policy "applications admin delete" on public.applications
for delete to authenticated using ((select private.current_user_role()) = 'admin');
create policy "settings admin create" on public.settings
for insert to authenticated with check ((select private.current_user_role()) = 'admin');
create policy "settings admin update" on public.settings
for update to authenticated
using ((select private.current_user_role()) = 'admin')
with check ((select private.current_user_role()) = 'admin');
create policy "settings admin delete" on public.settings
for delete to authenticated using ((select private.current_user_role()) = 'admin');
-- Store-owned catalogue data.
create policy "promotions owner admin create" on public.promotions
for insert to authenticated
with check ((select private.current_user_role()) = 'admin' or (select private.owns_store(data->>'storeId')));
create policy "promotions owner admin update" on public.promotions
for update to authenticated
using ((select private.current_user_role()) = 'admin' or (select private.owns_store(data->>'storeId')))
with check ((select private.current_user_role()) = 'admin' or (select private.owns_store(data->>'storeId')));
create policy "promotions owner admin delete" on public.promotions
for delete to authenticated
using ((select private.current_user_role()) = 'admin' or (select private.owns_store(data->>'storeId')));
create policy "products owner admin create" on public.products
for insert to authenticated
with check ((select private.current_user_role()) = 'admin' or (select private.owns_store(data->>'storeId')));
create policy "products owner admin update" on public.products
for update to authenticated
using ((select private.current_user_role()) = 'admin' or (select private.owns_store(data->>'storeId')))
with check ((select private.current_user_role()) = 'admin' or (select private.owns_store(data->>'storeId')));
create policy "products owner admin delete" on public.products
for delete to authenticated
using ((select private.current_user_role()) = 'admin' or (select private.owns_store(data->>'storeId')));
-- Loyalty cards are customer-readable and store-managed. Writes normally go through
-- redeem-customer-scan's service-role transaction.
create policy "cards scoped read" on public.cards
for select to authenticated
using (
  data->>'customerId' = (select auth.uid())::text
  or (select private.current_user_role()) in ('admin', 'auditor')
  or (select private.owns_store(data->>'storeId'))
  or (
    (select private.current_user_role()) = 'staff'
    and data->>'storeId' = (select private.current_user_store_id())
  )
);
create policy "cards owner admin create" on public.cards
for insert to authenticated
with check ((select private.current_user_role()) = 'admin' or (select private.owns_store(data->>'storeId')));
create policy "cards owner admin update" on public.cards
for update to authenticated
using ((select private.current_user_role()) = 'admin' or (select private.owns_store(data->>'storeId')))
with check ((select private.current_user_role()) = 'admin' or (select private.owns_store(data->>'storeId')));
create policy "cards owner admin delete" on public.cards
for delete to authenticated
using ((select private.current_user_role()) = 'admin' or (select private.owns_store(data->>'storeId')));
-- Scan logs are append-only to clients.
create policy "scans scoped read" on public.promotions_scanned
for select to authenticated
using (
  data->>'customerId' = (select auth.uid())::text
  or (select private.current_user_role()) in ('admin', 'auditor')
  or (select private.owns_store(data->>'storeId'))
  or (
    (select private.current_user_role()) = 'staff'
    and data->>'storeId' = (select private.current_user_store_id())
  )
);
create policy "test admin only" on public.test
for all to authenticated
using ((select private.current_user_role()) = 'admin')
with check ((select private.current_user_role()) = 'admin');
-- JSON expression indexes used by queries and policies.
create index if not exists users_role_idx on public.users ((data->>'role'));
create index if not exists users_store_id_idx on public.users ((data->>'storeId'));
create index if not exists stores_owner_id_idx on public.stores ((data->>'ownerId'));
create index if not exists products_store_id_idx on public.products ((data->>'storeId'));
create index if not exists promotions_store_id_idx on public.promotions ((data->>'storeId'));
create index if not exists cards_store_id_idx on public.cards ((data->>'storeId'));
create index if not exists cards_customer_id_idx on public.cards ((data->>'customerId'));
create index if not exists scans_store_id_idx on public.promotions_scanned ((data->>'storeId'));
create index if not exists scans_customer_id_idx on public.promotions_scanned ((data->>'customerId'));
create index if not exists feedback_store_id_idx on public.feedback ((data->>'storeId'));
create index if not exists feedback_customer_id_idx on public.feedback ((data->>'customerId'));
create table if not exists public.drive_files (
  file_id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null default 'image',
  url text not null,
  created_at timestamptz not null default now()
);
alter table public.drive_files enable row level security;
drop policy if exists "drive files owner read" on public.drive_files;
create policy "drive files owner read" on public.drive_files
for select to authenticated
using (owner_id = (select auth.uid()) or (select private.current_user_role()) = 'admin');
grant select on public.drive_files to authenticated;
grant select, insert, update, delete on public.drive_files to service_role;
create index if not exists drive_files_owner_id_idx on public.drive_files (owner_id);
