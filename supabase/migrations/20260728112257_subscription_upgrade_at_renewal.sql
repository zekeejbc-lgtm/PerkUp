create table public.subscription_plan_changes (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.billing_subscriptions(id) on delete restrict,
  store_id text not null references public.stores(id) on delete restrict,
  owner_user_id text not null references public.users(id) on delete restrict,
  change_type text not null default 'upgrade' check (change_type = 'upgrade'),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'locked', 'applied', 'cancelled', 'failed')),
  from_plan_id text not null check (char_length(from_plan_id) between 1 and 80),
  to_plan_id text not null check (char_length(to_plan_id) between 1 and 80),
  from_plan_snapshot jsonb not null check (jsonb_typeof(from_plan_snapshot) = 'object'),
  to_plan_snapshot jsonb not null check (jsonb_typeof(to_plan_snapshot) = 'object'),
  current_amount_centavos integer not null
    check (current_amount_centavos between 100 and 999999999),
  target_amount_centavos integer not null
    check (target_amount_centavos between 100 and 999999999),
  difference_centavos integer not null check (difference_centavos > 0),
  amount_due_today_centavos integer not null default 0
    check (amount_due_today_centavos = 0),
  target_period_start timestamptz not null,
  target_period_end timestamptz not null,
  renewal_invoice_id uuid references public.billing_invoices(id) on delete restrict,
  terms_version text not null check (char_length(terms_version) between 1 and 80),
  terms_accepted_at timestamptz not null,
  terms_accepted_by text not null check (char_length(terms_accepted_by) between 1 and 100),
  quote_fingerprint text not null check (char_length(quote_fingerprint) between 16 and 128),
  requested_at timestamptz not null default now(),
  locked_at timestamptz,
  applied_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by text,
  cancellation_reason text
    check (cancellation_reason is null or char_length(cancellation_reason) between 10 and 500),
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_period_end > target_period_start),
  check (from_plan_id <> to_plan_id),
  check (target_amount_centavos > current_amount_centavos),
  check (difference_centavos = target_amount_centavos - current_amount_centavos)
);

create unique index subscription_plan_changes_one_active_idx
  on public.subscription_plan_changes (subscription_id)
  where status in ('scheduled', 'locked');
create index subscription_plan_changes_owner_idx
  on public.subscription_plan_changes (owner_user_id, requested_at desc);
create index subscription_plan_changes_store_idx
  on public.subscription_plan_changes (store_id, requested_at desc);
create index subscription_plan_changes_target_idx
  on public.subscription_plan_changes (subscription_id, target_period_start)
  where status = 'scheduled';
create unique index subscription_plan_changes_renewal_invoice_idx
  on public.subscription_plan_changes (renewal_invoice_id)
  where renewal_invoice_id is not null;

alter table public.billing_invoices
  add column if not exists subscription_plan_change_id uuid
    references public.subscription_plan_changes(id) on delete restrict,
  add column if not exists plan_id_snapshot text,
  add column if not exists plan_name_snapshot text,
  add column if not exists plan_snapshot jsonb;

create unique index if not exists billing_invoices_plan_change_idx
  on public.billing_invoices (subscription_plan_change_id)
  where subscription_plan_change_id is not null;
create index if not exists billing_invoices_store_id_idx
  on public.billing_invoices (store_id);

create table public.subscription_plan_change_notifications (
  id uuid primary key default gen_random_uuid(),
  plan_change_id uuid not null references public.subscription_plan_changes(id) on delete cascade,
  notification_type text not null
    check (notification_type in ('scheduled', 'applied', 'cancelled')),
  recipient text not null check (char_length(recipient) between 3 and 254),
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_change_id, notification_type)
);

create index subscription_plan_change_notifications_claim_idx
  on public.subscription_plan_change_notifications (next_attempt_at, created_at)
  where status in ('pending', 'sending', 'failed');
create index subscription_plan_change_notifications_plan_change_idx
  on public.subscription_plan_change_notifications (plan_change_id);

alter table public.subscription_plan_changes enable row level security;
alter table public.subscription_plan_change_notifications enable row level security;

