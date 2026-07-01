create table public.customer_phones (
  phone text primary key,
  customer_id text not null unique references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_phones_format_check check (phone ~ '^[0-9]{10,15}$')
);

drop trigger if exists set_customer_phones_updated_at on public.customer_phones;
create trigger set_customer_phones_updated_at
before update on public.customer_phones
for each row execute function public.set_updated_at();

insert into public.customer_phones (phone, customer_id)
select normalized_phone, id
from (
  select
    id,
    case
      when raw_phone ~ '^09[0-9]{9}$' then '63' || substring(raw_phone from 2)
      when raw_phone ~ '^9[0-9]{9}$' then '63' || raw_phone
      else raw_phone
    end as normalized_phone,
    row_number() over (
      partition by case
        when raw_phone ~ '^09[0-9]{9}$' then '63' || substring(raw_phone from 2)
        when raw_phone ~ '^9[0-9]{9}$' then '63' || raw_phone
        else raw_phone
      end
      order by updated_at desc, created_at desc, id
    ) as duplicate_rank
  from (
    select id,
      regexp_replace(coalesce(nullif(data->>'phone', ''), data->>'number', ''), '[^0-9]', '', 'g') as raw_phone,
      updated_at, created_at
    from public.users
    where data->>'role' = 'customer'
  ) phones
) candidates
where duplicate_rank = 1
  and normalized_phone ~ '^[0-9]{10,15}$'
on conflict do nothing;

alter table public.customer_phones enable row level security;
revoke all on public.customer_phones from anon, authenticated;
grant select, insert, update, delete on public.customer_phones to service_role;
