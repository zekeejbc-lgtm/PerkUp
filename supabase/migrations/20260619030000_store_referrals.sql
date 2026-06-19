create table if not exists public.store_referral_redemptions (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  store_id text not null,
  referral_code text not null,
  created_at timestamptz not null default now(),
  unique (customer_id)
);

alter table public.store_referral_redemptions enable row level security;

drop policy if exists "store_referral_redemptions service role access" on public.store_referral_redemptions;
create policy "store_referral_redemptions service role access"
on public.store_referral_redemptions
for all
to service_role
using (true)
with check (true);

grant select, insert, update, delete on public.store_referral_redemptions to service_role;
