create extension if not exists pg_cron;

create or replace function public.archive_expired_promotions()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  archived_count integer;
begin
  update public.promotions
  set data = jsonb_set(
    jsonb_set(data, '{active}', 'false'::jsonb, true),
    '{updatedAt}',
    jsonb_build_object(
      'seconds', floor(extract(epoch from statement_timestamp()))::bigint,
      'nanoseconds', 0
    ),
    true
  )
  where coalesce(data->>'active', 'true') = 'true'
    and coalesce(data->>'endDate', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,3})?)?$'
    and ((data->>'endDate')::timestamp at time zone 'Asia/Manila') <= statement_timestamp();

  get diagnostics archived_count = row_count;
  return archived_count;
end;
$$;

revoke all on function public.archive_expired_promotions() from public, anon, authenticated;

select cron.schedule(
  'archive-expired-promotions',
  '* * * * *',
  'select public.archive_expired_promotions()'
);

select public.archive_expired_promotions();
