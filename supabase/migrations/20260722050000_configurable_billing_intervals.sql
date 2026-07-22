alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_interval_days_check;

alter table public.billing_subscriptions
  add constraint billing_subscriptions_interval_days_check
  check (interval_days between 1 and 365);
