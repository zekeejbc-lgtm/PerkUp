-- Server-only counters for public endpoint abuse prevention. Values are salted
-- hashes; raw IP addresses and queried email addresses are never stored here.
create table public.request_rate_limits (
  key_hash text not null,
  purpose text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count between 1 and 100000),
  updated_at timestamptz not null default now(),
  primary key (purpose, key_hash),
  constraint request_rate_limits_key_hash_format check (key_hash ~ '^[a-f0-9]{64}$'),
  constraint request_rate_limits_purpose_length check (char_length(purpose) between 1 and 80)
);

create index request_rate_limits_updated_idx
  on public.request_rate_limits (updated_at);

alter table public.request_rate_limits enable row level security;
revoke all on public.request_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.request_rate_limits to service_role;

create or replace function public.consume_request_rate_limit(
  p_key_hash text,
  p_purpose text,
  p_limit integer,
  p_window_seconds integer,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_count integer;
begin
  if p_key_hash !~ '^[a-f0-9]{64}$'
    or char_length(p_purpose) not between 1 and 80
    or p_limit not between 1 and 100000
    or p_window_seconds not between 1 and 604800 then
    raise exception 'Invalid rate-limit input.' using errcode = '22023';
  end if;

  insert into public.request_rate_limits as limits (
    key_hash, purpose, window_started_at, request_count, updated_at
  ) values (
    p_key_hash, p_purpose, p_now, 1, p_now
  )
  on conflict (purpose, key_hash) do update
    set request_count = case
      when limits.window_started_at <= p_now - make_interval(secs => p_window_seconds) then 1
      else least(limits.request_count + 1, 100000)
    end,
    window_started_at = case
      when limits.window_started_at <= p_now - make_interval(secs => p_window_seconds) then p_now
      else limits.window_started_at
    end,
    updated_at = p_now
  returning request_count into next_count;

  return next_count <= p_limit;
end;
$$;

revoke all on function public.consume_request_rate_limit(text, text, integer, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.consume_request_rate_limit(text, text, integer, integer, timestamptz)
  to service_role;

-- Newsletter subscriptions require proof of control of the mailbox. Browser
-- roles no longer write this table directly.
alter table public.newsletter_subscribers
  add column if not exists status text not null default 'pending',
  add column if not exists consent_source text,
  add column if not exists consent_notice_version text,
  add column if not exists consented_at timestamptz,
  add column if not exists confirmation_requested_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists unsubscribed_at timestamptz,
  add column if not exists confirmation_token_hash text,
  add column if not exists unsubscribe_token_hash text,
  add column if not exists request_key_hash text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.newsletter_subscribers
  drop constraint if exists newsletter_subscribers_status_check;
alter table public.newsletter_subscribers
  add constraint newsletter_subscribers_status_check
  check (status in ('pending', 'active', 'unsubscribed'));

create unique index if not exists newsletter_confirmation_token_key
  on public.newsletter_subscribers (confirmation_token_hash)
  where confirmation_token_hash is not null;
create unique index if not exists newsletter_unsubscribe_token_key
  on public.newsletter_subscribers (unsubscribe_token_hash)
  where unsubscribe_token_hash is not null;

drop policy if exists "newsletter public create" on public.newsletter_subscribers;
revoke insert, select, update, delete on public.newsletter_subscribers from anon, authenticated;
grant select, insert, update, delete on public.newsletter_subscribers to service_role;

-- The first feedback implementation is no longer used. Close its old direct
-- insert policy so all new feedback goes through the validated, rate-limited
-- site_feedback_submissions Edge Function path.
drop policy if exists "site feedback public create" on public.site_feedback;
revoke insert, select, update, delete on public.site_feedback from anon, authenticated;
grant select, insert, update, delete on public.site_feedback to service_role;

-- Existing addresses predate auditable opt-in, so they must confirm before
-- receiving any future marketing communication.
update public.newsletter_subscribers
set status = 'pending',
    consent_source = coalesce(consent_source, 'legacy-import-reconfirmation-required'),
    consent_notice_version = null,
    consented_at = null,
    confirmed_at = null,
    confirmation_requested_at = now(),
    updated_at = now()
where confirmed_at is null;

alter table public.billing_invoices
  add column if not exists legal_hold boolean not null default false;
alter table public.subscription_plan_changes
  add column if not exists legal_hold boolean not null default false;

-- Enforce finite retention for operational personal data. The periods mirror
-- the published policy and can be revised by a later, counsel-approved migration.
create or replace function private.run_privacy_retention_cleanup(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_rate_limits integer := 0;
  removed_newsletter integer := 0;
  removed_feedback integer := 0;
  removed_legacy_feedback integer := 0;
  removed_error_reports integer := 0;
  removed_applications integer := 0;
  redacted_applications integer := 0;
  removed_audit_events integer := 0;
  removed_invoices integer := 0;
  removed_plan_changes integer := 0;
  removed_webhook_events integer := 0;
begin
  delete from public.request_rate_limits
  where updated_at < p_now - interval '8 days';
  get diagnostics removed_rate_limits = row_count;

  delete from public.newsletter_subscribers
  where (status = 'pending' and coalesce(confirmation_requested_at, created_at) < p_now - interval '7 days')
     or (status = 'unsubscribed' and unsubscribed_at < p_now - interval '30 days');
  get diagnostics removed_newsletter = row_count;

  delete from public.site_feedback_submissions
  where created_at < p_now - interval '24 months';
  get diagnostics removed_feedback = row_count;

  delete from public.site_feedback
  where created_at < p_now - interval '24 months';
  get diagnostics removed_legacy_feedback = row_count;

  delete from public.client_error_reports
  where status = 'fixed'
    and coalesce(resolved_at, updated_at, created_at) < p_now - interval '12 months';
  get diagnostics removed_error_reports = row_count;

  update public.applications
  set data = data
      - array['applicantName', 'email', 'phoneNumber', 'personalFacebookUrl']::text[]
      || jsonb_build_object('privacyRedactedAt', p_now::text),
      updated_at = p_now
  where coalesce(data->>'status', '') = 'approved'
    and updated_at < p_now - interval '90 days'
    and not (data ? 'privacyRedactedAt');
  get diagnostics redacted_applications = row_count;

  delete from public.applications
  where coalesce(data->>'status', 'pending') in ('rejected', 'declined', 'cancelled')
    and updated_at < p_now - interval '24 months';
  get diagnostics removed_applications = row_count;

  delete from public.audit_events
  where created_at < p_now - interval '24 months';
  get diagnostics removed_audit_events = row_count;

  -- Break the intentionally restrictive invoice/change references only after
  -- both records have reached a terminal state and the five-year accounting
  -- period has elapsed. A legal hold prevents every related deletion.
  update public.billing_invoices invoice
  set subscription_plan_change_id = null,
      updated_at = p_now
  where invoice.created_at < p_now - interval '5 years'
    and invoice.status in ('paid', 'expired', 'void')
    and not invoice.legal_hold
    and invoice.subscription_plan_change_id is not null
    and exists (
      select 1 from public.subscription_plan_changes plan_change
      where plan_change.id = invoice.subscription_plan_change_id
        and plan_change.status in ('applied', 'cancelled', 'failed')
        and not plan_change.legal_hold
    );

  update public.subscription_plan_changes plan_change
  set renewal_invoice_id = null,
      updated_at = p_now
  where plan_change.created_at < p_now - interval '5 years'
    and plan_change.status in ('applied', 'cancelled', 'failed')
    and not plan_change.legal_hold
    and plan_change.renewal_invoice_id is not null
    and exists (
      select 1 from public.billing_invoices invoice
      where invoice.id = plan_change.renewal_invoice_id
        and invoice.status in ('paid', 'expired', 'void')
        and not invoice.legal_hold
    );

  delete from public.subscription_plan_changes
  where created_at < p_now - interval '5 years'
    and status in ('applied', 'cancelled', 'failed')
    and not legal_hold
    and renewal_invoice_id is null
    and not exists (
      select 1 from public.billing_invoices invoice
      where invoice.subscription_plan_change_id = subscription_plan_changes.id
    );
  get diagnostics removed_plan_changes = row_count;

  delete from public.billing_invoices
  where created_at < p_now - interval '5 years'
    and status in ('paid', 'expired', 'void')
    and not legal_hold
    and subscription_plan_change_id is null
    and not exists (
      select 1 from public.subscription_plan_changes plan_change
      where plan_change.renewal_invoice_id = billing_invoices.id
    );
  get diagnostics removed_invoices = row_count;

  delete from public.paymongo_webhook_events
  where received_at < p_now - interval '24 months'
    and status in ('processed', 'ignored');
  get diagnostics removed_webhook_events = row_count;

  return jsonb_build_object(
    'rateLimits', removed_rate_limits,
    'newsletter', removed_newsletter,
    'feedback', removed_feedback,
    'legacyFeedback', removed_legacy_feedback,
    'errorReports', removed_error_reports,
    'applicationsDeleted', removed_applications,
    'applicationsRedacted', redacted_applications,
    'auditEvents', removed_audit_events,
    'billingInvoices', removed_invoices,
    'planChanges', removed_plan_changes,
    'webhookEvents', removed_webhook_events
  );
end;
$$;

revoke all on function private.run_privacy_retention_cleanup(timestamptz)
  from public, anon, authenticated;
grant execute on function private.run_privacy_retention_cleanup(timestamptz)
  to service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'perk-privacy-retention-daily';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'perk-privacy-retention-daily',
    '25 3 * * *',
    'select private.run_privacy_retention_cleanup()'
  );
end
$$;
