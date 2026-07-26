create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  actor_role text,
  action text not null check (char_length(action) between 1 and 120),
  entity_type text not null check (char_length(entity_type) between 1 and 80),
  entity_id text check (char_length(entity_id) <= 160),
  outcome text not null default 'success'
    check (outcome in ('success', 'failure', 'blocked')),
  source text not null default 'database'
    check (source in ('database', 'admin_backend', 'auth', 'billing', 'system')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 32768),
  created_at timestamptz not null default now()
);

create index audit_events_created_at_idx
  on public.audit_events (created_at desc, id desc);
create index audit_events_action_created_idx
  on public.audit_events (action, created_at desc);
create index audit_events_entity_created_idx
  on public.audit_events (entity_type, entity_id, created_at desc);
create index audit_events_actor_created_idx
  on public.audit_events (actor_user_id, created_at desc)
  where actor_user_id is not null;

alter table public.audit_events enable row level security;
revoke all on public.audit_events from public, anon, authenticated;
grant select, insert on public.audit_events to service_role;

-- Auditor accounts have the same database capabilities as administrators.
-- A blocked account deliberately resolves to a non-privileged pseudo-role so
-- existing RLS policies stop granting it elevated access immediately.
create or replace function private.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce(u.data->>'accountStatus', 'active') in ('suspended', 'banned')
      then u.data->>'accountStatus'
    when u.data->>'role' in ('assistant_admin', 'auditor')
      then 'admin'
    else u.data->>'role'
  end
  from public.users u
  where u.id = (select auth.uid())::text
$$;

revoke all on function private.current_user_role() from public;
grant execute on function private.current_user_role() to authenticated;

create or replace function private.protect_permanent_auditor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  permanent_email constant text := 'ezequieljohncrisostomo20@gmail.com';
begin
  if lower(coalesce(old.data->>'email', '')) <> permanent_email then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'The permanent auditor account cannot be deleted.'
      using errcode = '42501';
  end if;

  if lower(coalesce(new.data->>'email', '')) <> permanent_email
    or coalesce(new.data->>'role', '') <> 'auditor'
    or coalesce(new.data->>'accountStatus', 'active') <> 'active'
  then
    raise exception 'The permanent auditor must remain an active auditor with its original email.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_permanent_auditor() from public, anon, authenticated;

drop trigger if exists protect_permanent_auditor on public.users;
create trigger protect_permanent_auditor
before update or delete on public.users
for each row execute function private.protect_permanent_auditor();

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
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  row_id := row_data->>'id';

  if tg_table_name = 'users' then
    event_metadata := jsonb_build_object(
      'role', row_data->'data'->>'role',
      'accountStatus', coalesce(row_data->'data'->>'accountStatus', 'active'),
      'storeId', row_data->'data'->>'storeId'
    );
  elsif tg_table_name = 'stores' then
    event_metadata := jsonb_build_object(
      'name', coalesce(row_data->'data'->>'businessName', row_data->'data'->>'name'),
      'status', row_data->'data'->>'status',
      'ownerId', row_data->'data'->>'ownerId'
    );
  elsif tg_table_name = 'billing_invoices' then
    event_metadata := jsonb_build_object(
      'storeId', row_data->>'store_id',
      'status', row_data->>'status',
      'invoiceType', row_data->>'invoice_type',
      'amountCentavos', row_data->'amount_centavos',
      'currency', row_data->>'currency',
      'paymentMethod', row_data->>'payment_method'
    );
  elsif tg_table_name = 'billing_subscriptions' then
    event_metadata := jsonb_build_object(
      'storeId', row_data->>'store_id',
      'status', row_data->>'status',
      'planId', row_data->>'plan_id',
      'amountCentavos', row_data->'amount_centavos'
    );
  elsif tg_table_name = 'billing_notifications' then
    event_metadata := jsonb_build_object(
      'invoiceId', row_data->>'invoice_id',
      'type', row_data->>'notification_type',
      'channel', row_data->>'channel',
      'status', row_data->>'status'
    );
  elsif tg_table_name = 'promotions_scanned' then
    event_metadata := jsonb_build_object(
      'type', coalesce(row_data->'data'->>'type', 'loyalty_scan'),
      'storeId', row_data->'data'->>'storeId',
      'customerId', row_data->'data'->>'customerId',
      'staffId', row_data->'data'->>'staffId',
      'status', row_data->'data'->>'status'
    );
  end if;

  insert into public.audit_events (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    source,
    metadata
  )
  values (
    (select auth.uid()),
    lower(tg_op) || '_' || tg_table_name,
    tg_table_name,
    row_id,
    case
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
    'users',
    'stores',
    'billing_subscriptions',
    'billing_invoices',
    'billing_notifications',
    'promotions_scanned'
  ]
  loop
    execute format(
      'drop trigger if exists capture_audit_event on public.%I',
      audited_table
    );
    execute format(
      'create trigger capture_audit_event after insert or update or delete on public.%I for each row execute function private.capture_audit_event()',
      audited_table
    );
  end loop;
end
$$;

create index if not exists users_account_status_idx
  on public.users ((coalesce(data->>'accountStatus', 'active')));
