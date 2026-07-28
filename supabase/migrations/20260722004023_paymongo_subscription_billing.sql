create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create table public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  store_id text not null unique references public.stores(id) on delete cascade,
  owner_user_id text not null references public.users(id) on delete cascade,
  billing_email text not null check (char_length(billing_email) between 3 and 254 and billing_email like '%@%'),
  plan_id text not null check (char_length(plan_id) between 1 and 80),
  amount_centavos integer not null check (amount_centavos between 100 and 999999999),
  currency text not null default 'PHP' check (currency = 'PHP'),
  interval_days smallint not null default 30 check (interval_days = 30),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  next_billing_at timestamptz not null,
  warning_lead_days smallint not null default 7 check (warning_lead_days between 0 and 30),
  grace_period_days smallint not null default 3 check (grace_period_days between 0 and 30),
  status text not null default 'active' check (status in ('active', 'past_due', 'frozen', 'paused', 'cancelled')),
  automation_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_period_end > current_period_start)
);

create index billing_subscriptions_owner_user_id_idx on public.billing_subscriptions (owner_user_id);
create index billing_subscriptions_due_idx on public.billing_subscriptions (next_billing_at)
  where automation_enabled and status in ('active', 'past_due');

create table public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.billing_subscriptions(id) on delete restrict,
  store_id text not null references public.stores(id) on delete restrict,
  owner_user_id text not null references public.users(id) on delete restrict,
  period_start timestamptz not null,
  period_end timestamptz not null,
  due_at timestamptz not null,
  amount_centavos integer not null check (amount_centavos between 100 and 999999999),
  currency text not null default 'PHP' check (currency = 'PHP'),
  status text not null default 'pending' check (status in ('pending', 'link_created', 'paid', 'failed', 'expired', 'void')),
  paymongo_link_id text,
  paymongo_reference_number text,
  payment_url text,
  livemode boolean not null default false,
  paid_at timestamptz,
  paymongo_event_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, period_start),
  unique (paymongo_link_id),
  unique (paymongo_reference_number),
  check (period_end > period_start),
  check ((status = 'paid') = (paid_at is not null))
);

create index billing_invoices_owner_user_id_idx on public.billing_invoices (owner_user_id, created_at desc);
create index billing_invoices_retry_idx on public.billing_invoices (next_attempt_at)
  where status in ('pending', 'link_created', 'failed');

create table public.billing_notifications (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.billing_invoices(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  notification_type text not null check (notification_type in ('payment_due', 'payment_received', 'payment_overdue')),
  recipient text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_id, channel, notification_type)
);

create index billing_notifications_retry_idx on public.billing_notifications (status, updated_at)
  where status in ('pending', 'failed');

