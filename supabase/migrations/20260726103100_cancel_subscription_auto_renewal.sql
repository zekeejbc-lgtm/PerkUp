alter table public.billing_subscriptions
  add column if not exists renewal_mode text not null default 'automatic',
  add column if not exists auto_renew_cancelled_at timestamptz;

alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_renewal_mode_check;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_renewal_mode_check
  check (renewal_mode in ('automatic', 'manual'));

alter table public.billing_notifications
  drop constraint if exists billing_notifications_status_check;
alter table public.billing_notifications
  add constraint billing_notifications_status_check
  check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled'));

create or replace function public.cancel_subscription_auto_renewal(
  p_store_id text,
  p_owner_user_id text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  subscription_row public.billing_subscriptions%rowtype;
  store_data jsonb;
  access_data jsonb;
  next_access_status text;
begin
  select *
  into subscription_row
  from public.billing_subscriptions
  where store_id = p_store_id
    and owner_user_id = p_owner_user_id
  for update;

  if not found then
    raise exception 'Billing subscription was not found for this store owner.'
      using errcode = 'P0002';
  end if;

  if subscription_row.initial_payment_required then
    raise exception 'The initial subscription must be paid before automatic renewal can be cancelled.'
      using errcode = '22000';
  end if;

  select coalesce(data, '{}'::jsonb)
  into store_data
  from public.stores
  where id = subscription_row.store_id
  for update;

  if not found then
    raise exception 'Store was not found.' using errcode = 'P0002';
  end if;

  next_access_status := case
    when p_now >= subscription_row.current_period_end then 'frozen'
    else 'active'
  end;

  update public.billing_subscriptions
  set automation_enabled = false,
      renewal_mode = 'manual',
      auto_renew_cancelled_at = coalesce(auto_renew_cancelled_at, p_now),
      status = case
        when next_access_status = 'frozen' then 'frozen'
        else 'cancelled'
      end
  where id = subscription_row.id;

  access_data := coalesce(store_data->'subscriptionAccess', '{}'::jsonb) || jsonb_build_object(
    'status', next_access_status,
    'automationEnabled', false,
    'renewalMode', 'manual',
    'autoRenewCancelledAt', coalesce(
      store_data->'subscriptionAccess'->>'autoRenewCancelledAt',
      p_now::text
    ),
    'paymentLink', case
      when next_access_status = 'frozen'
        then coalesce(store_data->'subscriptionAccess'->>'paymentLink', '')
      else ''
    end,
    'graceStartedAt', '',
    'graceEndsAt', '',
    'updatedAt', p_now::text,
    'updatedBy', 'store-owner-auto-renewal-cancellation'
  );

  update public.stores
  set data = store_data || jsonb_build_object(
    'subscriptionAccess', access_data,
    'updatedAt', jsonb_build_object(
      'seconds', floor(extract(epoch from p_now))::bigint,
      'nanoseconds', 0
    )
  )
  where id = subscription_row.store_id;

  update public.billing_notifications n
  set status = 'cancelled',
      last_error = 'Automatic renewal was cancelled by the store owner.',
      next_attempt_at = p_now
  from public.billing_invoices i
  where i.id = n.invoice_id
    and i.subscription_id = subscription_row.id
    and n.notification_type <> 'admin_failure'
    and n.status in ('pending', 'sending', 'failed');

  return jsonb_build_object(
    'storeId', subscription_row.store_id,
    'subscriptionId', subscription_row.id,
    'renewalMode', 'manual',
    'automationEnabled', false,
    'currentPeriodEnd', subscription_row.current_period_end,
    'accessStatus', next_access_status,
    'cancelledAt', coalesce(subscription_row.auto_renew_cancelled_at, p_now)
  );
end;
$$;

revoke all on function public.cancel_subscription_auto_renewal(text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.cancel_subscription_auto_renewal(text, text, timestamptz)
  to service_role;

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
    and s.renewal_mode = 'automatic'
    and s.status in ('active', 'past_due')
    and s.next_billing_at <= p_now + make_interval(days => s.warning_lead_days)
  on conflict on constraint billing_invoices_subscription_id_period_start_key do nothing;

  return query
  with candidates as (
    select i.id
    from public.billing_invoices i
    join public.billing_subscriptions s on s.id = i.subscription_id
    where s.automation_enabled
      and s.renewal_mode = 'automatic'
      and s.status in ('active', 'past_due')
      and i.status in ('pending', 'link_created', 'failed')
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
    for update of i skip locked
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

revoke all on function public.claim_due_billing_invoices(integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_due_billing_invoices(integer, timestamptz)
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
    join public.billing_invoices i on i.id = n.invoice_id
    join public.billing_subscriptions s on s.id = i.subscription_id
    where n.notification_type in (
        'payment_overdue', 'access_frozen', 'payment_received', 'admin_failure',
        'initial_payment_reminder_3d', 'initial_payment_reminder_5d',
        'initial_payment_deletion_warning'
      )
      and n.status in ('pending', 'failed', 'sending')
      and n.next_attempt_at <= p_now
      and (
        n.notification_type = 'admin_failure'
        or (
          s.automation_enabled
          and s.renewal_mode = 'automatic'
          and s.status not in ('paused', 'cancelled')
        )
      )
    order by n.next_attempt_at, n.created_at
    for update of n skip locked
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
        when s.renewal_mode = 'manual' and p_now >= s.current_period_end then 'frozen'
        when s.renewal_mode = 'manual' then 'active'
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
    where (
      s.automation_enabled
      and s.renewal_mode = 'automatic'
      and s.status not in ('paused', 'cancelled')
    ) or (
      not s.automation_enabled
      and s.renewal_mode = 'manual'
      and s.status <> 'paused'
    )
  ), updated_subscriptions as (
    update public.billing_subscriptions s
    set status = case
      when st.renewal_mode = 'manual' and st.access_status = 'active' then 'cancelled'
      when st.access_status = 'frozen' then 'frozen'
      when st.access_status = 'grace' then 'past_due'
      else 'active'
    end
    from states st
    where s.id = st.id
      and s.status is distinct from case
        when st.renewal_mode = 'manual' and st.access_status = 'active' then 'cancelled'
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
        'automationEnabled', st.automation_enabled,
        'renewalMode', st.renewal_mode,
        'autoRenewCancelledAt', coalesce(st.auto_renew_cancelled_at::text, ''),
        'gracePeriodDays', st.grace_period_days,
        'graceStartedAt', case
          when st.renewal_mode = 'automatic'
            and not st.initial_payment_required
            and st.access_status in ('grace', 'frozen')
          then st.current_period_end::text
          else ''
        end,
        'graceEndsAt', case
          when st.renewal_mode = 'automatic'
            and not st.initial_payment_required
            and st.access_status in ('grace', 'frozen')
          then (st.current_period_end + make_interval(days => st.grace_period_days))::text
          else ''
        end,
        'paymentLink', case
          when st.access_status = 'frozen'
            and nullif(st.latest_payment_url, '') is not null
          then st.latest_payment_url
          when st.renewal_mode = 'automatic'
            and st.access_status in ('warning', 'grace')
            and nullif(st.latest_payment_url, '') is not null
          then st.latest_payment_url
          when st.renewal_mode = 'manual' and st.access_status = 'active'
          then ''
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
        or coalesce(store.data->'subscriptionAccess'->>'automationEnabled', 'false')::boolean is distinct from st.automation_enabled
        or coalesce(store.data->'subscriptionAccess'->>'renewalMode', '') is distinct from st.renewal_mode
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
