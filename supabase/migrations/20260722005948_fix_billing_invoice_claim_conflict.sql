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
language sql
volatile
security invoker
set search_path = ''
as $$
  with inserted as (
    insert into public.billing_invoices (
      subscription_id, store_id, owner_user_id, period_start, period_end,
      due_at, amount_centavos, currency, next_attempt_at
    )
    select
      s.id, s.store_id, s.owner_user_id, s.current_period_end,
      s.current_period_end + make_interval(days => s.interval_days),
      s.next_billing_at, s.amount_centavos, s.currency, p_now
    from public.billing_subscriptions s
    where s.automation_enabled
      and s.status in ('active', 'past_due')
      and s.next_billing_at <= p_now + make_interval(days => s.warning_lead_days)
    on conflict on constraint billing_invoices_subscription_id_period_start_key do nothing
    returning id
  ), candidates as (
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
$$;

revoke all on function public.claim_due_billing_invoices(integer, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_due_billing_invoices(integer, timestamptz) to service_role;
