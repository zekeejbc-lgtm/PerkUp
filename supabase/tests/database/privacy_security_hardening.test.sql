begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions;

select plan(15);

select has_table('public', 'request_rate_limits', 'request-rate limits are stored server-side');
select has_column('public', 'newsletter_subscribers', 'confirmation_token_hash', 'newsletter confirmation tokens are hashed');
select has_column('public', 'newsletter_subscribers', 'unsubscribe_token_hash', 'newsletter unsubscribe tokens are hashed');
select has_column('public', 'newsletter_subscribers', 'confirmation_requested_at', 'newsletter confirmation expiry is based on the latest request');
select has_column('public', 'newsletter_subscribers', 'consent_notice_version', 'newsletter consent records identify the displayed notice');
select has_column('public', 'billing_invoices', 'legal_hold', 'invoice retention supports legal holds');
select has_column('public', 'subscription_plan_changes', 'legal_hold', 'plan-change retention supports legal holds');

select function_privs_are(
  'public',
  'consume_request_rate_limit',
  array['text', 'text', 'integer', 'integer', 'timestamp with time zone'],
  'service_role',
  array['EXECUTE'],
  'only the service role can consume application rate limits'
);

select function_privs_are(
  'private',
  'run_privacy_retention_cleanup',
  array['timestamp with time zone'],
  'service_role',
  array['EXECUTE'],
  'only the service role can run retention cleanup directly'
);

select table_privs_are(
  'public',
  'newsletter_subscribers',
  'anon',
  array[]::text[],
  'anonymous clients cannot read or write newsletter records directly'
);

select table_privs_are(
  'public',
  'newsletter_subscribers',
  'authenticated',
  array[]::text[],
  'authenticated clients cannot read or write newsletter records directly'
);

select table_privs_are(
  'public',
  'site_feedback',
  'anon',
  array[]::text[],
  'the retired feedback table no longer accepts direct anonymous writes'
);

select table_privs_are(
  'public',
  'request_rate_limits',
  'anon',
  array[]::text[],
  'anonymous clients cannot access rate-limit counters'
);

select table_privs_are(
  'public',
  'request_rate_limits',
  'authenticated',
  array[]::text[],
  'authenticated clients cannot access rate-limit counters'
);

select ok(
  exists (
    select 1
    from cron.job
    where jobname = 'perk-privacy-retention-daily'
  ),
  'daily privacy-retention cleanup is scheduled'
);

select * from finish();
rollback;
