create extension if not exists pgcrypto;

create table if not exists public.promotion_claims (
  id uuid primary key default gen_random_uuid(),
  promotion_id text not null references public.promotions(id) on delete cascade,
  store_id text not null references public.stores(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null references public.cards(id) on delete cascade,
  redeem_code text not null unique,
  qr_token text not null unique,
  status text not null default 'claimed' check (status in ('claimed', 'redeemed', 'expired', 'cancelled')),
  claimed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id),
  redemption_method text check (redemption_method in ('qr', 'code', 'manual')),
  constraint promotion_claim_expiry_after_claim check (expires_at > claimed_at)
);

alter table public.promotion_claims enable row level security;
revoke all on public.promotion_claims from anon, authenticated;
grant select on public.promotion_claims to authenticated;

create policy "customers read own promotion claims"
on public.promotion_claims for select to authenticated
using ((select auth.uid()) = customer_id);

create index if not exists promotion_claims_customer_idx
  on public.promotion_claims (customer_id, claimed_at desc);
create index if not exists promotion_claims_store_status_idx
  on public.promotion_claims (store_id, status, expires_at);
create unique index if not exists promotion_claims_one_active_per_customer
  on public.promotion_claims (promotion_id, customer_id)
  where status = 'claimed';

create or replace function public.claim_promotion_reward(
  p_customer_id uuid,
  p_promotion_id text
) returns public.promotion_claims
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_promotion public.promotions%rowtype;
  v_card public.cards%rowtype;
  v_claim public.promotion_claims%rowtype;
  v_required integer;
  v_max integer;
  v_expiry_days integer;
  v_end_at timestamptz;
  v_expires_at timestamptz;
  v_reserved integer;
  v_progress integer;
  v_code text;
  v_token text;
begin
  update public.promotion_claims
  set status = 'expired'
  where status = 'claimed' and expires_at <= now();

  select * into v_promotion from public.promotions where id = p_promotion_id for update;
  if not found then raise exception 'Promotion was not found'; end if;
  if coalesce((v_promotion.data->>'active')::boolean, true) is false then
    raise exception 'Promotion is not active';
  end if;

  if nullif(v_promotion.data->>'startDate', '') is not null
     and (v_promotion.data->>'startDate')::timestamptz > now() then
    raise exception 'Promotion has not started yet';
  end if;
  if nullif(v_promotion.data->>'endDate', '') is not null then
    v_end_at := (v_promotion.data->>'endDate')::timestamptz;
    if v_end_at <= now() then raise exception 'Promotion has ended'; end if;
  end if;

  v_required := greatest(coalesce((v_promotion.data->>'requiredStamps')::integer, 10), 1);
  select * into v_card
  from public.cards
  where data->>'customerId' = p_customer_id::text
    and data->>'storeId' = v_promotion.data->>'storeId'
    and lower(coalesce(data->>'status', 'active')) = 'active'
  order by id
  limit 1
  for update;
  if not found then raise exception 'Loyalty card was not found'; end if;

  v_progress := coalesce((v_card.data->'promoProgress'->>p_promotion_id)::integer, 0);
  if v_progress < v_required then raise exception 'This reward is not ready to claim'; end if;

  select * into v_claim
  from public.promotion_claims
  where promotion_id = p_promotion_id and customer_id = p_customer_id and status = 'claimed'
  limit 1;
  if found then return v_claim; end if;

  if exists (
    select 1 from public.promotion_claims
    where promotion_id = p_promotion_id and customer_id = p_customer_id and status = 'redeemed'
  ) then raise exception 'This reward has already been redeemed'; end if;

  v_max := greatest(coalesce((v_promotion.data->>'maxRedemptions')::integer, 0), 0);
  if v_max > 0 then
    select count(*) into v_reserved
    from public.promotion_claims
    where promotion_id = p_promotion_id and status in ('claimed', 'redeemed');
    if v_reserved >= v_max then raise exception 'This promotion has no claims remaining'; end if;
  end if;

  v_expiry_days := least(greatest(coalesce((v_promotion.data->>'claimExpiryDays')::integer, 7), 1), 365);
  v_expires_at := now() + make_interval(days => v_expiry_days);
  if v_end_at is not null then v_expires_at := least(v_expires_at, v_end_at); end if;
  if v_expires_at <= now() then raise exception 'This promotion no longer has a valid claim window'; end if;

  loop
    v_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10));
    exit when not exists (select 1 from public.promotion_claims where redeem_code = v_code);
  end loop;
  v_token := 'perkup:redeem:v1:' || gen_random_uuid()::text || ':' || encode(gen_random_bytes(18), 'hex');

  insert into public.promotion_claims (
    promotion_id, store_id, customer_id, card_id, redeem_code, qr_token, expires_at
  ) values (
    p_promotion_id, v_promotion.data->>'storeId', p_customer_id, v_card.id, v_code, v_token, v_expires_at
  ) returning * into v_claim;
  return v_claim;
end;
$$;

create or replace function public.redeem_promotion_reward(
  p_store_id text,
  p_staff_id uuid,
  p_lookup text,
  p_method text
) returns public.promotion_claims
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claim public.promotion_claims%rowtype;
begin
  update public.promotion_claims
  set status = 'expired'
  where status = 'claimed' and expires_at <= now();

  select * into v_claim
  from public.promotion_claims
  where store_id = p_store_id
    and (qr_token = trim(p_lookup) or redeem_code = upper(trim(p_lookup)) or id::text = trim(p_lookup))
  limit 1
  for update;
  if not found then raise exception 'Claim code was not found for this store'; end if;
  if v_claim.status = 'redeemed' then raise exception 'This claim has already been redeemed'; end if;
  if v_claim.status = 'expired' or v_claim.expires_at <= now() then raise exception 'This claim has expired'; end if;
  if v_claim.status <> 'claimed' then raise exception 'This claim is not redeemable'; end if;
  if p_method not in ('qr', 'code', 'manual') then raise exception 'Invalid redemption method'; end if;

  update public.promotion_claims
  set status = 'redeemed', redeemed_at = now(), redeemed_by = p_staff_id, redemption_method = p_method
  where id = v_claim.id
  returning * into v_claim;

  insert into public.promotions_scanned (id, data)
  values (gen_random_uuid()::text, jsonb_build_object(
    'type', 'reward_redemption',
    'status', 'redeemed',
    'claimId', v_claim.id,
    'promotionId', v_claim.promotion_id,
    'customerId', v_claim.customer_id,
    'storeId', v_claim.store_id,
    'staffId', p_staff_id,
    'redemptionMethod', p_method,
    'redeemedAt', now()
  ));
  return v_claim;
end;
$$;

revoke all on function public.claim_promotion_reward(uuid, text) from public, anon, authenticated;
revoke all on function public.redeem_promotion_reward(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_promotion_reward(uuid, text) to service_role;
grant execute on function public.redeem_promotion_reward(text, uuid, text, text) to service_role;
