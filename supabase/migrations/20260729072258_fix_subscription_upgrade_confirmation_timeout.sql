create or replace function public.confirm_subscription_upgrade(
  p_store_id text,
  p_owner_user_id text,
  p_from_plan_snapshot jsonb,
  p_to_plan_snapshot jsonb,
  p_current_amount_centavos integer,
  p_target_amount_centavos integer,
  p_target_period_start timestamptz,
  p_target_period_end timestamptz,
  p_terms_version text,
  p_quote_fingerprint text,
  p_plan_catalog_updated_at timestamptz,
  p_current_renewal_invoice_id uuid,
  p_current_renewal_invoice_status text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  runtime_enabled boolean;
  catalog_updated_at timestamptz;
  subscription_row public.billing_subscriptions%rowtype;
  store_row public.stores%rowtype;
  renewal_row public.billing_invoices%rowtype;
  inserted_change public.subscription_plan_changes%rowtype;
  expected_start timestamptz;
  expected_end timestamptz;
  from_plan_id text;
  from_plan_name text;
  to_plan_id text;
  to_plan_name text;
  from_plan_order integer;
  to_plan_order integer;
  from_interval_days integer;
  to_interval_days integer;
  accepted_at timestamptz := coalesce(p_now, now());
begin
  select config.subscription_upgrades_enabled
  into runtime_enabled
  from public.system_runtime_config config
  where config.id = 'global'
  for share;
  if not found or runtime_enabled is distinct from true then
    raise exception 'Subscription upgrades are not available.'
      using errcode = '23514';
  end if;

  if nullif(btrim(p_store_id), '') is null
    or nullif(btrim(p_owner_user_id), '') is null
  then
    raise exception 'Store and owner are required.' using errcode = '22023';
  end if;
  if p_terms_version is distinct from 'subscription-upgrade-v1' then
    raise exception 'The subscription upgrade terms changed. Review them again.'
      using errcode = '22023';
  end if;
  if nullif(btrim(p_quote_fingerprint), '') is null
    or p_plan_catalog_updated_at is null
  then
    raise exception 'A current upgrade quote is required.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_from_plan_snapshot) is distinct from 'object'
    or jsonb_typeof(p_to_plan_snapshot) is distinct from 'object'
  then
    raise exception 'Plan snapshots must be JSON objects.' using errcode = '22023';
  end if;

  select settings.updated_at
  into catalog_updated_at
  from public.settings settings
  where settings.id = 'subscriptions'
  for share;
  if not found
    or date_trunc('milliseconds', catalog_updated_at)
      is distinct from date_trunc('milliseconds', p_plan_catalog_updated_at)
  then
    raise exception 'The subscription plan catalog changed. Request a new quote.'
      using errcode = 'PUG01';
  end if;

  from_plan_id := nullif(btrim(p_from_plan_snapshot->>'id'), '');
  from_plan_name := nullif(btrim(p_from_plan_snapshot->>'name'), '');
  to_plan_id := nullif(btrim(p_to_plan_snapshot->>'id'), '');
  to_plan_name := nullif(btrim(p_to_plan_snapshot->>'name'), '');
  begin
    from_plan_order := (p_from_plan_snapshot->>'order')::integer;
    to_plan_order := (p_to_plan_snapshot->>'order')::integer;
    from_interval_days := (p_from_plan_snapshot->>'intervalDays')::integer;
    to_interval_days := (p_to_plan_snapshot->>'intervalDays')::integer;
  exception when invalid_text_representation or null_value_not_allowed then
    raise exception 'Plan order or interval is invalid.' using errcode = '22023';
  end;

  if from_plan_id is null or from_plan_name is null
    or to_plan_id is null or to_plan_name is null
    or from_plan_id = to_plan_id
    or to_plan_order <= from_plan_order
  then
    raise exception 'The selected plan is not an upgrade.' using errcode = '22023';
  end if;
  if (p_to_plan_snapshot->>'priceCentavos')::integer is distinct from p_target_amount_centavos
    or (p_from_plan_snapshot->>'priceCentavos')::integer is distinct from p_current_amount_centavos
    or p_target_amount_centavos <= p_current_amount_centavos
    or p_current_amount_centavos < 100
  then
    raise exception 'The upgrade price is invalid.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_to_plan_snapshot->'dependencies') is distinct from 'object'
    or jsonb_typeof(p_to_plan_snapshot->'features') is distinct from 'array'
  then
    raise exception 'The target plan limits or features are invalid.' using errcode = '22023';
  end if;

  select *
  into subscription_row
  from public.billing_subscriptions
  where store_id = p_store_id
    and owner_user_id = p_owner_user_id
  for update;
  if not found then
    raise exception 'Billing subscription was not found.' using errcode = 'P0002';
  end if;
  if from_interval_days is distinct from subscription_row.interval_days
    or to_interval_days is distinct from subscription_row.interval_days
  then
    raise exception 'The selected plan billing interval is incompatible.'
      using errcode = '22023';
  end if;
  if subscription_row.initial_payment_required then
    raise exception 'Complete the initial subscription payment before upgrading.'
      using errcode = '23514';
  end if;
  if subscription_row.status not in ('active', 'cancelled')
    or (subscription_row.status = 'cancelled' and subscription_row.renewal_mode <> 'manual')
  then
    raise exception 'This subscription is not eligible for an upgrade.'
      using errcode = '23514';
  end if;
  if lower(subscription_row.plan_id) not in (
    lower(from_plan_id),
    lower(from_plan_name)
  ) then
    raise exception 'The active plan changed. Request a new quote.' using errcode = 'PUG01';
  end if;
  if subscription_row.amount_centavos is distinct from p_current_amount_centavos then
    raise exception 'The subscription amount changed. Request a new quote.'
      using errcode = 'PUG01';
  end if;

  select *
  into store_row
  from public.stores
  where id = subscription_row.store_id
  for update;
  if not found then
    raise exception 'Subscription store was not found.' using errcode = 'P0002';
  end if;
  if lower(coalesce(store_row.data->'subscriptionAccess'->>'status', 'active')) = 'frozen'
    or lower(coalesce(store_row.data->'accountRestriction'->>'status', 'active')) = 'suspended'
  then
    raise exception 'Restore store access before scheduling an upgrade.'
      using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.subscription_plan_changes
    where subscription_id = subscription_row.id
      and status in ('scheduled', 'locked')
  ) then
    raise unique_violation using
      message = 'An active subscription upgrade already exists.';
  end if;
  if exists (
    select 1
    from public.billing_invoices
    where subscription_id = subscription_row.id
      and invoice_type = 'initial'
      and status not in ('paid', 'void', 'expired')
  ) then
    raise exception 'Complete the initial subscription payment before upgrading.'
      using errcode = '23514';
  end if;
  if subscription_row.status = 'past_due' or exists (
    select 1
    from public.billing_invoices
    where subscription_id = subscription_row.id
      and invoice_type = 'renewal'
      and status in ('pending', 'link_created', 'failed')
      and due_at < accepted_at
  ) then
    raise exception 'Resolve the overdue renewal before scheduling an upgrade.'
      using errcode = '23514';
  end if;

  select *
  into renewal_row
  from public.billing_invoices
  where subscription_id = subscription_row.id
    and invoice_type = 'renewal'
    and period_start = subscription_row.current_period_end
    and status in ('pending', 'link_created', 'failed')
  order by created_at desc
  limit 1
  for update;

  if found then
    if renewal_row.id is distinct from p_current_renewal_invoice_id
      or renewal_row.status is distinct from p_current_renewal_invoice_status
    then
      raise exception 'The upcoming renewal invoice changed. Request a new quote.'
        using errcode = 'PUG01';
    end if;
    expected_start := renewal_row.period_end;
  else
    if p_current_renewal_invoice_id is not null
      or p_current_renewal_invoice_status is not null
    then
      raise exception 'The upcoming renewal invoice changed. Request a new quote.'
        using errcode = 'PUG01';
    end if;
    expected_start := subscription_row.current_period_end;
  end if;
  expected_end := expected_start + make_interval(days => subscription_row.interval_days);

  if p_target_period_start is distinct from expected_start
    or p_target_period_end is distinct from expected_end
  then
    raise exception 'The target renewal changed. Request a new quote.'
      using errcode = 'PUG01';
  end if;

  insert into public.subscription_plan_changes (
    subscription_id,
    store_id,
    owner_user_id,
    from_plan_id,
    to_plan_id,
    from_plan_snapshot,
    to_plan_snapshot,
    current_amount_centavos,
    target_amount_centavos,
    difference_centavos,
    amount_due_today_centavos,
    target_period_start,
    target_period_end,
    terms_version,
    terms_accepted_at,
    terms_accepted_by,
    quote_fingerprint,
    requested_at
  ) values (
    subscription_row.id,
    subscription_row.store_id,
    subscription_row.owner_user_id,
    from_plan_id,
    to_plan_id,
    p_from_plan_snapshot,
    p_to_plan_snapshot,
    p_current_amount_centavos,
    p_target_amount_centavos,
    p_target_amount_centavos - p_current_amount_centavos,
    0,
    expected_start,
    expected_end,
    p_terms_version,
    accepted_at,
    p_owner_user_id,
    btrim(p_quote_fingerprint),
    accepted_at
  )
  returning * into inserted_change;

  insert into public.subscription_plan_change_notifications (
    plan_change_id,
    notification_type,
    recipient,
    status,
    next_attempt_at
  ) values (
    inserted_change.id,
    'scheduled',
    subscription_row.billing_email,
    'pending',
    accepted_at
  )
  on conflict (plan_change_id, notification_type) do nothing;

  return jsonb_build_object(
    'id', inserted_change.id,
    'status', inserted_change.status,
    'fromPlan', inserted_change.from_plan_snapshot,
    'toPlan', inserted_change.to_plan_snapshot,
    'targetPeriodStart', inserted_change.target_period_start,
    'targetAmountCentavos', inserted_change.target_amount_centavos,
    'renewalInvoiceId', inserted_change.renewal_invoice_id,
    'requestedAt', inserted_change.requested_at,
    'lockedAt', inserted_change.locked_at,
    'appliedAt', inserted_change.applied_at
  );
end;
$$;

revoke all on function public.confirm_subscription_upgrade(
  text, text, jsonb, jsonb, integer, integer, timestamptz, timestamptz,
  text, text, timestamptz, uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.confirm_subscription_upgrade(
  text, text, jsonb, jsonb, integer, integer, timestamptz, timestamptz,
  text, text, timestamptz, uuid, text, timestamptz
) to service_role;
