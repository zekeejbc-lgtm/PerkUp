create table if not exists public.users (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (like public.users including all);
create table if not exists public.stores (like public.users including all);
create table if not exists public.applications (like public.users including all);
create table if not exists public.settings (like public.users including all);
create table if not exists public.promotions (like public.users including all);
create table if not exists public.products (like public.users including all);
create table if not exists public.cards (like public.users including all);
create table if not exists public.promotions_scanned (like public.users including all);
create table if not exists public.test (like public.users including all);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'users',
    'customers',
    'stores',
    'applications',
    'settings',
    'promotions',
    'products',
    'cards',
    'promotions_scanned',
    'test'
  ]
  loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists "%s authenticated read" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%s authenticated write" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%s authenticated insert" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%s authenticated update" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%s authenticated delete" on public.%I', table_name, table_name);
    execute format(
      'create policy "%s authenticated read" on public.%I for select to authenticated using (true)',
      table_name,
      table_name
    );
    execute format(
      'create policy "%s authenticated insert" on public.%I for insert to authenticated with check (true)',
      table_name,
      table_name
    );
    execute format(
      'create policy "%s authenticated update" on public.%I for update to authenticated using (true) with check (true)',
      table_name,
      table_name
    );
    execute format(
      'create policy "%s authenticated delete" on public.%I for delete to authenticated using (true)',
      table_name,
      table_name
    );
  end loop;
end;
$$;

drop policy if exists "settings public read" on public.settings;
drop policy if exists "stores public read" on public.stores;
drop policy if exists "promotions public read" on public.promotions;
drop policy if exists "products public read" on public.products;
drop policy if exists "applications public create" on public.applications;

create policy "settings public read" on public.settings for select to anon using (true);
create policy "stores public read" on public.stores for select to anon using (true);
create policy "promotions public read" on public.promotions for select to anon using (true);
create policy "products public read" on public.products for select to anon using (true);
create policy "applications public create" on public.applications for insert to anon with check (true);

grant usage on schema public to anon, authenticated;

grant select on public.settings to anon;
grant select on public.stores to anon;
grant select on public.promotions to anon;
grant select on public.products to anon;
grant insert on public.applications to anon;

grant select, insert, update, delete on
  public.users,
  public.customers,
  public.stores,
  public.applications,
  public.settings,
  public.promotions,
  public.products,
  public.cards,
  public.promotions_scanned,
  public.test
to authenticated;
