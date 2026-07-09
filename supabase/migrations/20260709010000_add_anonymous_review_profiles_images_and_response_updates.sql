alter table public.store_reviews
  drop constraint if exists store_reviews_customer_name_length,
  drop constraint if exists store_reviews_owner_reply_length,
  drop constraint if exists store_reviews_customer_avatar_url_length,
  drop constraint if exists store_reviews_customer_initials_length,
  drop constraint if exists store_reviews_anonymous_boolean,
  drop constraint if exists store_reviews_image_urls_valid;

alter table public.store_reviews
  add constraint store_reviews_customer_name_length
    check (char_length(coalesce(data->>'customerName', '')) between 1 and 100),
  add constraint store_reviews_customer_avatar_url_length
    check (char_length(coalesce(data->>'customerAvatarUrl', '')) <= 1000),
  add constraint store_reviews_customer_initials_length
    check (char_length(coalesce(data->>'customerInitials', '')) <= 8),
  add constraint store_reviews_anonymous_boolean
    check (
      not (data ? 'anonymous')
      or jsonb_typeof(data->'anonymous') = 'boolean'
    ),
  add constraint store_reviews_image_urls_valid
    check (
      case
        when data ? 'imageUrls' then
          jsonb_typeof(data->'imageUrls') = 'array'
          and jsonb_array_length(data->'imageUrls') <= 3
        else true
      end
    ),
  add constraint store_reviews_owner_reply_length
    check (char_length(coalesce(data->>'ownerReply', '')) <= 500);

drop policy if exists "customers create their store review" on public.store_reviews;

create policy "customers create their store review"
on public.store_reviews
for insert
to authenticated
with check (
  data->>'customerId' = (select auth.uid())::text
  and (select private.current_user_role()) = 'customer'
  and (
    (
      coalesce(data->'anonymous', 'false'::jsonb) = 'true'::jsonb
      and data->>'customerName' = 'Anonymous Customer'
      and coalesce(data->>'customerAvatarUrl', '') = ''
    )
    or (
      coalesce(data->'anonymous', 'false'::jsonb) <> 'true'::jsonb
      and data->>'customerName' = coalesce(
        nullif((select private.current_user_data())->>'name', ''),
        'Customer'
      )
      and coalesce(data->>'customerAvatarUrl', '') in (
        '',
        coalesce((select private.current_user_data())->>'avatarUrl', ''),
        coalesce((select private.current_user_data())->>'photoURL', '')
      )
    )
  )
  and char_length(coalesce(data->>'customerInitials', '')) between 1 and 8
  and (
    not (data ? 'imageUrls')
    or (
      jsonb_typeof(data->'imageUrls') = 'array'
      and jsonb_array_length(data->'imageUrls') <= 3
      and not exists (
        select 1
        from jsonb_array_elements_text(data->'imageUrls') as image_url(value)
        where char_length(btrim(image_url.value)) = 0
          or char_length(image_url.value) > 1000
      )
    )
  )
  and exists (
    select 1
    from public.stores
    where stores.id = store_reviews.data->>'storeId'
  )
  and (
    data - array[
      'storeId',
      'storeName',
      'customerId',
      'customerName',
      'customerAvatarUrl',
      'customerInitials',
      'anonymous',
      'rating',
      'comment',
      'imageUrls',
      'createdAt',
      'updatedAt'
    ]
  ) = '{}'::jsonb
);

create or replace function private.enforce_store_review_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select private.current_user_role()) = 'admin' then
    return new;
  end if;

  if not (select private.owns_store(old.data->>'storeId')) then
    raise exception 'Only the store owner can reply to this review';
  end if;

  if (new.data - 'ownerReply' - 'ownerRepliedAt' - 'ownerReplyUpdatedAt')
     is distinct from
     (old.data - 'ownerReply' - 'ownerRepliedAt' - 'ownerReplyUpdatedAt') then
    raise exception 'Store owners may only change their reply';
  end if;

  return new;
end;
$$;