create table public.paymongo_webhook_events (
  event_id text primary key,
  event_type text not null,
  livemode boolean not null,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  payload jsonb not null,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.billing_subscriptions enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_notifications enable row level security;
alter table public.paymongo_webhook_events enable row level security;

create policy billing_subscriptions_read_own_or_admin
on public.billing_subscriptions for select to authenticated
using (
  owner_user_id = (select auth.uid())::text
  or (select private.current_user_role()) in ('admin', 'assistant_admin', 'auditor')
);

create policy billing_invoices_read_own_or_admin
on public.billing_invoices for select to authenticated
using (
  owner_user_id = (select auth.uid())::text
  or (select private.current_user_role()) in ('admin', 'assistant_admin', 'auditor')
);

revoke all on public.billing_subscriptions, public.billing_invoices,
  public.billing_notifications, public.paymongo_webhook_events from public, anon, authenticated;
grant select on public.billing_subscriptions, public.billing_invoices to authenticated;
grant select, insert, update, delete on public.billing_subscriptions, public.billing_invoices,
  public.billing_notifications, public.paymongo_webhook_events to service_role;

create trigger billing_subscriptions_set_updated_at
before update on public.billing_subscriptions
for each row execute function public.set_updated_at();

create trigger billing_invoices_set_updated_at
before update on public.billing_invoices
for each row execute function public.set_updated_at();

create trigger billing_notifications_set_updated_at
before update on public.billing_notifications
for each row execute function public.set_updated_at();

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
    s.next_billing_at, s.amount_centavos, s.currency, p_now
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

revoke all on function public.claim_due_billing_invoices(integer, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_due_billing_invoices(integer, timestamptz) to service_role;

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
    last_error = null, next_attempt_at = p_paid_at
  where id = invoice_row.id;

  update public.billing_subscriptions set
    current_period_start = new_period_start,
    current_period_end = new_period_end,
    next_billing_at = new_period_end,
    status = 'active'
  where id = subscription_row.id;

  select coalesce(data->'subscriptionAccess', '{}'::jsonb) into access_data
  from public.stores where id = subscription_row.store_id;
  access_data := access_data || jsonb_build_object(
    'status', 'active',
    'paymentLink', '',
    'graceStartedAt', '',
    'graceEndsAt', '',
    'updatedAt', p_paid_at::text,
    'updatedBy', 'paymongo-webhook'
  );

  update public.stores set data = data || jsonb_build_object(
    'subscriptionStart', new_period_start::text,
    'subscriptionEnd', new_period_end::text,
    'subscriptionAccess', access_data,
    'updatedAt', jsonb_build_object('seconds', floor(extract(epoch from p_paid_at))::bigint, 'nanoseconds', 0)
  ) where id = subscription_row.store_id;

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
    select s.*,
      case
        when p_now >= s.current_period_end + make_interval(days => s.grace_period_days) then 'frozen'
        when p_now >= s.current_period_end then 'grace'
        when p_now >= s.current_period_end - make_interval(days => s.warning_lead_days) then 'warning'
        else 'active'
      end as access_status
    from public.billing_subscriptions s
    where s.automation_enabled and s.status not in ('paused', 'cancelled')
  ), updated_subscriptions as (
    update public.billing_subscriptions s
    set status = case when st.access_status = 'frozen' then 'frozen'
                      when st.access_status = 'grace' then 'past_due'
                      else 'active' end
    from states st
    where s.id = st.id
      and s.status is distinct from case when st.access_status = 'frozen' then 'frozen'
                                         when st.access_status = 'grace' then 'past_due'
                                         else 'active' end
    returning s.id
  ), updated_stores as (
    update public.stores store
    set data = jsonb_set(
      store.data,
      '{subscriptionAccess}',
      coalesce(store.data->'subscriptionAccess', '{}'::jsonb) || jsonb_build_object(
        'status', st.access_status,
        'gracePeriodDays', st.grace_period_days,
        'graceStartedAt', case when st.access_status = 'grace' then st.current_period_end::text else '' end,
        'graceEndsAt', case when st.access_status = 'grace' then (st.current_period_end + make_interval(days => st.grace_period_days))::text else '' end,
        'updatedAt', p_now::text,
        'updatedBy', 'subscription-billing-worker'
      ),
      true
    )
    from states st
    where store.id = st.store_id
      and coalesce(store.data->'subscriptionAccess'->>'status', '') is distinct from st.access_status
    returning store.id
  )
  select count(*) into changed_count from updated_stores;
  return changed_count;
end;
$$;

revoke all on function public.refresh_billing_access_states(timestamptz) from public, anon, authenticated;
grant execute on function public.refresh_billing_access_states(timestamptz) to service_role;

create or replace function private.invoke_subscription_billing_worker()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  worker_url text;
  cron_secret text;
  request_id bigint;
begin
  select decrypted_secret into worker_url from vault.decrypted_secrets
    where name = 'perk_billing_worker_url' limit 1;
  select decrypted_secret into cron_secret from vault.decrypted_secrets
    where name = 'perk_billing_cron_secret' limit 1;
  if nullif(worker_url, '') is null or nullif(cron_secret, '') is null then
    return null;
  end if;
  select net.http_post(
    url := worker_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-billing-cron-secret', cron_secret),
    body := jsonb_build_object('source', 'supabase-cron', 'requestedAt', now()),
    timeout_milliseconds := 50000
  ) into request_id;
  return request_id;
end;
$$;

revoke all on function private.invoke_subscription_billing_worker() from public, anon, authenticated;

select cron.schedule(
  'perk-subscription-billing-hourly',
  '5 * * * *',
  'select private.invoke_subscription_billing_worker()'
);
