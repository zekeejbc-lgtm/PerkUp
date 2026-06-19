create table if not exists public.customer_usernames (
  username text primary key,
  customer_id text not null unique references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_usernames_format_check check (
    username ~ '^[a-z][a-z0-9._]{2,22}[a-z0-9]$'
    and username !~ '[._]{2,}'
  )
);

drop trigger if exists set_customer_usernames_updated_at on public.customer_usernames;
create trigger set_customer_usernames_updated_at
before update on public.customer_usernames
for each row execute function public.set_updated_at();

insert into public.customer_usernames (username, customer_id)
select normalized_username, id
from (
  select
    id,
    lower(trim(data->>'username')) as normalized_username,
    row_number() over (
      partition by lower(trim(data->>'username'))
      order by updated_at desc, created_at desc, id
    ) as duplicate_rank
  from public.users
  where data->>'role' = 'customer'
    and coalesce(trim(data->>'username'), '') <> ''
) candidates
where duplicate_rank = 1
  and normalized_username ~ '^[a-z][a-z0-9._]{2,22}[a-z0-9]$'
  and normalized_username !~ '[._]{2,}'
on conflict do nothing;

alter table public.customer_usernames enable row level security;

drop policy if exists "customer usernames no direct access" on public.customer_usernames;

revoke all on public.customer_usernames from anon, authenticated;

grant select, insert, update, delete on public.customer_usernames to service_role;
