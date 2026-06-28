do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'users',
    'customers',
    'stores',
    'applications',
    'settings',
    'promotions',
    'products',
    'cards',
    'promotions_scanned',
    'test'
  ]
  loop
    execute format('drop policy if exists "%s authenticated write" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%s authenticated insert" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%s authenticated update" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%s authenticated delete" on public.%I', table_name, table_name);
    execute format(
      'create policy "%s authenticated insert" on public.%I for insert to authenticated with check (true)',
      table_name,
      table_name
    );
    execute format(
      'create policy "%s authenticated update" on public.%I for update to authenticated using (true) with check (true)',
      table_name,
      table_name
    );
    execute format(
      'create policy "%s authenticated delete" on public.%I for delete to authenticated using (true)',
      table_name,
      table_name
    );
  end loop;
end;
$$;;