create policy subscription_plan_changes_read_own_or_admin
on public.subscription_plan_changes
for select
to authenticated
using (
  owner_user_id = (select auth.uid())::text
  or (select private.current_user_role()) in ('admin', 'assistant_admin', 'auditor')
);

revoke all on public.subscription_plan_changes,
  public.subscription_plan_change_notifications
  from public, anon, authenticated;
grant select on public.subscription_plan_changes to authenticated;
grant select, insert, update, delete on public.subscription_plan_changes,
  public.subscription_plan_change_notifications to service_role;

drop trigger if exists subscription_plan_changes_set_updated_at
  on public.subscription_plan_changes;
create trigger subscription_plan_changes_set_updated_at
before update on public.subscription_plan_changes
for each row execute function public.set_updated_at();

drop trigger if exists subscription_plan_change_notifications_set_updated_at
  on public.subscription_plan_change_notifications;
create trigger subscription_plan_change_notifications_set_updated_at
before update on public.subscription_plan_change_notifications
for each row execute function public.set_updated_at();

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
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
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
  accepted_at timestamptz := coalesce(p_now, now());
begin
  if nullif(btrim(p_store_id), '') is null
    or nullif(btrim(p_owner_user_id), '') is null
  then
    raise exception 'Store and owner are required.' using errcode = '22023';
  end if;
  if p_terms_version is distinct from 'subscription-upgrade-v1' then
    raise exception 'The subscription upgrade terms changed. Review them again.'
      using errcode = '22023';
  end if;
  if nullif(btrim(p_quote_fingerprint), '') is null then
    raise exception 'A current upgrade quote is required.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_from_plan_snapshot) is distinct from 'object'
    or jsonb_typeof(p_to_plan_snapshot) is distinct from 'object'
  then
    raise exception 'Plan snapshots must be JSON objects.' using errcode = '22023';
  end if;

  from_plan_id := nullif(btrim(p_from_plan_snapshot->>'id'), '');
  from_plan_name := nullif(btrim(p_from_plan_snapshot->>'name'), '');
  to_plan_id := nullif(btrim(p_to_plan_snapshot->>'id'), '');
  to_plan_name := nullif(btrim(p_to_plan_snapshot->>'name'), '');
  begin
    from_plan_order := (p_from_plan_snapshot->>'order')::integer;
    to_plan_order := (p_to_plan_snapshot->>'order')::integer;
  exception when invalid_text_representation then
    raise exception 'Plan order is invalid.' using errcode = '22023';
  end;

  if from_plan_id is null or from_plan_name is null
    or to_plan_id is null or to_plan_name is null
    or from_plan_id = to_plan_id
    or to_plan_order <= from_plan_order
  then
    raise exception 'The selected plan is not an upgrade.' using errcode = '22023';
  end if;
  if (p_to_plan_snapshot->>'priceCentavos')::integer is distinct from p_target_amount_centavos
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
    raise exception 'The active plan changed. Request a new quote.' using errcode = '40001';
  end if;
  if subscription_row.amount_centavos is distinct from p_current_amount_centavos then
    raise exception 'The subscription amount changed. Request a new quote.'
      using errcode = '40001';
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

  expected_start := case
    when found then renewal_row.period_end
    else subscription_row.current_period_end
  end;
  expected_end := expected_start + make_interval(days => subscription_row.interval_days);

  if p_target_period_start is distinct from expected_start
    or p_target_period_end is distinct from expected_end
  then
    raise exception 'The target renewal changed. Request a new quote.'
      using errcode = '40001';
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
  text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.confirm_subscription_upgrade(
  text, text, jsonb, jsonb, integer, integer, timestamptz, timestamptz,
  text, text, timestamptz
) to service_role;

