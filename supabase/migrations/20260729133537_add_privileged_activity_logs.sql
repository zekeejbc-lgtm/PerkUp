create index if not exists audit_events_store_created_idx
  on public.audit_events ((metadata->>'storeId'), created_at desc)
  where metadata ? 'storeId';

create index if not exists audit_events_source_created_idx
  on public.audit_events (source, created_at desc);

-- Record the business context of direct database changes. Values are kept out
-- of the generic change summary so passwords, contact details, QR tokens, and
-- other secrets cannot accidentally enter the audit stream.
create or replace function private.capture_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_data jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  new_data jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  row_id text;
  store_id text;
  event_metadata jsonb := '{}'::jsonb;
  changed_fields jsonb := '[]'::jsonb;
  data_changed_fields jsonb := '[]'::jsonb;
  event_actor_id uuid := (select auth.uid());
  event_actor_email text;
  event_actor_role text;
  request_claims text := nullif(current_setting('request.jwt.claims', true), '');
begin
  row_id := coalesce(row_data->>'id', row_data->>'event_id');
  store_id := coalesce(
    row_data->>'store_id',
    row_data->'data'->>'storeId',
    row_data->>'storeId',
    case when tg_table_name = 'stores' then row_id end
  );

  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(keys.key order by keys.key), '[]'::jsonb)
    into changed_fields
    from (
      select key
      from (
        select jsonb_object_keys(old_data) as key
        union
        select jsonb_object_keys(new_data) as key
      ) all_keys
      where old_data->key is distinct from new_data->key
    ) keys;

    if jsonb_typeof(old_data->'data') = 'object'
      and jsonb_typeof(new_data->'data') = 'object'
    then
      select coalesce(jsonb_agg(keys.key order by keys.key), '[]'::jsonb)
      into data_changed_fields
      from (
        select key
        from (
          select jsonb_object_keys(old_data->'data') as key
          union
          select jsonb_object_keys(new_data->'data') as key
        ) all_keys
        where old_data->'data'->key is distinct from new_data->'data'->key
      ) keys;
    end if;
  end if;

  if event_actor_id is not null then
    select u.data->>'email', u.data->>'role'
    into event_actor_email, event_actor_role
    from public.users u
    where u.id = event_actor_id::text;
  else
    event_actor_role := coalesce(request_claims::jsonb->>'role', 'system');
    event_metadata := event_metadata || jsonb_build_object(
      'attribution',
      case when event_actor_role = 'service_role'
        then 'service_operation'
        else 'system_operation'
      end
    );
  end if;

  event_metadata := event_metadata || jsonb_build_object(
    'storeId', store_id,
    'status', coalesce(row_data->>'status', row_data->'data'->>'status'),
    'name', coalesce(
      row_data->'data'->>'businessName',
      row_data->'data'->>'name',
      row_data->>'name'
    ),
    'changedFields', case when tg_op = 'UPDATE' then changed_fields else null end,
    'dataChangedFields', case when tg_op = 'UPDATE' then data_changed_fields else null end
  );

  if tg_table_name = 'users' then
    event_metadata := event_metadata || jsonb_build_object(
      'role', row_data->'data'->>'role',
      'accountStatus', coalesce(row_data->'data'->>'accountStatus', 'active'),
      'storeId', row_data->'data'->>'storeId'
    );
  elsif tg_table_name in ('billing_invoices', 'billing_subscriptions') then
    event_metadata := event_metadata || jsonb_build_object(
      'planId', row_data->>'plan_id',
      'invoiceType', row_data->>'invoice_type',
      'amountCentavos', row_data->'amount_centavos',
      'currency', row_data->>'currency',
      'paymentMethod', row_data->>'payment_method'
    );
  elsif tg_table_name = 'billing_notifications' then
    event_metadata := event_metadata || jsonb_build_object(
      'invoiceId', row_data->>'invoice_id',
      'type', row_data->>'notification_type',
      'channel', row_data->>'channel'
    );
  elsif tg_table_name in ('promotions_scanned', 'promotion_claims') then
    event_metadata := event_metadata || jsonb_build_object(
      'type', coalesce(row_data->'data'->>'type', 'loyalty_activity'),
      'customerId', coalesce(row_data->'data'->>'customerId', row_data->>'customer_id'),
      'staffId', coalesce(row_data->'data'->>'staffId', row_data->>'staff_id')
    );
  end if;

  insert into public.audit_events (
    actor_user_id,
    actor_email,
    actor_role,
    action,
    entity_type,
    entity_id,
    source,
    metadata
  )
  values (
    event_actor_id,
    event_actor_email,
    event_actor_role,
    lower(tg_op) || '_' || tg_table_name,
    tg_table_name,
    row_id,
    case
      when event_actor_id is null then 'system'
      when tg_table_name like 'billing_%' then 'billing'
      else 'database'
    end,
    jsonb_strip_nulls(event_metadata)
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.capture_audit_event() from public, anon, authenticated;

do $$
declare
  audited_table text;
begin
  foreach audited_table in array array[
    'applications',
    'billing_invoices',
    'billing_notifications',
    'billing_subscriptions',
    'branch_requests',
    'cards',
    'client_error_reports',
    'customers',
    'demo_accounts',
    'demo_tenants',
    'products',
    'promotion_claims',
    'promotions',
    'promotions_scanned',
    'site_feedback',
    'store_reviews',
    'stores',
    'subscription_plan_changes',
    'system_runtime_config',
    'users'
  ]
  loop
    execute format('drop trigger if exists capture_audit_event on public.%I', audited_table);
    execute format(
      'create trigger capture_audit_event after insert or update or delete on public.%I for each row execute function private.capture_audit_event()',
      audited_table
    );
  end loop;
end
$$;

create or replace function public.get_activity_log_overview()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'total', count(*),
    'last24Hours', count(*) filter (where created_at >= now() - interval '24 hours'),
    'shopChanges', count(*) filter (
      where entity_type in ('stores', 'products', 'promotions', 'store_reviews')
        or metadata ? 'storeId'
    ),
    'privilegedChanges', count(*) filter (
      where actor_role in ('admin', 'assistant_admin', 'auditor')
        or source = 'admin_backend'
    ),
    'issues', count(*) filter (where outcome in ('failure', 'blocked')),
    'generatedAt', now()
  )
  from public.audit_events
