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

  insert into public.customers (id, data)
  values (
    p_customer_id,
    jsonb_strip_nulls(jsonb_build_object(
      'userId', p_customer_id,
      'lifetimeStars', greatest(p_points, 0),
      'lastStampReceiptId', p_stamp_receipt_id,
      'updatedAt', jsonb_build_object('seconds', floor(extract(epoch from now()))::bigint, 'nanoseconds', 0)
    ))
  )
  on conflict (id) do update
  set data = public.customers.data || jsonb_strip_nulls(jsonb_build_object(
    'lifetimeStars', greatest(coalesce((public.customers.data->>'lifetimeStars')::integer, 0) + p_points, 0),
    'lastStampReceiptId', p_stamp_receipt_id,
    'updatedAt', jsonb_build_object('seconds', floor(extract(epoch from now()))::bigint, 'nanoseconds', 0)
  ));
end;
$$;

revoke all on function public.increment_loyalty_totals(text, text, integer, text) from public, anon, authenticated;
grant execute on function public.increment_loyalty_totals(text, text, integer, text) to service_role;

create index if not exists scans_cryptographic_id_idx
  on public.promotions_scanned ((data->>'cryptographicId'));
