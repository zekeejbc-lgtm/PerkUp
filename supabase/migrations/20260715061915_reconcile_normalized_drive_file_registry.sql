-- Reconcile every managed Google Drive URL format, including the normalized
-- lh3.googleusercontent.com/d/<file-id> URLs used by the current client.
with managed_assets as (
  select auth_user.id as owner_id, image.purpose, image.url
  from public.users u
  join auth.users auth_user on auth_user.id::text = u.id
  cross join lateral (
    values
      (u.data->>'avatarUrl', 'profile-avatar'),
      (u.data->>'photoURL', 'profile-avatar')
  ) as image(url, purpose)

  union all

  select auth_user.id, image.purpose, image.url
  from public.stores s
  join auth.users auth_user on auth_user.id::text = s.data->>'ownerId'
  cross join lateral (
    values
      (s.data->>'logoUrl', 'store-logo'),
      (s.data->>'menuUrl', 'store-menu')
  ) as image(url, purpose)

  union all

  select auth_user.id, 'store-photo', image.url
  from public.stores s
  join auth.users auth_user on auth_user.id::text = s.data->>'ownerId'
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(s.data->'images') = 'array' then s.data->'images' else '[]'::jsonb end
  ) as image(url)

  union all

  select auth_user.id, 'product-image', p.data->>'imageUrl'
  from public.products p
  join public.stores s on s.id = p.data->>'storeId'
  join auth.users auth_user on auth_user.id::text = s.data->>'ownerId'

  union all

  select auth_user.id, 'promotion-banner', p.data->>'bannerImageUrl'
  from public.promotions p
  join public.stores s on s.id = p.data->>'storeId'
  join auth.users auth_user on auth_user.id::text = s.data->>'ownerId'

  union all

  select auth_user.id, 'store-review-image', image.url
  from public.store_reviews r
  join auth.users auth_user on auth_user.id::text = r.data->>'customerId'
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(r.data->'imageUrls') = 'array' then r.data->'imageUrls' else '[]'::jsonb end
  ) as image(url)
), parsed_assets as (
  select
    (regexp_match(url, '([?&](id|fileId)=|/d/)([A-Za-z0-9_-]+)'))[3] as file_id,
    owner_id,
    purpose,
    url
  from managed_assets
  where coalesce(url, '') <> ''
), deduplicated_assets as (
  select distinct on (file_id) file_id, owner_id, purpose, url
  from parsed_assets
  where file_id is not null
  order by file_id, purpose, url
)
insert into public.drive_files (file_id, owner_id, purpose, url)
select file_id, owner_id, purpose, url
from deduplicated_assets
on conflict (file_id) do update
set owner_id = excluded.owner_id,
    purpose = excluded.purpose,
    url = excluded.url;
