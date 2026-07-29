alter table public.store_reviews
  drop constraint if exists store_reviews_hidden_boolean;

alter table public.store_reviews
  add constraint store_reviews_hidden_boolean
  check (
    not (data ? 'hidden')
    or jsonb_typeof(data->'hidden') = 'boolean'
  );

drop policy if exists "store reviews production public read" on public.store_reviews;
create policy "store reviews production public read"
on public.store_reviews
for select
to anon
using (
  coalesce((store_reviews.data->>'hidden')::boolean, false) = false
  and not exists (
    select 1
    from public.stores s
    where s.id = store_reviews.data->>'storeId'
      and coalesce(s.data->>'isDemo', 'false') = 'true'
  )
);

drop policy if exists "store reviews scoped authenticated read" on public.store_reviews;
create policy "store reviews scoped authenticated read"
on public.store_reviews
for select
to authenticated
using (
  (select private.can_read_store_catalogue(data->>'storeId'))
  and (
    coalesce((store_reviews.data->>'hidden')::boolean, false) = false
    or (select private.owns_store(data->>'storeId'))
    or (select private.current_user_role()) in ('admin', 'assistant_admin')
  )
);
