begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(4);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.store_reviews'::regclass
      and conname = 'store_reviews_hidden_boolean'
      and pg_get_constraintdef(oid) ilike '%jsonb_typeof%'
  ),
  'store review hidden metadata must be boolean'
);

select matches(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'store_reviews' and policyname = 'store reviews production public read'),
  '.*hidden.*false.*',
  'anonymous public review reads exclude hidden reviews'
);

select matches(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'store_reviews' and policyname = 'store reviews scoped authenticated read'),
  '.*owns_store.*',
  'authenticated owners retain access to hidden reviews for their stores'
);

select is(
  has_table_privilege('authenticated', 'public.store_reviews', 'DELETE'),
  false,
  'authenticated clients are not granted direct review deletion'
);

select * from finish();
rollback;

