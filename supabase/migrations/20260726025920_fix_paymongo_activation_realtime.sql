-- Service-role billing fulfillment updates the stores row after a payment.
-- Keep the gallery guard as SECURITY INVOKER, but do not call authenticated-user
-- helpers before the existing trusted-backend bypass.
create or replace function private.enforce_store_gallery_subscription_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_role text := '';
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

  actor_role := coalesce((select private.current_user_role()), '');

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

revoke all on function private.enforce_store_gallery_subscription_limit()
  from public, anon, authenticated;

-- Keep the trusted-role condition in a separate PL/pgSQL branch. PostgreSQL is
-- free to evaluate both sides of a SQL OR expression, which previously caused
-- service_role to touch the private authenticated-user helper anyway.
create or replace function private.protect_store_subscription_access()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  protected_key text;
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  if coalesce((select private.current_user_role()), '') = 'admin' then
    return new;
  end if;

  foreach protected_key in array array[
    'status',
    'subscriptionLevel',
    'subscriptionDependencies',
    'branchLimit',
    'owedAmount',
    'pendingOwedAmount',
    'pendingOwedAmountEffectiveAt',
    'paymentSchedule',
    'subscriptionStart',
    'subscriptionEnd',
    'subscriptionAccess',
    'parentStoreId',
    'isPrimaryBranch'
  ]
  loop
    if old.data->protected_key is distinct from new.data->protected_key then
      raise exception 'Only an administrator can change store field "%".', protected_key
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function private.protect_store_subscription_access()
  from public, anon, authenticated;

-- billing_invoices already has RLS and an owner/admin SELECT policy. Publishing
-- its changes lets an authorized owner receive the paid transition immediately.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'billing_invoices'
  ) then
    alter publication supabase_realtime add table public.billing_invoices;
  end if;
end;
$$;
