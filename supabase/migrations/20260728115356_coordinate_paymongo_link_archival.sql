create or replace function public.begin_paymongo_link_creation(
  p_invoice_id uuid,
  p_creation_token text,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  subscription_id_value uuid;
  subscription_status text;
  invoice_status text;
  existing_link_id text;
  invoice_last_error text;
  invoice_next_attempt_at timestamptz;
  creation_marker constant text := 'PAYMONGO_LINK_CREATION_IN_PROGRESS:';
begin
  if nullif(btrim(p_creation_token), '') is null
    or char_length(p_creation_token) > 160
  then
    return false;
  end if;

  select i.subscription_id, i.status, i.paymongo_link_id, i.last_error, i.next_attempt_at
  into subscription_id_value, invoice_status, existing_link_id, invoice_last_error, invoice_next_attempt_at
  from public.billing_invoices i
  where i.id = p_invoice_id
  for update;

  if not found
    or nullif(existing_link_id, '') is not null
    or invoice_status not in ('pending', 'failed')
  then
    return false;
  end if;

  select s.status
  into subscription_status
  from public.billing_subscriptions s
  where s.id = subscription_id_value
  for update;

  if not found or subscription_status = 'paused' then
    return false;
  end if;

  if invoice_last_error like creation_marker || '%'
    and invoice_next_attempt_at > p_now
  then
    return false;
  end if;

  update public.billing_invoices
  set last_error = creation_marker || p_creation_token,
      next_attempt_at = greatest(next_attempt_at, p_now + interval '5 minutes')
  where id = p_invoice_id;

  return true;
end;
$$;

revoke all on function public.begin_paymongo_link_creation(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.begin_paymongo_link_creation(uuid, text, timestamptz)
  to service_role;

create or replace function public.begin_store_billing_deletion(
  p_store_ids text[]
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invoice_row record;
  subscription_row record;
  locked_count integer := 0;
begin
  if coalesce(cardinality(p_store_ids), 0) = 0 then
    return 0;
  end if;

  for invoice_row in
    select i.id
    from public.billing_invoices i
    where i.store_id = any(p_store_ids)
    order by i.id
    for update
  loop
    null;
  end loop;

  for subscription_row in
    select s.id
    from public.billing_subscriptions s
    where s.store_id = any(p_store_ids)
    order by s.id
    for update
  loop
    locked_count := locked_count + 1;
  end loop;

  if exists (
    select 1
    from public.billing_invoices i
    where i.store_id = any(p_store_ids)
      and i.last_error like 'PAYMONGO_LINK_CREATION_IN_PROGRESS:%'
  ) then
    raise exception 'PayMongo payment-link creation is still in progress. Retry deletion shortly.'
      using errcode = '55P03';
  end if;

  update public.billing_subscriptions
  set automation_enabled = false,
      status = 'paused'
  where store_id = any(p_store_ids);

  return locked_count;
end;
$$;

revoke all on function public.begin_store_billing_deletion(text[])
  from public, anon, authenticated;
grant execute on function public.begin_store_billing_deletion(text[])
  to service_role;

create or replace function public.retry_billing_invoice_safely(
  p_invoice_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invoice_row public.billing_invoices%rowtype;
  next_status text;
begin
  select *
  into invoice_row
  from public.billing_invoices i
  where i.id = p_invoice_id
  for update;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  if invoice_row.status in ('paid', 'void', 'expired') then
    return jsonb_build_object('result', 'closed');
  end if;

  if invoice_row.last_error like 'PAYMONGO_LINK_CREATION_IN_PROGRESS:%' then
    return jsonb_build_object('result', 'in_progress');
  end if;

  next_status := case
    when nullif(invoice_row.paymongo_link_id, '') is null then 'pending'
    else 'link_created'
  end;

  update public.billing_invoices
  set status = next_status,
      next_attempt_at = p_now,
      last_error = null
  where id = p_invoice_id;

  return jsonb_build_object(
    'result', 'updated',
    'invoice_id', p_invoice_id,
    'status', next_status
  );
end;
$$;

revoke all on function public.retry_billing_invoice_safely(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.retry_billing_invoice_safely(uuid, timestamptz)
  to service_role;

create or replace function public.begin_expired_initial_account_deletion(
  p_store_ids text[],
  p_subscription_id uuid,
  p_invoice_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  subscription_row record;
  invoice_status text;
  invoice_type_value text;
  invoice_subscription_id uuid;
begin
  if coalesce(cardinality(p_store_ids), 0) = 0 then
    return false;
  end if;

  select i.status, i.invoice_type, i.subscription_id
  into invoice_status, invoice_type_value, invoice_subscription_id
  from public.billing_invoices i
  where i.id = p_invoice_id
  for update;

  if not found
    or invoice_subscription_id <> p_subscription_id
    or invoice_type_value <> 'initial'
    or invoice_status <> 'expired'
  then
    return false;
  end if;

  for subscription_row in
    select s.id
    from public.billing_subscriptions s
    where s.store_id = any(p_store_ids)
    order by s.id
    for update
  loop
    null;
  end loop;

  if not exists (
    select 1
    from public.billing_subscriptions s
    where s.id = p_subscription_id
      and s.store_id = any(p_store_ids)
      and s.initial_payment_required = true
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.billing_invoices i
    where i.store_id = any(p_store_ids)
      and i.last_error like 'PAYMONGO_LINK_CREATION_IN_PROGRESS:%'
  ) then
    return false;
  end if;

  update public.billing_subscriptions
  set automation_enabled = false,
      status = 'paused'
  where store_id = any(p_store_ids);

  return true;
end;
$$;

revoke all on function public.begin_expired_initial_account_deletion(text[], uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.begin_expired_initial_account_deletion(text[], uuid, uuid)
  to service_role;
