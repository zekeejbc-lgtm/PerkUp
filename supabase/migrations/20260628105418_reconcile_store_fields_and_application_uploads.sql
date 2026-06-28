-- Canonical store fields used by maps, geofencing, and the public detail page.
update public.stores
set data =
  data
  || case
    when not (data ? 'lat') and data ? 'latitude' then jsonb_build_object('lat', data->'latitude')
    else '{}'::jsonb
  end
  || case
    when not (data ? 'lng') and data ? 'longitude' then jsonb_build_object('lng', data->'longitude')
    else '{}'::jsonb
  end
  || case
    when not (data ? 'hours') and data ? 'openingHours' then jsonb_build_object('hours', data->'openingHours')
    else '{}'::jsonb
  end;
create table if not exists public.application_files (
  file_id text primary key,
  application_id text not null references public.applications(id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);
alter table public.application_files enable row level security;
revoke all on public.application_files from anon, authenticated;
grant select, insert, update, delete on public.application_files to service_role;
drop policy if exists "application files admin read" on public.application_files;
create policy "application files admin read"
on public.application_files
for select to authenticated
using ((select private.current_user_role()) = 'admin');
grant select on public.application_files to authenticated;
create table if not exists public.partner_application_limits (
  client_hash text primary key,
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count between 1 and 1000)
);
alter table public.partner_application_limits enable row level security;
revoke all on public.partner_application_limits from anon, authenticated;
grant select, insert, update, delete on public.partner_application_limits to service_role;
-- Register legacy managed images so owners can replace or delete them.
insert into public.drive_files (file_id, owner_id, purpose, url)
select
  (regexp_match(image.url, '[?&]id=([A-Za-z0-9_-]+)'))[1],
  auth_user.id,
  image.purpose,
  image.url
from public.users u
join auth.users auth_user on auth_user.id::text = u.id
cross join lateral (
  values
    (u.data->>'avatarUrl', 'profile-avatar'),
    (u.data->>'photoURL', 'profile-avatar')
) as image(url, purpose)
where image.url ~ '[?&]id=[A-Za-z0-9_-]+'
on conflict (file_id) do nothing;
insert into public.drive_files (file_id, owner_id, purpose, url)
select
  (regexp_match(image.url, '[?&]id=([A-Za-z0-9_-]+)'))[1],
  auth_user.id,
  'store-photo',
  image.url
from public.stores s
join auth.users auth_user on auth_user.id::text = s.data->>'ownerId'
cross join lateral jsonb_array_elements_text(
  case when jsonb_typeof(s.data->'images') = 'array' then s.data->'images' else '[]'::jsonb end
) as image(url)
where image.url ~ '[?&]id=[A-Za-z0-9_-]+'
on conflict (file_id) do nothing;
insert into public.drive_files (file_id, owner_id, purpose, url)
select
  (regexp_match(image.url, '[?&]id=([A-Za-z0-9_-]+)'))[1],
  auth_user.id,
  image.purpose,
  image.url
from public.stores s
join auth.users auth_user on auth_user.id::text = s.data->>'ownerId'
cross join lateral (
  values
    (s.data->>'logoUrl', 'store-logo'),
    (s.data->>'menuUrl', 'store-menu')
) as image(url, purpose)
where image.url ~ '[?&]id=[A-Za-z0-9_-]+'
on conflict (file_id) do nothing;
insert into public.drive_files (file_id, owner_id, purpose, url)
select
  (regexp_match(p.data->>'imageUrl', '[?&]id=([A-Za-z0-9_-]+)'))[1],
  auth_user.id,
  'product-image',
  p.data->>'imageUrl'
from public.products p
join public.stores s on s.id = p.data->>'storeId'
join auth.users auth_user on auth_user.id::text = s.data->>'ownerId'
where p.data->>'imageUrl' ~ '[?&]id=[A-Za-z0-9_-]+'
on conflict (file_id) do nothing;
insert into public.drive_files (file_id, owner_id, purpose, url)
select
  (regexp_match(p.data->>'bannerImageUrl', '[?&]id=([A-Za-z0-9_-]+)'))[1],
  auth_user.id,
  'promotion-banner',
  p.data->>'bannerImageUrl'
from public.promotions p
join public.stores s on s.id = p.data->>'storeId'
join auth.users auth_user on auth_user.id::text = s.data->>'ownerId'
where p.data->>'bannerImageUrl' ~ '[?&]id=[A-Za-z0-9_-]+'
on conflict (file_id) do nothing;
-- Partner applications now go through a validated, rate-limited Edge Function.
drop policy if exists "applications public create" on public.applications;
revoke insert on public.applications from anon;
-- Consolidate equivalent permissive policies to avoid duplicate policy evaluation.
drop policy if exists "users self customer create" on public.users;
drop policy if exists "users admin create" on public.users;
create policy "users scoped create"
on public.users
for insert to authenticated
with check (
  (select private.current_user_role()) = 'admin'
  or (
    id = (select auth.uid())::text
    and coalesce(data->>'role', 'customer') = 'customer'
  )
);
drop policy if exists "users self profile update" on public.users;
drop policy if exists "users admin update" on public.users;
create policy "users scoped update"
on public.users
for update to authenticated
using (
  (select private.current_user_role()) = 'admin'
  or id = (select auth.uid())::text
)
with check (
  (select private.current_user_role()) = 'admin'
  or (
    id = (select auth.uid())::text
    and coalesce(data->>'role', '') = coalesce((select private.current_user_role()), '')
    and coalesce(data->>'storeId', '') = coalesce((select private.current_user_store_id()), '')
    and coalesce(data->'lifetimeStars', '0'::jsonb) = coalesce((select private.current_user_data())->'lifetimeStars', '0'::jsonb)
    and coalesce(data->'qrVersion', '1'::jsonb) = coalesce((select private.current_user_data())->'qrVersion', '1'::jsonb)
    and coalesce(data->'forcePasswordReset', 'false'::jsonb) = coalesce((select private.current_user_data())->'forcePasswordReset', 'false'::jsonb)
  )
);
-- Use the normalized role helper so assistant admins have the same intended access.
drop policy if exists "feedback authenticated read" on public.feedback;
drop policy if exists "feedback admins update" on public.feedback;
drop policy if exists "feedback admins delete" on public.feedback;
create policy "feedback scoped read"
on public.feedback for select to authenticated
using (
  data->>'customerId' = (select auth.uid())::text
  or (select private.current_user_role()) in ('admin', 'auditor')
  or (select private.owns_store(data->>'storeId'))
  or (
    (select private.current_user_role()) = 'staff'
    and data->>'storeId' = (select private.current_user_store_id())
  )
);
create policy "feedback admin update"
on public.feedback for update to authenticated
using ((select private.current_user_role()) = 'admin')
with check ((select private.current_user_role()) = 'admin');
create policy "feedback admin delete"
on public.feedback for delete to authenticated
using ((select private.current_user_role()) = 'admin');
