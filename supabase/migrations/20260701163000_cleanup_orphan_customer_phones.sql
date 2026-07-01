delete from public.customer_phones cp
where not exists (
  select 1
  from public.users u
  where u.id = cp.customer_id
);