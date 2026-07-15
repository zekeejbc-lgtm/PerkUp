create or replace function private.enforce_store_gallery_subscription_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_role text := coalesce((select private.current_user_role()), '');
  configured_limit_text text;
  gallery_limit integer := 3;
  previous_photo_count integer := 0;
  next_photo_count integer := 0;
begin
  if jsonb_typeof(new.data->'images') is not null
    and jsonb_typeof(new.data->'images') <> 'array'
  then
    raise exception 'Store gallery images must be an array.'
      using errcode = '22023';
  end if;

  next_photo_count := case
    when jsonb_typeof(new.data->'images') = 'array' then jsonb_array_length(new.data->'images')
    else 0
  end;
  previous_photo_count := case
    when jsonb_typeof(old.data->'images') = 'array' then jsonb_array_length(old.data->'images')
    else 0
  end;

  if next_photo_count > 10 then
    raise exception 'A store gallery cannot contain more than 10 photos.'
      using errcode = '23514';
  end if;

  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  if old.data->'subscriptionDependencies' is distinct from new.data->'subscriptionDependencies'
    and actor_role not in ('admin', 'assistant_admin')
  then
    raise exception 'Only an administrator can change subscription dependencies.'
      using errcode = '42501';
  end if;

  if actor_role not in ('admin', 'assistant_admin') then
    configured_limit_text := new.data->'subscriptionDependencies'->>'galleryPhotoLimit';

    if configured_limit_text is null then
      select store.data->'subscriptionDependencies'->>'galleryPhotoLimit'
      into configured_limit_text
      from public.stores as store
      where store.data->>'ownerId' = new.data->>'ownerId'
        and coalesce(store.data->>'isPrimaryBranch', 'true') <> 'false'
      order by case when store.id = new.id then 0 else 1 end
      limit 1;
    end if;

    if configured_limit_text ~ '^[0-9]+$' then
      gallery_limit := greatest(3, least(10, configured_limit_text::integer));
    end if;

    if new.data->'images' is distinct from old.data->'images'
      and next_photo_count > previous_photo_count
      and next_photo_count > gallery_limit
    then
      raise exception 'Your subscription allows up to % gallery photos.', gallery_limit
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_store_gallery_subscription_limit() from public, anon, authenticated;

drop trigger if exists enforce_store_gallery_subscription_limit on public.stores;
create trigger enforce_store_gallery_subscription_limit
before update on public.stores
for each row
execute function private.enforce_store_gallery_subscription_limit();
