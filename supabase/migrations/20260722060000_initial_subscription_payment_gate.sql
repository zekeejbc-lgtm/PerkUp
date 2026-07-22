alter table public.billing_subscriptions
  add column if not exists initial_payment_required boolean not null default false;

alter table public.billing_invoices
  add column if not exists invoice_type text not null default 'renewal';

alter table public.billing_invoices
  drop constraint if exists billing_invoices_invoice_type_check;

alter table public.billing_invoices
  add constraint billing_invoices_invoice_type_check
  check (invoice_type in ('initial', 'renewal'));

create or replace function public.refresh_billing_access_states(p_now timestamptz default now())
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed_count integer := 0;
begin
  with states as (
    select
      s.*,
      case
        when s.initial_payment_required then 'frozen'
        when p_now >= s.current_period_end + make_interval(days => s.grace_period_days) then 'frozen'
        when p_now >= s.current_period_end then 'grace'
        when p_now >= s.current_period_end - make_interval(days => s.warning_lead_days) then 'warning'
        else 'active'
      end as access_status,
      invoice.payment_url as latest_payment_url
    from public.billing_subscriptions s
    left join lateral (
      select i.payment_url
      from public.billing_invoices i
      where i.subscription_id = s.id
        and i.status in ('link_created', 'failed')
        and nullif(i.payment_url, '') is not null
      order by i.due_at desc, i.created_at desc
      limit 1
    ) invoice on true
    where s.automation_enabled and s.status not in ('paused', 'cancelled')
  ), updated_subscriptions as (
    update public.billing_subscriptions s
    set status = case
      when st.access_status = 'frozen' then 'frozen'
      when st.access_status = 'grace' then 'past_due'
      else 'active'
    end
    from states st
    where s.id = st.id
      and s.status is distinct from case
        when st.access_status = 'frozen' then 'frozen'
        when st.access_status = 'grace' then 'past_due'
        else 'active'
      end
    returning s.id
  ), updated_stores as (
    update public.stores store
    set data = jsonb_set(
      coalesce(store.data, '{}'::jsonb),
      '{subscriptionAccess}',
      coalesce(store.data->'subscriptionAccess', '{}'::jsonb) || jsonb_build_object(
        'status', st.access_status,
        'gracePeriodDays', st.grace_period_days,
        'graceStartedAt', case
          when not st.initial_payment_required and st.access_status in ('grace', 'frozen') then st.current_period_end::text
          else ''
        end,
        'graceEndsAt', case
          when not st.initial_payment_required and st.access_status in ('grace', 'frozen')
            then (st.current_period_end + make_interval(days => st.grace_period_days))::text
          else ''
        end,
        'paymentLink', case
          when st.access_status in ('warning', 'grace', 'frozen')
            and nullif(st.latest_payment_url, '') is not null
          then st.latest_payment_url
          else coalesce(store.data->'subscriptionAccess'->>'paymentLink', '')
        end,
        'updatedAt', p_now::text,
        'updatedBy', 'subscription-billing-worker'
      ),
      true
    )
    from states st
    where store.id = st.store_id
      and (
        coalesce(store.data->'subscriptionAccess'->>'status', '') is distinct from st.access_status
        or (
          st.access_status in ('warning', 'grace', 'frozen')
          and nullif(st.latest_payment_url, '') is not null
          and coalesce(store.data->'subscriptionAccess'->>'paymentLink', '') is distinct from st.latest_payment_url
        )
      )
    returning store.id
  )
  select count(*) into changed_count from updated_stores;
  return changed_count;
end;
$$;

revoke all on function public.refresh_billing_access_states(timestamptz)
  from public, anon, authenticated;
grant execute on function public.refresh_billing_access_states(timestamptz)
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

  if invoice_row.invoice_type = 'initial' then
    new_period_start := p_paid_at;
  else
    new_period_start := greatest(subscription_row.current_period_end, p_paid_at);
  end if;
  new_period_end := new_period_start + make_interval(days => subscription_row.interval_days);

  update public.billing_invoices set
    status = 'paid',
    period_start = case when invoice_row.invoice_type = 'initial' then new_period_start else period_start end,
    period_end = case when invoice_row.invoice_type = 'initial' then new_period_end else period_end end,
    paid_at = p_paid_at,
    paymongo_event_id = p_paymongo_event_id,
    gross_amount_centavos = p_amount_centavos,
    last_error = null,
    next_attempt_at = p_paid_at
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
    initial_payment_required = case when invoice_row.invoice_type = 'initial' then false else initial_payment_required end,
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
    'initialPaymentRequired', false,
    'initialPaymentStatus', case when invoice_row.invoice_type = 'initial' then 'paid' else coalesce(store_data->>'initialPaymentStatus', 'waived') end,
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
