-- Promotion dates come from datetime-local inputs and therefore have no UTC
-- offset. Interpret those wall-clock values in the same Asia/Manila timezone
-- used by the customer and owner UIs. Preserve explicit offsets when present.
create or replace function public.claim_promotion_reward(
  p_customer_id uuid,
  p_promotion_id text
) returns public.promotion_claims
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_promotion public.promotions%rowtype;
  v_card public.cards%rowtype;
  v_claim public.promotion_claims%rowtype;
  v_required integer;
  v_max integer;
  v_expiry_days integer;
  v_start_at timestamptz;
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

  if nullif(v_promotion.data->>'startDate', '') is not null then
    v_start_at := case
      when v_promotion.data->>'startDate'
        ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,6})?)?$'
        then (v_promotion.data->>'startDate')::timestamp at time zone 'Asia/Manila'
      else (v_promotion.data->>'startDate')::timestamptz
    end;
    if v_start_at > now() then raise exception 'Promotion has not started yet'; end if;
  end if;

  if nullif(v_promotion.data->>'endDate', '') is not null then
    v_end_at := case
      when v_promotion.data->>'endDate'
        ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,6})?)?$'
        then (v_promotion.data->>'endDate')::timestamp at time zone 'Asia/Manila'
      else (v_promotion.data->>'endDate')::timestamptz
    end;
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
