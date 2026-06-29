create table public.store_reviews (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_reviews_store_id_required
    check (coalesce(data->>'storeId', '') <> ''),
  constraint store_reviews_customer_id_required
    check (coalesce(data->>'customerId', '') <> ''),
  constraint store_reviews_rating_valid
    check (
      jsonb_typeof(data->'rating') = 'number'
      and (data->>'rating')::numeric between 1 and 5
      and (data->>'rating')::numeric = trunc((data->>'rating')::numeric)
    ),
  constraint store_reviews_comment_length
    check (char_length(btrim(coalesce(data->>'comment', ''))) between 1 and 500),
  constraint store_reviews_customer_name_length
    check (char_length(coalesce(data->>'customerName', '')) between 1 and 100),
  constraint store_reviews_owner_reply_length
    check (char_length(coalesce(data->>'ownerReply', '')) <= 500)
);

create index store_reviews_store_id_idx
  on public.store_reviews ((data->>'storeId'), created_at desc);

create unique index store_reviews_one_per_customer_store_idx
  on public.store_reviews ((data->>'storeId'), (data->>'customerId'));

create trigger set_store_reviews_updated_at
before update on public.store_reviews
for each row execute function public.set_updated_at();

alter table public.store_reviews enable row level security;

create policy "store reviews public read"
on public.store_reviews
for select
to anon, authenticated
using (true);

create policy "customers create their store review"
on public.store_reviews
for insert
to authenticated
with check (
  data->>'customerId' = (select auth.uid())::text
  and (select private.current_user_role()) = 'customer'
  and data->>'customerName' = coalesce(
    nullif((select private.current_user_data())->>'name', ''),
    'Customer'
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
      'rating',
      'comment',
      'createdAt',
      'updatedAt'
    ]
  ) = '{}'::jsonb
);

create policy "store owners reply to reviews"
on public.store_reviews
for update
to authenticated
using ((select private.owns_store(data->>'storeId')))
with check ((select private.owns_store(data->>'storeId')));

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

  if (new.data - 'ownerReply' - 'ownerRepliedAt')
     is distinct from
     (old.data - 'ownerReply' - 'ownerRepliedAt') then
    raise exception 'Store owners may only change their reply';
  end if;

  return new;
end;
$$;

create trigger enforce_store_review_update
before update on public.store_reviews
for each row execute function private.enforce_store_review_update();

grant select on public.store_reviews to anon;
grant select, insert, update on public.store_reviews to authenticated;
grant select, insert, update, delete on public.store_reviews to service_role;