create or replace function public.cancel_subscription_upgrade(
  p_plan_change_id uuid,
  p_owner_user_id text,
  p_cancelled_by text,
  p_reason text default null,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  change_row public.subscription_plan_changes%rowtype;
  subscription_row public.billing_subscriptions%rowtype;
  effective_cancelled_at timestamptz := coalesce(p_now, now());
begin
  select *
  into change_row
  from public.subscription_plan_changes
  where id = p_plan_change_id
    and owner_user_id = p_owner_user_id
  for update;
  if not found then
    raise exception 'Scheduled subscription upgrade was not found.' using errcode = 'P0002';
  end if;
  if change_row.status <> 'scheduled' or change_row.renewal_invoice_id is not null then
    raise exception 'This upgrade is already locked to an invoice and cannot be cancelled.'
      using errcode = '23514';
  end if;

  select *
  into subscription_row
  from public.billing_subscriptions
  where id = change_row.subscription_id;

  update public.subscription_plan_changes
  set status = 'cancelled',
      cancelled_at = effective_cancelled_at,
      cancelled_by = nullif(btrim(p_cancelled_by), ''),
      cancellation_reason = nullif(btrim(p_reason), ''),
      updated_at = effective_cancelled_at
  where id = change_row.id;

  insert into public.subscription_plan_change_notifications (
    plan_change_id,
    notification_type,
    recipient,
    status,
    next_attempt_at
  ) values (
    change_row.id,
    'cancelled',
    subscription_row.billing_email,
    'pending',
    effective_cancelled_at
  )
  on conflict (plan_change_id, notification_type) do nothing;

  return jsonb_build_object(
    'id', change_row.id,
    'status', 'cancelled',
    'cancelledAt', effective_cancelled_at
  );
end;
$$;

revoke all on function public.cancel_subscription_upgrade(
  uuid, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.cancel_subscription_upgrade(
  uuid, text, text, text, timestamptz
) to service_role;

create or replace function private.prepare_subscription_upgrade_invoice()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  change_row public.subscription_plan_changes%rowtype;
  subscription_row public.billing_subscriptions%rowtype;
begin
  if new.invoice_type <> 'renewal' then
    return new;
  end if;

  select *
  into subscription_row
  from public.billing_subscriptions
  where id = new.subscription_id
  for update;
  if not found then
    raise exception 'Billing subscription was not found.' using errcode = 'P0002';
  end if;

  select *
  into change_row
  from public.subscription_plan_changes
  where subscription_id = new.subscription_id
    and status = 'scheduled'
    and target_period_start = new.period_start
  order by requested_at
  limit 1
  for update;

  if not found then
    return new;
  end if;
  if lower(subscription_row.plan_id) not in (
    lower(change_row.from_plan_id),
    lower(coalesce(change_row.from_plan_snapshot->>'name', change_row.from_plan_id))
  ) or subscription_row.amount_centavos is distinct from change_row.current_amount_centavos then
    update public.subscription_plan_changes
    set status = 'failed',
        failure_reason = 'The active plan or subscription amount changed before invoice creation.',
        updated_at = now()
    where id = change_row.id;
    return new;
  end if;
  if change_row.target_period_end is distinct from new.period_end then
    update public.subscription_plan_changes
    set status = 'failed',
        failure_reason = 'The renewal interval changed before invoice creation.',
        updated_at = now()
    where id = change_row.id;
    return new;
  end if;

  new.subscription_plan_change_id := change_row.id;
  new.amount_centavos := change_row.target_amount_centavos;
  new.plan_id_snapshot := change_row.to_plan_id;
  new.plan_name_snapshot := coalesce(
    nullif(change_row.to_plan_snapshot->>'name', ''),
    change_row.to_plan_id
  );
  new.plan_snapshot := change_row.to_plan_snapshot;
  return new;
end;
$$;

revoke all on function private.prepare_subscription_upgrade_invoice()
  from public, anon, authenticated;
grant execute on function private.prepare_subscription_upgrade_invoice()
  to service_role;

create or replace function private.lock_subscription_upgrade_invoice()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.subscription_plan_change_id is null then
    return new;
  end if;

  update public.subscription_plan_changes
  set status = 'locked',
      renewal_invoice_id = new.id,
      locked_at = now(),
      updated_at = now()
  where id = new.subscription_plan_change_id
    and status = 'scheduled'
    and renewal_invoice_id is null;
  if not found then
    raise exception 'The subscription upgrade could not be locked to this invoice.'
      using errcode = '40001';
  end if;
  return new;
end;
$$;

revoke all on function private.lock_subscription_upgrade_invoice()
  from public, anon, authenticated;
grant execute on function private.lock_subscription_upgrade_invoice()
  to service_role;

drop trigger if exists billing_invoices_prepare_subscription_upgrade
  on public.billing_invoices;
create trigger billing_invoices_prepare_subscription_upgrade
before insert on public.billing_invoices
for each row execute function private.prepare_subscription_upgrade_invoice();

drop trigger if exists billing_invoices_lock_subscription_upgrade
  on public.billing_invoices;
create trigger billing_invoices_lock_subscription_upgrade
after insert on public.billing_invoices
for each row execute function private.lock_subscription_upgrade_invoice();

create or replace function private.apply_subscription_upgrade_payment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  change_row public.subscription_plan_changes%rowtype;
  target_dependencies jsonb;
  target_plan_name text;
begin
  if new.subscription_plan_change_id is null
    or new.status <> 'paid'
    or old.status = 'paid'
  then
    return new;
  end if;

  select *
  into change_row
  from public.subscription_plan_changes
  where id = new.subscription_plan_change_id
  for update;
  if not found then
    raise exception 'The invoice subscription upgrade was not found.' using errcode = 'P0002';
  end if;
  if change_row.status = 'applied' then
    return new;
  end if;
  if change_row.status <> 'locked'
    or change_row.renewal_invoice_id is distinct from new.id
    or change_row.target_period_start is distinct from new.period_start
    or change_row.target_amount_centavos is distinct from new.amount_centavos
  then
    raise exception 'The paid invoice does not match its scheduled subscription upgrade.'
      using errcode = '22000';
  end if;

  target_dependencies := coalesce(change_row.to_plan_snapshot->'dependencies', '{}'::jsonb);
  target_plan_name := coalesce(
    nullif(change_row.to_plan_snapshot->>'name', ''),
    change_row.to_plan_id
  );

  update public.billing_subscriptions
  set plan_id = change_row.to_plan_id,
      amount_centavos = change_row.target_amount_centavos,
      updated_at = coalesce(new.paid_at, now())
  where id = change_row.subscription_id;

  update public.stores
  set data = data || jsonb_build_object(
        'subscriptionLevel', target_plan_name,
        'owedAmount', change_row.target_amount_centavos::numeric / 100,
        'subscriptionDependencies', target_dependencies
      ),
      updated_at = coalesce(new.paid_at, now())
  where id = change_row.store_id;

  update public.subscription_plan_changes
  set status = 'applied',
      applied_at = coalesce(new.paid_at, now()),
      updated_at = coalesce(new.paid_at, now())
  where id = change_row.id;

  insert into public.subscription_plan_change_notifications (
    plan_change_id,
    notification_type,
    recipient,
    status,
    next_attempt_at
  )
  select
    change_row.id,
    'applied',
    subscription.billing_email,
    'pending',
    coalesce(new.paid_at, now())
  from public.billing_subscriptions subscription
  where subscription.id = change_row.subscription_id
  on conflict (plan_change_id, notification_type) do nothing;

  return new;
end;
$$;

revoke all on function private.apply_subscription_upgrade_payment()
  from public, anon, authenticated;
grant execute on function private.apply_subscription_upgrade_payment()
  to service_role;

drop trigger if exists billing_invoices_apply_subscription_upgrade
  on public.billing_invoices;
create trigger billing_invoices_apply_subscription_upgrade
after update of status on public.billing_invoices
for each row
when (new.status = 'paid' and old.status is distinct from 'paid')
execute function private.apply_subscription_upgrade_payment();

create or replace function public.claim_subscription_upgrade_notifications(
  p_limit integer default 50,
  p_now timestamptz default now()
)
returns table (
  notification_id uuid,
  plan_change_id uuid,
  notification_type text,
  recipient text,
  attempt_count integer,
  from_plan_snapshot jsonb,
  to_plan_snapshot jsonb,
  current_amount_centavos integer,
  target_amount_centavos integer,
  difference_centavos integer,
  target_period_start timestamptz,
  terms_version text,
  renewal_mode text,
  store_id text,
  owner_user_id text,
  cancellation_reason text
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select notification.id
    from public.subscription_plan_change_notifications notification
    where notification.status in ('pending', 'sending', 'failed')
      and notification.next_attempt_at <= coalesce(p_now, now())
    order by notification.next_attempt_at, notification.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ), claimed as (
    update public.subscription_plan_change_notifications notification
    set status = 'sending',
        attempt_count = notification.attempt_count + 1,
        next_attempt_at = coalesce(p_now, now()) + interval '10 minutes',
        last_error = null
    from candidates
    where notification.id = candidates.id
    returning notification.*
  )
  select
    claimed.id,
    claimed.plan_change_id,
    claimed.notification_type,
    claimed.recipient,
    claimed.attempt_count,
    change.from_plan_snapshot,
    change.to_plan_snapshot,
    change.current_amount_centavos,
    change.target_amount_centavos,
    change.difference_centavos,
    change.target_period_start,
    change.terms_version,
    subscription.renewal_mode,
    change.store_id,
    change.owner_user_id,
    change.cancellation_reason
  from claimed
  join public.subscription_plan_changes change
    on change.id = claimed.plan_change_id
  join public.billing_subscriptions subscription
    on subscription.id = change.subscription_id;
end;
$$;

revoke all on function public.claim_subscription_upgrade_notifications(
  integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.claim_subscription_upgrade_notifications(
  integer, timestamptz
) to service_role;

-- Preserve the existing automatic billing contract while returning the
-- immutable target-plan label for a renewal that carries an upgrade.
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
    subscription.id,
    subscription.store_id,
    subscription.owner_user_id,
    subscription.current_period_end,
    subscription.current_period_end + make_interval(days => subscription.interval_days),
    subscription.next_billing_at,
    case
      when subscription.pending_amount_centavos is not null
        and subscription.pending_amount_effective_at is not null
        and subscription.pending_amount_effective_at <= subscription.next_billing_at
      then subscription.pending_amount_centavos
      else subscription.amount_centavos
    end,
    subscription.currency,
    p_now
  from public.billing_subscriptions subscription
  where subscription.automation_enabled
    and subscription.renewal_mode = 'automatic'
    and subscription.status in ('active', 'past_due')
    and subscription.next_billing_at <= p_now + make_interval(days => subscription.warning_lead_days)
  on conflict on constraint billing_invoices_subscription_id_period_start_key do nothing;

  return query
  with candidates as (
    select invoice.id
    from public.billing_invoices invoice
    join public.billing_subscriptions subscription
      on subscription.id = invoice.subscription_id
    where subscription.automation_enabled
      and subscription.renewal_mode = 'automatic'
      and subscription.status in ('active', 'past_due')
      and invoice.status in ('pending', 'link_created', 'failed')
      and invoice.next_attempt_at <= p_now
      and (
        invoice.paymongo_link_id is null
        or not exists (
          select 1
          from public.billing_notifications notification
          where notification.invoice_id = invoice.id
            and notification.channel = 'email'
            and notification.notification_type = 'payment_due'
            and notification.status = 'sent'
        )
      )
    order by invoice.due_at, invoice.created_at
    for update of invoice skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  ), claimed as (
    update public.billing_invoices invoice
    set attempt_count = invoice.attempt_count + 1,
        next_attempt_at = p_now + interval '10 minutes',
        last_error = null
    from candidates
    where invoice.id = candidates.id
    returning invoice.*
  )
  select
    invoice.id,
    invoice.subscription_id,
    invoice.store_id,
    invoice.owner_user_id,
    subscription.billing_email,
    coalesce(invoice.plan_id_snapshot, subscription.plan_id),
    invoice.amount_centavos,
    invoice.currency,
    invoice.due_at,
    invoice.paymongo_link_id,
    invoice.paymongo_reference_number,
    invoice.payment_url,
    invoice.livemode,
    exists (
      select 1
      from public.billing_notifications notification
      where notification.invoice_id = invoice.id
        and notification.channel = 'email'
        and notification.notification_type = 'payment_due'
        and notification.status = 'sent'
    )
  from claimed invoice
  join public.billing_subscriptions subscription
    on subscription.id = invoice.subscription_id;
end;
$$;

revoke all on function public.claim_due_billing_invoices(integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_due_billing_invoices(integer, timestamptz)
  to service_role;
