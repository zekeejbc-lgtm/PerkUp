-- Customers receive new scan tickets while their dashboard is open. RLS on
-- promotions_scanned continues to restrict each customer to their own rows.
do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'promotions_scanned'
  ) then
    alter publication supabase_realtime add table public.promotions_scanned;
  end if;
end;
$$;
