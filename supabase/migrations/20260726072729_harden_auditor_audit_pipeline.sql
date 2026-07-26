-- Preserve legacy audit rows without inventing an actor. New database-triggered
-- events distinguish authenticated users from service/system activity.
update public.audit_events
set
  actor_role = 'legacy_unattributed',
  metadata = metadata || '{"attribution":"legacy_unattributed"}'::jsonb
where actor_user_id is null
  and actor_email is null
  and actor_role is null;

create or replace function private.capture_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  row_id text;
  event_metadata jsonb := '{}'::jsonb;
  event_actor_id uuid := (select auth.uid());
  event_actor_email text;
  event_actor_role text;
  request_claims text := nullif(current_setting('request.jwt.claims', true), '');
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  row_id := row_data->>'id';

  if event_actor_id is not null then
    select
      u.data->>'email',
      u.data->>'role'
    into event_actor_email, event_actor_role
    from public.users u
    where u.id = event_actor_id::text;
  else
    event_actor_role := coalesce(request_claims::jsonb->>'role', 'system');
    event_metadata := event_metadata || jsonb_build_object(
      'attribution',
      case
        when event_actor_role = 'service_role' then 'service_operation'
        else 'system_operation'
      end
    );
  end if;

  if tg_table_name = 'users' then
    event_metadata := event_metadata || jsonb_build_object(
      'role', row_data->'data'->>'role',
      'accountStatus', coalesce(row_data->'data'->>'accountStatus', 'active'),
      'storeId', row_data->'data'->>'storeId'
    );
  elsif tg_table_name = 'stores' then
    event_metadata := event_metadata || jsonb_build_object(
      'name', coalesce(row_data->'data'->>'businessName', row_data->'data'->>'name'),
      'status', row_data->'data'->>'status',
      'ownerId', row_data->'data'->>'ownerId'
    );
  elsif tg_table_name = 'billing_invoices' then
    event_metadata := event_metadata || jsonb_build_object(
      'storeId', row_data->>'store_id',
      'status', row_data->>'status',
      'invoiceType', row_data->>'invoice_type',
      'amountCentavos', row_data->'amount_centavos',
      'currency', row_data->>'currency',
      'paymentMethod', row_data->>'payment_method'
    );
  elsif tg_table_name = 'billing_subscriptions' then
    event_metadata := event_metadata || jsonb_build_object(
      'storeId', row_data->>'store_id',
      'status', row_data->>'status',
      'planId', row_data->>'plan_id',
      'amountCentavos', row_data->'amount_centavos'
    );
  elsif tg_table_name = 'billing_notifications' then
    event_metadata := event_metadata || jsonb_build_object(
      'invoiceId', row_data->>'invoice_id',
      'type', row_data->>'notification_type',
      'channel', row_data->>'channel',
      'status', row_data->>'status'
    );
  elsif tg_table_name = 'promotions_scanned' then
    event_metadata := event_metadata || jsonb_build_object(
      'type', coalesce(row_data->'data'->>'type', 'loyalty_scan'),
      'storeId', row_data->'data'->>'storeId',
      'customerId', row_data->'data'->>'customerId',
      'staffId', row_data->'data'->>'staffId',
      'status', row_data->'data'->>'status'
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

-- These reporting functions are intentionally invoker-security and executable
-- only by service_role. The Edge Function authenticates and authorizes the
-- Auditor before calling them.
create or replace function public.get_auditor_audit_overview()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'financial', jsonb_build_object(
      'grossCentavos', coalesce(sum(coalesce(i.gross_amount_centavos, i.amount_centavos))
        filter (where i.status = 'paid'), 0),
      'feeCentavos', coalesce(sum(coalesce(i.fee_centavos, 0))
        filter (where i.status = 'paid'), 0),
      'netCentavos', coalesce(sum(coalesce(i.net_amount_centavos, i.amount_centavos))
        filter (where i.status = 'paid'), 0),
      'paidTransactions', count(*) filter (where i.status = 'paid'),
      'issuedInvoices', count(*),
      'outstandingInvoices', count(*) filter (where i.status in ('pending', 'link_created')),
      'failedInvoices', count(*) filter (where i.status = 'failed')
    ),
    'receipts', jsonb_build_object(
      'total', (select count(*) from public.billing_notifications),
      'sent', (select count(*) from public.billing_notifications where status = 'sent'),
      'failed', (select count(*) from public.billing_notifications where status = 'failed')
    ),
    'audit', jsonb_build_object(
      'total', (select count(*) from public.audit_events),
      'failures', (select count(*) from public.audit_events where outcome <> 'success')
    ),
    'generatedAt', now()
  )
  from public.billing_invoices i
  left join public.stores s on s.id = i.store_id
  where coalesce(s.data->>'isDemo', 'false') <> 'true'
$$;

