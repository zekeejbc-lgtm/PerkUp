alter table public.billing_subscriptions
  add column if not exists pending_amount_centavos integer,
  add column if not exists pending_amount_effective_at timestamptz;

alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_pending_amount_centavos_check;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_pending_amount_centavos_check
  check (pending_amount_centavos is null or pending_amount_centavos between 100 and 999999999);

alter table public.billing_invoices
  add column if not exists paymongo_payment_id text,
  add column if not exists payment_method text,
  add column if not exists gross_amount_centavos integer,
  add column if not exists fee_centavos integer,
  add column if not exists net_amount_centavos integer;

create unique index if not exists billing_invoices_paymongo_payment_id_idx
  on public.billing_invoices (paymongo_payment_id)
  where paymongo_payment_id is not null;

alter table public.billing_notifications
  add column if not exists next_attempt_at timestamptz not null default now();

alter table public.billing_notifications
  drop constraint if exists billing_notifications_status_check;
alter table public.billing_notifications
  add constraint billing_notifications_status_check
  check (status in ('pending', 'sending', 'sent', 'failed'));

alter table public.billing_notifications
  drop constraint if exists billing_notifications_notification_type_check;
alter table public.billing_notifications
  add constraint billing_notifications_notification_type_check
  check (notification_type in (
    'payment_due',
    'payment_overdue',
    'access_frozen',
    'payment_received',
    'admin_failure'
  ));

drop index if exists public.billing_notifications_retry_idx;
create index billing_notifications_retry_idx
  on public.billing_notifications (next_attempt_at, created_at)
  where status in ('pending', 'sending', 'failed');

