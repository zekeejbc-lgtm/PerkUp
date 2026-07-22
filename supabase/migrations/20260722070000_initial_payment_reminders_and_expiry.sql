alter table public.billing_notifications
  drop constraint if exists billing_notifications_notification_type_check;
alter table public.billing_notifications
  add constraint billing_notifications_notification_type_check
  check (notification_type in (
    'payment_due',
    'payment_overdue',
    'access_frozen',
    'payment_received',
    'admin_failure',
    'initial_payment_reminder_3d',
    'initial_payment_reminder_5d',
    'initial_payment_deletion_warning'
  ));

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
        when i.invoice_type = 'initial' and s.initial_payment_required and p_now >= i.created_at + interval '12 days'
          then 'initial_payment_deletion_warning'
        when i.invoice_type = 'initial' and s.initial_payment_required and p_now >= i.created_at + interval '5 days'
          then 'initial_payment_reminder_5d'
        when i.invoice_type = 'initial' and s.initial_payment_required and p_now >= i.created_at + interval '3 days'
          then 'initial_payment_reminder_3d'
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
      i.id,
      'perkup.shop@youthserviceph.org'::text,
      'admin_failure'::text
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
    where n.notification_type in (
        'payment_overdue', 'access_frozen', 'payment_received', 'admin_failure',
        'initial_payment_reminder_3d', 'initial_payment_reminder_5d',
        'initial_payment_deletion_warning'
      )
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

create or replace function public.claim_expired_initial_payment_accounts(
  p_limit integer default 10,
  p_now timestamptz default now()
)
returns table (store_id text, owner_user_id text)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select i.id, s.store_id, s.owner_user_id
    from public.billing_subscriptions s
    join public.billing_invoices i
      on i.subscription_id = s.id and i.invoice_type = 'initial'
    where s.initial_payment_required
      and (
        i.status in ('pending', 'link_created', 'failed')
        or (i.status = 'expired' and i.next_attempt_at <= p_now)
      )
      and i.created_at <= p_now - interval '15 days'
    order by i.created_at
    for update of i skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  ), expired as (
    update public.billing_invoices i
    set status = 'expired',
        last_error = 'Initial subscription payment was not received within 15 days.',
        next_attempt_at = p_now + interval '1 hour'
    from candidates c
    where i.id = c.id
    returning c.store_id, c.owner_user_id
  )
  select e.store_id, e.owner_user_id from expired e;
end;
$$;

revoke all on function public.claim_expired_initial_payment_accounts(integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_expired_initial_payment_accounts(integer, timestamptz)
  to service_role;
