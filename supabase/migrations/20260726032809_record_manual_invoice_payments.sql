alter table public.billing_invoices
  add column if not exists manual_payment_reference text,
  add column if not exists manual_recorded_by text,
  add column if not exists manual_recorded_at timestamptz;

alter table public.billing_invoices
  drop constraint if exists billing_invoices_manual_payment_reference_check;
alter table public.billing_invoices
  add constraint billing_invoices_manual_payment_reference_check
  check (
    manual_payment_reference is null
    or char_length(manual_payment_reference) between 3 and 100
  );

create unique index if not exists billing_invoices_manual_payment_reference_idx
  on public.billing_invoices (upper(manual_payment_reference))
  where manual_payment_reference is not null;

create or replace function public.fulfill_billing_invoice_manually(
  p_invoice_id uuid,
  p_payment_method text,
  p_payment_reference text,
  p_paid_at timestamptz,
  p_recorded_by text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invoice_row public.billing_invoices%rowtype;
  subscription_row public.billing_subscriptions%rowtype;
  clean_method text := lower(trim(coalesce(p_payment_method, '')));
  clean_reference text := trim(coalesce(p_payment_reference, ''));
  clean_actor text := trim(coalesce(p_recorded_by, ''));
  new_period_start timestamptz;
  new_period_end timestamptz;
  access_data jsonb;
  store_data jsonb;
begin
  if clean_method not in ('bank_transfer', 'cash', 'gcash', 'maya', 'cheque', 'other') then
    raise exception 'Select a valid manual payment method.' using errcode = '22023';
  end if;
  if char_length(clean_reference) not between 3 and 100 then
    raise exception 'Payment reference must be between 3 and 100 characters.' using errcode = '22023';
  end if;
  if p_paid_at is null or p_paid_at > now() + interval '5 minutes' then
    raise exception 'Paid date must be a valid date that is not in the future.' using errcode = '22023';
  end if;
  if clean_actor = '' then
    raise exception 'The administrator recording this payment is required.' using errcode = '22023';
  end if;

  select * into invoice_row
  from public.billing_invoices
  where id = p_invoice_id
  for update;
  if not found then
    raise exception 'Billing invoice was not found.' using errcode = 'P0002';
  end if;
  if invoice_row.status = 'paid' then
    raise exception 'This invoice is already marked as paid.' using errcode = '23505';
  end if;
  if invoice_row.status in ('void', 'expired') then
    raise exception 'A closed invoice cannot be marked as paid.' using errcode = '55000';
  end if;

  select * into subscription_row
  from public.billing_subscriptions
  where id = invoice_row.subscription_id
  for update;
  if not found then
    raise exception 'Billing subscription was not found.' using errcode = 'P0002';
  end if;

  if invoice_row.invoice_type = 'initial' then
    new_period_start := p_paid_at;
  else
    new_period_start := greatest(subscription_row.current_period_end, p_paid_at);
  end if;
  new_period_end := new_period_start + make_interval(days => subscription_row.interval_days);

  update public.billing_invoices
  set
    status = 'paid',
    period_start = case when invoice_row.invoice_type = 'initial' then new_period_start else period_start end,
    period_end = case when invoice_row.invoice_type = 'initial' then new_period_end else period_end end,
    paid_at = p_paid_at,
    payment_method = 'manual_' || clean_method,
    manual_payment_reference = clean_reference,
    manual_recorded_by = clean_actor,
    manual_recorded_at = now(),
    gross_amount_centavos = invoice_row.amount_centavos,
    fee_centavos = 0,
    net_amount_centavos = invoice_row.amount_centavos,
    last_error = null,
    next_attempt_at = p_paid_at
  where id = invoice_row.id;

  update public.billing_subscriptions
  set
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
  from public.stores
  where id = subscription_row.store_id
  for update;

  access_data := coalesce(store_data->'subscriptionAccess', '{}'::jsonb) || jsonb_build_object(
    'status', 'active',
    'paymentLink', '',
    'graceStartedAt', '',
    'graceEndsAt', '',
    'updatedAt', now()::text,
    'updatedBy', clean_actor
  );

  store_data := (store_data - 'pendingOwedAmount' - 'pendingOwedAmountEffectiveAt') || jsonb_build_object(
    'owedAmount', invoice_row.amount_centavos::numeric / 100,
    'subscriptionStart', new_period_start::text,
    'subscriptionEnd', new_period_end::text,
    'subscriptionAccess', access_data,
    'initialPaymentRequired', false,
    'initialPaymentStatus', case
      when invoice_row.invoice_type = 'initial' then 'paid'
      else coalesce(store_data->>'initialPaymentStatus', 'waived')
    end,
    'updatedAt', jsonb_build_object(
      'seconds', floor(extract(epoch from now()))::bigint,
      'nanoseconds', 0
    )
  );

  update public.stores
  set data = store_data
  where id = subscription_row.store_id;

  insert into public.billing_notifications (
    invoice_id, channel, notification_type, recipient, status, attempt_count, next_attempt_at
  ) values (
    invoice_row.id, 'email', 'payment_received', subscription_row.billing_email, 'pending', 0, now()
  )
  on conflict (invoice_id, channel, notification_type) do update
  set
    status = 'pending',
    attempt_count = 0,
    next_attempt_at = excluded.next_attempt_at,
    last_error = null,
    sent_at = null;

  return jsonb_build_object(
    'invoiceId', invoice_row.id,
    'storeId', subscription_row.store_id,
    'periodStart', new_period_start,
    'periodEnd', new_period_end,
    'paidAt', p_paid_at,
    'paymentMethod', 'manual_' || clean_method,
    'paymentReference', clean_reference
  );
end;
$$;

revoke all on function public.fulfill_billing_invoice_manually(uuid, text, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.fulfill_billing_invoice_manually(uuid, text, text, timestamptz, text)
  to service_role;
