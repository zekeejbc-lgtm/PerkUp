create table if not exists public.branch_requests (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branch_requests_bounded_document check (
    char_length(id) between 1 and 100
    and jsonb_typeof(data) = 'object'
    and pg_column_size(data) <= 65536
  )
);

alter table public.branch_requests enable row level security;

drop trigger if exists set_branch_requests_updated_at on public.branch_requests;
create trigger set_branch_requests_updated_at
before update on public.branch_requests
for each row execute function public.set_updated_at();

create index if not exists branch_requests_owner_id_idx
on public.branch_requests ((data->>'ownerId'));

create index if not exists branch_requests_status_idx
on public.branch_requests ((data->>'status'));

create unique index if not exists branch_requests_one_pending_per_owner_idx
on public.branch_requests ((data->>'ownerId'))
where data->>'status' in ('pending', 'processing');

create policy "branch requests owner and admin read"
on public.branch_requests for select to authenticated
using (
  data->>'ownerId' = (select auth.uid())::text
  or (select private.current_user_role()) in ('admin', 'auditor')
);

create policy "branch requests owner create"
on public.branch_requests for insert to authenticated
with check (
  data->>'ownerId' = (select auth.uid())::text
  and data->>'status' = 'pending'
  and nullif(btrim(data->>'branchName'), '') is not null
  and nullif(btrim(data->>'address'), '') is not null
  and jsonb_typeof(data->'lat') = 'number'
  and jsonb_typeof(data->'lng') = 'number'
);

grant select, insert on public.branch_requests to authenticated;
grant select, insert, update, delete on public.branch_requests to service_role;
