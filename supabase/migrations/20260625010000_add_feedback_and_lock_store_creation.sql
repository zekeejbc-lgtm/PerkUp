create table if not exists public.feedback (like public.users including all);

drop trigger if exists set_feedback_updated_at on public.feedback;
create trigger set_feedback_updated_at
before update on public.feedback
for each row execute function public.set_updated_at();

alter table public.feedback enable row level security;

drop policy if exists "feedback authenticated read" on public.feedback;
drop policy if exists "feedback authenticated insert" on public.feedback;
drop policy if exists "feedback authenticated update" on public.feedback;
drop policy if exists "feedback authenticated delete" on public.feedback;

create policy "feedback authenticated read"
on public.feedback
for select
to authenticated
using (
  data->>'customerId' = (select auth.uid())::text
  or exists (
    select 1
    from public.users
    where users.id = (select auth.uid())::text
      and users.data->>'role' in ('admin', 'auditor')
  )
  or exists (
    select 1
    from public.stores
    where stores.id = feedback.data->>'storeId'
      and stores.data->>'ownerId' = (select auth.uid())::text
  )
  or exists (
    select 1
    from public.users
    where users.id = (select auth.uid())::text
      and users.data->>'role' = 'staff'
      and users.data->>'storeId' = feedback.data->>'storeId'
  )
);

create policy "feedback customers create"
on public.feedback
for insert
to authenticated
with check ((data->>'customerId') = (select auth.uid())::text);

create policy "feedback admins update"
on public.feedback
for update
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = (select auth.uid())::text
      and users.data->>'role' in ('admin', 'auditor')
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.id = (select auth.uid())::text
      and users.data->>'role' in ('admin', 'auditor')
  )
);

create policy "feedback admins delete"
on public.feedback
for delete
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = (select auth.uid())::text
      and users.data->>'role' in ('admin', 'auditor')
  )
);

drop policy if exists "stores authenticated insert" on public.stores;
drop policy if exists "stores authenticated update" on public.stores;
drop policy if exists "stores authenticated delete" on public.stores;
drop policy if exists "stores admins create" on public.stores;
drop policy if exists "stores admins and owners update" on public.stores;
drop policy if exists "stores admins delete" on public.stores;

create policy "stores admins create"
on public.stores
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users
    where users.id = (select auth.uid())::text
      and users.data->>'role' = 'admin'
  )
);

create policy "stores admins and owners update"
on public.stores
for update
to authenticated
using (
  data->>'ownerId' = (select auth.uid())::text
  or exists (
    select 1
    from public.users
    where users.id = (select auth.uid())::text
      and users.data->>'role' = 'admin'
  )
)
with check (
  data->>'ownerId' = (select auth.uid())::text
  or exists (
    select 1
    from public.users
    where users.id = (select auth.uid())::text
      and users.data->>'role' = 'admin'
  )
);

create policy "stores admins delete"
on public.stores
for delete
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = (select auth.uid())::text
      and users.data->>'role' = 'admin'
  )
);

grant select, insert, update, delete on public.feedback to authenticated;
grant select, insert, update, delete on public.feedback to service_role;