create or replace function public.list_auditor_audit_records(
  p_section text,
  p_search text default '',
  p_status text default 'all',
  p_page integer default 1,
  p_page_size integer default 25
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
  safe_status text := lower(btrim(coalesce(p_status, 'all')));
  safe_page integer := greatest(1, coalesce(p_page, 1));
  safe_page_size integer := greatest(10, least(100, coalesce(p_page_size, 25)));
  row_offset integer;
begin
  row_offset := (safe_page - 1) * safe_page_size;

  if p_section = 'financial' then
    with base as (
      select
        i.id,
        i.subscription_id,
        i.store_id,
        i.owner_user_id,
        i.invoice_type,
        i.status,
        i.amount_centavos,
        i.currency,
        i.paymongo_reference_number,
        i.manual_payment_reference,
        i.paid_at,
        i.payment_method,
        i.paymongo_payment_id,
        i.gross_amount_centavos,
        i.fee_centavos,
        i.net_amount_centavos,
        i.due_at,
        i.created_at,
        i.updated_at,
        coalesce(s.data->>'businessName', s.data->>'name', '') as "storeName",
        coalesce(i.manual_payment_reference, i.paymongo_reference_number, i.paymongo_payment_id, '') as reference
      from public.billing_invoices i
      left join public.stores s on s.id = i.store_id
      where coalesce(s.data->>'isDemo', 'false') <> 'true'
    ),
    filtered as (
      select *
      from base
      where (safe_status = 'all' or status = safe_status)
        and (safe_search = '' or lower(to_jsonb(base)::text) like '%' || safe_search || '%')
    ),
    page_rows as (
      select * from filtered order by created_at desc, id desc
      limit safe_page_size offset row_offset
    )
    select jsonb_build_object(
      'records', coalesce((select jsonb_agg(to_jsonb(page_rows) order by created_at desc, id desc) from page_rows), '[]'::jsonb),
      'total', (select count(*) from filtered),
      'page', safe_page,
      'pageSize', safe_page_size
    ) into result;
  elsif p_section = 'receipts' then
    with base as (
      select
        n.id,
        n.invoice_id,
        n.channel,
        n.notification_type,
        n.recipient,
        n.status,
        n.attempt_count,
        n.last_error,
        n.sent_at,
        n.created_at,
        n.updated_at,
        coalesce(i.status, '') as "invoiceStatus",
        coalesce(i.amount_centavos, 0) as "amountCentavos",
        coalesce(i.currency, 'PHP') as currency,
        coalesce(i.store_id, '') as "storeId",
        coalesce(s.data->>'businessName', s.data->>'name', '') as "storeName"
      from public.billing_notifications n
      left join public.billing_invoices i on i.id = n.invoice_id
      left join public.stores s on s.id = i.store_id
      where coalesce(s.data->>'isDemo', 'false') <> 'true'
    ),
    filtered as (
      select *
      from base
      where (safe_status = 'all' or status = safe_status)
        and (safe_search = '' or lower(to_jsonb(base)::text) like '%' || safe_search || '%')
    ),
    page_rows as (
      select * from filtered order by created_at desc, id desc
      limit safe_page_size offset row_offset
    )
    select jsonb_build_object(
      'records', coalesce((select jsonb_agg(to_jsonb(page_rows) order by created_at desc, id desc) from page_rows), '[]'::jsonb),
      'total', (select count(*) from filtered),
      'page', safe_page,
      'pageSize', safe_page_size
    ) into result;
  elsif p_section = 'loyalty' then
    with base as (
      select
        p.id::text as id,
        coalesce(p.data->>'type', 'loyalty_scan') as type,
        coalesce(p.data->>'status', 'completed') as status,
        coalesce(p.data->>'storeId', '') as "storeId",
        coalesce(s.data->>'businessName', s.data->>'name', '') as "storeName",
        coalesce(p.data->>'customerId', '') as "customerId",
        coalesce(p.data->>'staffId', '') as "staffId",
        coalesce(p.data->>'promotionId', '') as "promotionId",
        coalesce(nullif(p.data->>'stars', '')::numeric, nullif(p.data->>'points', '')::numeric, 0) as amount,
        coalesce(
          nullif(p.data->>'timestamp', '')::timestamptz,
          nullif(p.data->>'redeemedAt', '')::timestamptz,
          nullif(p.data->>'createdAt', '')::timestamptz,
          p.created_at
        ) as "occurredAt",
        p.created_at
      from public.promotions_scanned p
      left join public.stores s on s.id = p.data->>'storeId'
      where coalesce(s.data->>'isDemo', 'false') <> 'true'
    ),
    filtered as (
      select *
      from base
      where (safe_status = 'all' or status = safe_status)
        and (safe_search = '' or lower(to_jsonb(base)::text) like '%' || safe_search || '%')
    ),
    page_rows as (
      select id, type, status, "storeId", "storeName", "customerId", "staffId",
        "promotionId", amount, "occurredAt"
      from filtered
      order by "occurredAt" desc, id desc
      limit safe_page_size offset row_offset
    )
    select jsonb_build_object(
      'records', coalesce((select jsonb_agg(to_jsonb(page_rows) order by "occurredAt" desc, id desc) from page_rows), '[]'::jsonb),
      'total', (select count(*) from filtered),
      'page', safe_page,
      'pageSize', safe_page_size
    ) into result;
  elsif p_section = 'events' then
    with filtered as (
      select
        id,
        actor_user_id,
        actor_email,
        actor_role,
        action,
        entity_type,
        entity_id,
        outcome,
        source,
        metadata,
        created_at
      from public.audit_events e
      where (safe_status = 'all' or outcome = safe_status)
        and (safe_search = '' or lower(to_jsonb(e)::text) like '%' || safe_search || '%')
    ),
    page_rows as (
      select * from filtered order by created_at desc, id desc
      limit safe_page_size offset row_offset
    )
    select jsonb_build_object(
      'records', coalesce((select jsonb_agg(to_jsonb(page_rows) order by created_at desc, id desc) from page_rows), '[]'::jsonb),
      'total', (select count(*) from filtered),
      'page', safe_page,
      'pageSize', safe_page_size
    ) into result;
  else
    raise exception 'Select a valid audit section.' using errcode = '22023';
  end if;

  return result;
end;
$$;

revoke all on function public.get_auditor_audit_overview() from public, anon, authenticated;
revoke all on function public.list_auditor_audit_records(text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_auditor_audit_overview() to service_role;
grant execute on function public.list_auditor_audit_records(text, text, text, integer, integer)
  to service_role;
