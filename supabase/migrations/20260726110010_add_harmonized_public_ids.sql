-- Human-safe public identifiers. Internal primary keys remain unchanged and
-- continue to power foreign keys, ownership checks, and RLS.

create or replace function private.generate_public_id(p_prefix text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  normalized_prefix text := upper(btrim(p_prefix));
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  random_bytes bytea := uuid_send(gen_random_uuid());
  token text := '';
  byte_index integer;
begin
  if normalized_prefix <> all (array[
    'ACC', 'CUS', 'STR', 'BRN', 'APP', 'BRQ', 'FDB', 'REV', 'SFB',
    'PRD', 'PRM', 'CLM', 'CRD', 'TKT', 'RFR', 'SUB', 'INV', 'NTF',
    'ERR', 'AUD', 'DMT'
  ]) then
    raise exception 'Unsupported public ID prefix: %', normalized_prefix
      using errcode = '22023';
  end if;

  for byte_index in 0..7 loop
    token := token || substr(
      alphabet,
      (get_byte(random_bytes, byte_index) % length(alphabet)) + 1,
      1
    );
  end loop;

  return normalized_prefix || '-' || token;
end;
$$;

create or replace function private.assign_public_id()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_prefix text := upper(btrim(tg_argv[0]));
begin
  if tg_op = 'UPDATE' then
    if new.public_id is distinct from old.public_id then
      raise exception 'Public IDs are immutable.'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if target_prefix = 'ACCOUNT' then
    target_prefix := case
      when new.data->>'role' = 'customer' then 'CUS'
      else 'ACC'
    end;
  elsif target_prefix = 'CUSTOMER' then
    select u.public_id
    into new.public_id
    from public.users u
    where u.id = new.id
      and u.public_id like 'CUS-%';

    if new.public_id is null then
      new.public_id := private.generate_public_id('CUS');
    end if;
    return new;
  elsif target_prefix = 'STORE' then
    target_prefix := case
      when coalesce((new.data->>'isPrimaryBranch')::boolean, true) = false then 'BRN'
      else 'STR'
    end;
  end if;

  -- Always replace a caller-supplied value so browser clients cannot choose
  -- identifiers for themselves.
  new.public_id := private.generate_public_id(target_prefix);
  return new;
end;
$$;

revoke all on function private.generate_public_id(text) from public, anon, authenticated;
revoke all on function private.assign_public_id() from public, anon, authenticated;

alter table public.users add column if not exists public_id text;
alter table public.customers add column if not exists public_id text;
alter table public.stores add column if not exists public_id text;
alter table public.applications add column if not exists public_id text;
alter table public.promotions add column if not exists public_id text;
alter table public.products add column if not exists public_id text;
alter table public.cards add column if not exists public_id text;
alter table public.promotions_scanned add column if not exists public_id text;
alter table public.feedback add column if not exists public_id text;
alter table public.store_reviews add column if not exists public_id text;
alter table public.branch_requests add column if not exists public_id text;
alter table public.site_feedback_submissions add column if not exists public_id text;
alter table public.store_referral_redemptions add column if not exists public_id text;
alter table public.promotion_claims add column if not exists public_id text;
alter table public.billing_subscriptions add column if not exists public_id text;
alter table public.billing_invoices add column if not exists public_id text;
alter table public.billing_notifications add column if not exists public_id text;
alter table public.client_error_reports add column if not exists public_id text;
alter table public.audit_events add column if not exists public_id text;
alter table public.demo_tenants add column if not exists public_id text;

update public.users
set public_id = private.generate_public_id(
  case when data->>'role' = 'customer' then 'CUS' else 'ACC' end
)
where public_id is null;

update public.customers
set public_id = coalesce(
  (
    select u.public_id
    from public.users u
    where u.id = customers.id
      and u.public_id like 'CUS-%'
  ),
  private.generate_public_id('CUS')
)
where public_id is null;

update public.stores
set public_id = private.generate_public_id(
  case
    when coalesce((data->>'isPrimaryBranch')::boolean, true) = false then 'BRN'
    else 'STR'
  end
)
where public_id is null;

update public.applications
set public_id = private.generate_public_id('APP')
where public_id is null;

update public.promotions
set public_id = private.generate_public_id('PRM')
where public_id is null;

update public.products
set public_id = private.generate_public_id('PRD')
where public_id is null;

update public.cards
set public_id = private.generate_public_id('CRD')
where public_id is null;

update public.promotions_scanned
set public_id = private.generate_public_id('TKT')
where public_id is null;

update public.feedback
set public_id = private.generate_public_id('SFB')
where public_id is null;

update public.store_reviews
set public_id = private.generate_public_id('REV')
where public_id is null;

update public.branch_requests
set public_id = private.generate_public_id('BRQ')
where public_id is null;

update public.site_feedback_submissions
set public_id = private.generate_public_id('FDB')
where public_id is null;

update public.store_referral_redemptions
set public_id = private.generate_public_id('RFR')
where public_id is null;

update public.promotion_claims
set public_id = private.generate_public_id('CLM')
where public_id is null;

update public.billing_subscriptions
set public_id = private.generate_public_id('SUB')
where public_id is null;

update public.billing_invoices
set public_id = private.generate_public_id('INV')
where public_id is null;

update public.billing_notifications
set public_id = private.generate_public_id('NTF')
where public_id is null;

update public.client_error_reports
set public_id = private.generate_public_id('ERR')
where public_id is null;

update public.audit_events
set public_id = private.generate_public_id('AUD')
where public_id is null;

update public.demo_tenants
set public_id = private.generate_public_id('DMT')
where public_id is null;

create unique index if not exists users_public_id_key on public.users (public_id);
create unique index if not exists customers_public_id_key on public.customers (public_id);
create unique index if not exists stores_public_id_key on public.stores (public_id);
create unique index if not exists applications_public_id_key on public.applications (public_id);
create unique index if not exists promotions_public_id_key on public.promotions (public_id);
create unique index if not exists products_public_id_key on public.products (public_id);
create unique index if not exists cards_public_id_key on public.cards (public_id);
create unique index if not exists promotions_scanned_public_id_key on public.promotions_scanned (public_id);
create unique index if not exists feedback_public_id_key on public.feedback (public_id);
create unique index if not exists store_reviews_public_id_key on public.store_reviews (public_id);
create unique index if not exists branch_requests_public_id_key on public.branch_requests (public_id);
create unique index if not exists site_feedback_submissions_public_id_key on public.site_feedback_submissions (public_id);
create unique index if not exists store_referral_redemptions_public_id_key on public.store_referral_redemptions (public_id);
create unique index if not exists promotion_claims_public_id_key on public.promotion_claims (public_id);
create unique index if not exists billing_subscriptions_public_id_key on public.billing_subscriptions (public_id);
create unique index if not exists billing_invoices_public_id_key on public.billing_invoices (public_id);
create unique index if not exists billing_notifications_public_id_key on public.billing_notifications (public_id);
create unique index if not exists client_error_reports_public_id_key on public.client_error_reports (public_id);
create unique index if not exists audit_events_public_id_key on public.audit_events (public_id);
create unique index if not exists demo_tenants_public_id_key on public.demo_tenants (public_id);

do $$
declare
  target record;
begin
  for target in
    select *
    from (values
      ('users', '^(ACC|CUS)-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'),
      ('customers', '^CUS-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'),
      ('stores', '^(STR|BRN)-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'),
      ('applications', '^APP-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'),
      ('promotions', '^PRM-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'),
      ('products', '^PRD-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'),
      ('cards', '^CRD-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'),
      ('promotions_scanned', '^TKT-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'),
      ('feedback', '^SFB-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'),
      ('store_reviews', '^REV-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'),
      ('branch_requests', '^BRQ-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'),
      ('site_feedback_submissions', '^FDB-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'),
      ('store_referral_redemptions', '^RFR-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'),
      ('promotion_claims', '^CLM-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'),
      ('billing_subscriptions', '^SUB-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'),
      ('billing_invoices', '^INV-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'),
      ('billing_notifications', '^NTF-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'),
      ('client_error_reports', '^ERR-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'),
      ('audit_events', '^AUD-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'),
      ('demo_tenants', '^DMT-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$')
    ) as configured(table_name, expected_pattern)
  loop
    execute format(
      'alter table public.%I alter column public_id set not null',
      target.table_name
    );

    if not exists (
      select 1
      from pg_constraint
      where conrelid = format('public.%I', target.table_name)::regclass
        and conname = target.table_name || '_public_id_format'
    ) then
      execute format(
        'alter table public.%I add constraint %I check (public_id ~ %L)',
        target.table_name,
        target.table_name || '_public_id_format',
        target.expected_pattern
      );
    end if;
  end loop;
end;
$$;

do $$
declare
  target record;
begin
  for target in
    select *
    from (values
      ('users', 'ACCOUNT'),
      ('customers', 'CUSTOMER'),
      ('stores', 'STORE'),
      ('applications', 'APP'),
      ('promotions', 'PRM'),
      ('products', 'PRD'),
      ('cards', 'CRD'),
      ('promotions_scanned', 'TKT'),
      ('feedback', 'SFB'),
      ('store_reviews', 'REV'),
      ('branch_requests', 'BRQ'),
      ('site_feedback_submissions', 'FDB'),
      ('store_referral_redemptions', 'RFR'),
      ('promotion_claims', 'CLM'),
      ('billing_subscriptions', 'SUB'),
      ('billing_invoices', 'INV'),
      ('billing_notifications', 'NTF'),
      ('client_error_reports', 'ERR'),
      ('audit_events', 'AUD'),
      ('demo_tenants', 'DMT')
    ) as configured(table_name, public_prefix)
  loop
    execute format(
      'drop trigger if exists assign_public_id on public.%I',
      target.table_name
    );
    execute format(
      'create trigger assign_public_id before insert or update on public.%I for each row execute function private.assign_public_id(%L)',
      target.table_name,
      target.public_prefix
    );
  end loop;
end;
$$;
