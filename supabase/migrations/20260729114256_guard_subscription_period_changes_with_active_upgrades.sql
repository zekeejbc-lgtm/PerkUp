create or replace function public.sync_automatic_billing_subscription(
  p_store_id text,
  p_owner_user_id text,
  p_billing_email text,
  p_plan_id text,
  p_amount_centavos integer,
  p_pending_amount_centavos integer,
  p_pending_amount_effective_at timestamptz,
  p_currency text,
  p_interval_days integer,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_warning_lead_days integer,
  p_grace_period_days integer,
  p_status text,
  p_initial_payment_required boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_subscription public.billing_subscriptions%rowtype;
  synced_subscription public.billing_subscriptions%rowtype;
  active_change public.subscription_plan_changes%rowtype;
begin
  select *
  into existing_subscription
  from public.billing_subscriptions
  where store_id = p_store_id
  for update;

  if found
    and (
      existing_subscription.current_period_start is distinct from p_current_period_start
      or existing_subscription.current_period_end is distinct from p_current_period_end
      or existing_subscription.interval_days is distinct from p_interval_days
    )
  then
    select *
    into active_change
    from public.subscription_plan_changes
    where subscription_id = existing_subscription.id
      and status in ('scheduled', 'locked')
    order by requested_at
    limit 1;

    if found then
      raise exception
        'ACTIVE_UPGRADE_PERIOD_CHANGE: Cancel the active subscription upgrade before changing its billing dates.'
        using errcode = '55000',
          detail = format(
            'Plan change %s is %s and targets %s.',
            active_change.id,
            active_change.status,
            active_change.target_period_start
          ),
          hint = 'Cancel the pending upgrade, then save the subscription dates again.';
    end if;
  end if;

  insert into public.billing_subscriptions (
    store_id,
    owner_user_id,
    billing_email,
    plan_id,
    amount_centavos,
    pending_amount_centavos,
    pending_amount_effective_at,
    currency,
    interval_days,
    current_period_start,
    current_period_end,
    next_billing_at,
    warning_lead_days,
    grace_period_days,
    status,
    automation_enabled,
    renewal_mode,
    auto_renew_cancelled_at,
    initial_payment_required
  ) values (
    p_store_id,
    p_owner_user_id,
    p_billing_email,
    p_plan_id,
    p_amount_centavos,
    p_pending_amount_centavos,
    p_pending_amount_effective_at,
    p_currency,
    p_interval_days,
    p_current_period_start,
    p_current_period_end,
    p_current_period_end,
    p_warning_lead_days,
    p_grace_period_days,
    p_status,
    true,
    'automatic',
    null,
    p_initial_payment_required
  )
  on conflict (store_id) do update
  set owner_user_id = excluded.owner_user_id,
      billing_email = excluded.billing_email,
      plan_id = excluded.plan_id,
      amount_centavos = excluded.amount_centavos,
      pending_amount_centavos = excluded.pending_amount_centavos,
      pending_amount_effective_at = excluded.pending_amount_effective_at,
      currency = excluded.currency,
      interval_days = excluded.interval_days,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      next_billing_at = excluded.next_billing_at,
      warning_lead_days = excluded.warning_lead_days,
      grace_period_days = excluded.grace_period_days,
      status = excluded.status,
      automation_enabled = true,
      renewal_mode = 'automatic',
      auto_renew_cancelled_at = null,
      initial_payment_required = excluded.initial_payment_required
  returning * into synced_subscription;

  return jsonb_build_object(
    'id', synced_subscription.id,
    'store_id', synced_subscription.store_id,
    'status', synced_subscription.status,
    'automation_enabled', synced_subscription.automation_enabled,
    'renewal_mode', synced_subscription.renewal_mode,
    'auto_renew_cancelled_at', synced_subscription.auto_renew_cancelled_at,
    'next_billing_at', synced_subscription.next_billing_at,
    'amount_centavos', synced_subscription.amount_centavos,
    'currency', synced_subscription.currency,
    'pending_amount_centavos', synced_subscription.pending_amount_centavos,
    'pending_amount_effective_at', synced_subscription.pending_amount_effective_at,
    'initial_payment_required', synced_subscription.initial_payment_required
  );
end;
$$;

revoke all on function public.sync_automatic_billing_subscription(
  text,
  text,
  text,
  text,
  integer,
  integer,
  timestamptz,
  text,
  integer,
  timestamptz,
  timestamptz,
  integer,
  integer,
  text,
  boolean
) from public, anon, authenticated;

grant execute on function public.sync_automatic_billing_subscription(
  text,
  text,
  text,
  text,
  integer,
  integer,
  timestamptz,
  text,
  integer,
  timestamptz,
  timestamptz,
  integer,
  integer,
  text,
  boolean
) to service_role;