$$;

create or replace function public.list_activity_logs(
  p_search text default '',
  p_outcome text default 'all',
  p_source text default 'all',
  p_actor_role text default 'all',
  p_entity_type text default 'all',
  p_store_id text default 'all',
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_page integer default 1,
  p_page_size integer default 25,
  p_include_sensitive boolean default false
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  result jsonb;
  safe_search text := lower(btrim(coalesce(p_search, '')));
  safe_page integer := greatest(1, coalesce(p_page, 1));
  safe_page_size integer := greatest(10, least(100, coalesce(p_page_size, 25)));
  row_offset integer := (greatest(1, coalesce(p_page, 1)) - 1)
    * greatest(10, least(100, coalesce(p_page_size, 25)));
begin
  with base as (
    select
      e.id,
      e.actor_user_id,
      case when p_include_sensitive then e.actor_email else null end as actor_email,
      e.actor_role,
      e.action,
      e.entity_type,
      e.entity_id,
      e.outcome,
      e.source,
      case
        when p_include_sensitive then e.metadata
        else jsonb_strip_nulls(jsonb_build_object(
          'storeId', e.metadata->>'storeId',
          'storeName', coalesce(s.data->>'businessName', s.data->>'name'),
          'status', e.metadata->>'status',
          'changedFields', e.metadata->'changedFields',
          'dataChangedFields', e.metadata->'dataChangedFields'
        ))
      end as metadata,
      e.created_at,
      coalesce(
        e.metadata->>'storeId',
        case when e.entity_type = 'stores' then e.entity_id end
      ) as store_id,
      coalesce(s.data->>'businessName', s.data->>'name', e.metadata->>'name', '') as store_name,
      s.public_id as store_public_id
    from public.audit_events e
    left join public.stores s
      on s.id = coalesce(
        e.metadata->>'storeId',
        case when e.entity_type = 'stores' then e.entity_id end
      )
  ),
  filtered as (
    select *
    from base
    where (coalesce(p_outcome, 'all') = 'all' or outcome = p_outcome)
      and (coalesce(p_source, 'all') = 'all' or source = p_source)
      and (coalesce(p_actor_role, 'all') = 'all' or actor_role = p_actor_role)
      and (coalesce(p_entity_type, 'all') = 'all' or entity_type = p_entity_type)
      and (coalesce(p_store_id, 'all') = 'all' or store_id = p_store_id)
      and (p_date_from is null or created_at >= p_date_from)
      and (p_date_to is null or created_at <= p_date_to)
      and (
        safe_search = ''
        or lower(concat_ws(
          ' ',
          action,
          entity_type,
          entity_id,
          actor_email,
          actor_role,
          source,
          outcome,
          store_name,
          store_public_id,
          metadata::text
        )) like '%' || safe_search || '%'
      )
  ),
  page_rows as (
    select *
    from filtered
    order by created_at desc, id desc
    limit safe_page_size offset row_offset
  )
  select jsonb_build_object(
    'records', coalesce(
      (select jsonb_agg(to_jsonb(page_rows) order by created_at desc, id desc) from page_rows),
      '[]'::jsonb
    ),
    'total', (select count(*) from filtered),
    'page', safe_page,
    'pageSize', safe_page_size
  )
  into result;

  return result;
end;
$$;

revoke all on function public.get_activity_log_overview() from public, anon, authenticated;
revoke all on function public.list_activity_logs(
  text, text, text, text, text, text, timestamptz, timestamptz, integer, integer, boolean
) from public, anon, authenticated;
grant execute on function public.get_activity_log_overview() to service_role;
grant execute on function public.list_activity_logs(
  text, text, text, text, text, text, timestamptz, timestamptz, integer, integer, boolean
) to service_role;
