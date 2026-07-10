-- Match the composite predicates used by scanner lookups and staff rosters.
create index if not exists cards_store_customer_idx
  on public.cards ((data->>'storeId'), (data->>'customerId'));

create index if not exists users_store_role_idx
  on public.users ((data->>'storeId'), (data->>'role'));

create index if not exists promotions_store_active_idx
  on public.promotions ((data->>'storeId'), (data->>'active'));