create or replace function public.claim_due_billing_invoices(
  p_limit integer default 20,
  p_now timestamptz default now()
)
returns table (
  invoice_id uuid,
  subscription_id uuid,
  store_id text,
  owner_user_id text,
  billing_email text,
  plan_id text,
  amount_centavos integer,
  currency text,
  due_at timestamptz,
  paymongo_link_id text,
  paymongo_reference_number text,
  payment_url text,
  livemode boolean,
  notification_sent boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.billing_invoices (
    subscription_id, store_id, owner_user_id, period_start, period_end,
    due_at, amount_centavos, currency, next_attempt_at
  )
  select
    s.id, s.store_id, s.owner_user_id, s.current_period_end,
    s.current_period_end + make_interval(days => s.interval_days),
    s.next_billing_at,
    case
      when s.pending_amount_centavos is not null
        and s.pending_amount_effective_at is not null
        and s.pending_amount_effective_at <= s.next_billing_at
      then s.pending_amount_centavos
      else s.amount_centavos
    end,
    s.currency,
    p_now
  from public.billing_subscriptions s
  where s.automation_enabled
    and s.status in ('active', 'past_due')
    and s.next_billing_at <= p_now + make_interval(days => s.warning_lead_days)
  on conflict on constraint billing_invoices_subscription_id_period_start_key do nothing;

  return query
  with candidates as (
    select i.id
    from public.billing_invoices i
    where i.status in ('pending', 'link_created', 'failed')
      and i.next_attempt_at <= p_now
      and (
        i.paymongo_link_id is null
        or not exists (
          select 1 from public.billing_notifications n
          where n.invoice_id = i.id
            and n.channel = 'email'
            and n.notification_type = 'payment_due'
            and n.status = 'sent'
        )
      )
    order by i.due_at, i.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  ), claimed as (
    update public.billing_invoices i
    set attempt_count = i.attempt_count + 1,
        next_attempt_at = p_now + interval '10 minutes',
        last_error = null
    from candidates c
    where i.id = c.id
    returning i.*
  )
  select
    i.id, i.subscription_id, i.store_id, i.owner_user_id,
    s.billing_email, s.plan_id, i.amount_centavos, i.currency, i.due_at,
    i.paymongo_link_id, i.paymongo_reference_number, i.payment_url, i.livemode,
    exists (
      select 1 from public.billing_notifications n
      where n.invoice_id = i.id and n.channel = 'email'
        and n.notification_type = 'payment_due' and n.status = 'sent'
    )
  from claimed i
  join public.billing_subscriptions s on s.id = i.subscription_id;
end;
$$;

create or replace function public.queue_billing_lifecycle_notifications(p_now timestamptz default now())
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  queued_count integer := 0;
begin
  with candidates as (
    select
      i.id as invoice_id,
      s.billing_email as recipient,
      case
        when i.status = 'paid' then 'payment_received'
        when p_now >= i.due_at + make_interval(days => s.grace_period_days) then 'access_frozen'
        when p_now >= i.due_at then 'payment_overdue'
        else null
      end as notification_type
    from public.billing_invoices i
    join public.billing_subscriptions s on s.id = i.subscription_id
    where s.automation_enabled
      and (
        i.status = 'paid'
        or (
          i.status in ('link_created', 'failed')
          and i.paymongo_link_id is not null
          and p_now >= i.due_at
        )
      )
    union all
    select
      i.id as invoice_id,
      'perkup.shop@youthserviceph.org'::text as recipient,
      'admin_failure'::text as notification_type
    from public.billing_invoices i
    where i.status in ('pending', 'link_created', 'failed')
      and i.attempt_count >= 3
      and nullif(i.last_error, '') is not null
  ), inserted as (
    insert into public.billing_notifications (
      invoice_id, channel, notification_type, recipient, status, attempt_count, next_attempt_at
    )
    select invoice_id, 'email', notification_type, recipient, 'pending', 0, p_now
    from candidates
    where notification_type is not null
    on conflict (invoice_id, channel, notification_type) do nothing
    returning id
  )
  select count(*) into queued_count from inserted;

  return queued_count;
end;
$$;

revoke all on function public.queue_billing_lifecycle_notifications(timestamptz)
  from public, anon, authenticated;
grant execute on function public.queue_billing_lifecycle_notifications(timestamptz)
  to service_role;

create or replace function public.claim_billing_notifications(
  p_limit integer default 50,
  p_now timestamptz default now()
)
returns table (
  id uuid,
  invoice_id uuid,
  notification_type text,
  recipient text,
  attempt_count integer
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select n.id
    from public.billing_notifications n
    where n.notification_type in ('payment_overdue', 'access_frozen', 'payment_received', 'admin_failure')
      and n.status in ('pending', 'failed', 'sending')
      and n.next_attempt_at <= p_now
    order by n.next_attempt_at, n.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  )
  update public.billing_notifications n
  set status = 'sending',
      attempt_count = n.attempt_count + 1,
      next_attempt_at = p_now + interval '10 minutes'
  from candidates c
  where n.id = c.id
  returning n.id, n.invoice_id, n.notification_type, n.recipient, n.attempt_count;
end;
$$;

revoke all on function public.claim_billing_notifications(integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_billing_notifications(integer, timestamptz)
  to service_role;

create or replace function public.fulfill_billing_invoice(
  p_invoice_id uuid,
  p_paymongo_event_id text,
  p_paymongo_link_id text,
  p_amount_centavos integer,
  p_currency text,
  p_livemode boolean,
  p_paid_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invoice_row public.billing_invoices%rowtype;
  subscription_row public.billing_subscriptions%rowtype;
  new_period_start timestamptz;
  new_period_end timestamptz;
  access_data jsonb;
  store_data jsonb;
begin
  select * into invoice_row from public.billing_invoices
  where id = p_invoice_id for update;
  if not found then raise exception 'Billing invoice was not found.' using errcode = 'P0002'; end if;

  if invoice_row.status = 'paid' then
    return jsonb_build_object('duplicate', true, 'invoiceId', invoice_row.id, 'paidAt', invoice_row.paid_at);
  end if;
  if invoice_row.paymongo_link_id is distinct from p_paymongo_link_id
    or invoice_row.amount_centavos is distinct from p_amount_centavos
    or invoice_row.currency is distinct from upper(p_currency)
    or invoice_row.livemode is distinct from p_livemode
  then
    raise exception 'PayMongo payment details do not match the invoice.' using errcode = '22000';
  end if;

  select * into subscription_row from public.billing_subscriptions
  where id = invoice_row.subscription_id for update;
  if not found then raise exception 'Billing subscription was not found.' using errcode = 'P0002'; end if;

  new_period_start := greatest(subscription_row.current_period_end, p_paid_at);
  new_period_end := new_period_start + make_interval(days => subscription_row.interval_days);

  update public.billing_invoices set
    status = 'paid', paid_at = p_paid_at, paymongo_event_id = p_paymongo_event_id,
    gross_amount_centavos = p_amount_centavos,
    last_error = null, next_attempt_at = p_paid_at
  where id = invoice_row.id;

  update public.billing_subscriptions set
    current_period_start = new_period_start,
    current_period_end = new_period_end,
    next_billing_at = new_period_end,
    amount_centavos = invoice_row.amount_centavos,
    pending_amount_centavos = case
      when pending_amount_effective_at is not null and pending_amount_effective_at <= invoice_row.due_at then null
      else pending_amount_centavos
    end,
    pending_amount_effective_at = case
      when pending_amount_effective_at is not null and pending_amount_effective_at <= invoice_row.due_at then null
      else pending_amount_effective_at
    end,
    status = 'active'
  where id = subscription_row.id;

  select coalesce(data, '{}'::jsonb) into store_data
  from public.stores where id = subscription_row.store_id for update;
  access_data := coalesce(store_data->'subscriptionAccess', '{}'::jsonb) || jsonb_build_object(
    'status', 'active',
    'paymentLink', '',
    'graceStartedAt', '',
    'graceEndsAt', '',
    'updatedAt', p_paid_at::text,
    'updatedBy', 'paymongo-webhook'
  );

  store_data := (store_data - 'pendingOwedAmount' - 'pendingOwedAmountEffectiveAt') || jsonb_build_object(
    'owedAmount', invoice_row.amount_centavos::numeric / 100,
    'subscriptionStart', new_period_start::text,
    'subscriptionEnd', new_period_end::text,
    'subscriptionAccess', access_data,
    'updatedAt', jsonb_build_object('seconds', floor(extract(epoch from p_paid_at))::bigint, 'nanoseconds', 0)
  );

  update public.stores set data = store_data where id = subscription_row.store_id;

  insert into public.billing_notifications (
    invoice_id, channel, notification_type, recipient, status, attempt_count, next_attempt_at
  ) values (
    invoice_row.id, 'email', 'payment_received', subscription_row.billing_email, 'pending', 0, p_paid_at
  ) on conflict (invoice_id, channel, notification_type) do nothing;

  return jsonb_build_object(
    'duplicate', false,
    'invoiceId', invoice_row.id,
    'storeId', subscription_row.store_id,
    'periodStart', new_period_start,
    'periodEnd', new_period_end
  );
end;
$$;

revoke all on function public.fulfill_billing_invoice(uuid, text, text, integer, text, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.fulfill_billing_invoice(uuid, text, text, integer, text, boolean, timestamptz)
  to service_role;
