update public.customers
set data = data - 'lifetimeStars'
where data ? 'lifetimeStars';

update public.users
set data = data - 'lifetimeStars'
where data ? 'lifetimeStars';

create or replace function private.strip_lifetime_stars()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.data := coalesce(new.data, '{}'::jsonb) - 'lifetimeStars';
  return new;
end;
$$;

revoke all on function private.strip_lifetime_stars()
  from public, anon, authenticated;

drop trigger if exists customers_strip_lifetime_stars on public.customers;
create trigger customers_strip_lifetime_stars
before insert or update of data on public.customers
for each row execute function private.strip_lifetime_stars();

drop trigger if exists users_strip_lifetime_stars on public.users;
create trigger users_strip_lifetime_stars
before insert or update of data on public.users
for each row execute function private.strip_lifetime_stars();

drop policy if exists "users scoped update" on public.users;
create policy "users scoped update"
on public.users
for update to authenticated
using (
  (select private.current_user_role()) = 'admin'
  or id = (select auth.uid())::text
)
with check (
  (select private.current_user_role()) = 'admin'
  or (
    id = (select auth.uid())::text
    and coalesce(data->>'role', '') = coalesce((select private.current_user_role()), '')
    and coalesce(data->>'storeId', '') = coalesce((select private.current_user_store_id()), '')
    and coalesce(data->'qrVersion', '1'::jsonb) = coalesce((select private.current_user_data())->'qrVersion', '1'::jsonb)
    and coalesce(data->'forcePasswordReset', 'false'::jsonb) = coalesce((select private.current_user_data())->'forcePasswordReset', 'false'::jsonb)
  )
);

drop function if exists public.increment_loyalty_totals(text, text, integer);

create or replace function public.increment_loyalty_totals(
  p_customer_id text,
  p_card_id text,
  p_points integer,
  p_stamp_receipt_id text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_customer_id is null or p_customer_id = '' or p_points = 0 or abs(p_points) > 100 then
    raise exception 'Invalid loyalty increment';
  end if;

  if p_stamp_receipt_id is not null and char_length(p_stamp_receipt_id) > 512 then
    raise exception 'Invalid stamp receipt id';
  end if;

  if p_card_id is not null and p_card_id <> '' then
    update public.cards
    set data = jsonb_set(
      data,
      '{stars}',
      to_jsonb(greatest(coalesce((data->>'stars')::integer, 0) + p_points, 0)),
      true
    ) || jsonb_strip_nulls(jsonb_build_object(
      'lastStampReceiptId', p_stamp_receipt_id,
      'updatedAt',
      jsonb_build_object('seconds', floor(extract(epoch from now()))::bigint, 'nanoseconds', 0)
    ))
    where id = p_card_id
      and data->>'customerId' = p_customer_id;

    if not found then
      raise exception 'Loyalty card not found';
    end if;
  end if;
end;
$$;

revoke all on function public.increment_loyalty_totals(text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.increment_loyalty_totals(text, text, integer, text)
  to service_role;
