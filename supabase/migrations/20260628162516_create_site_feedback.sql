create table if not exists public.site_feedback (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_feedback enable row level security;

create policy "site feedback public create"
on public.site_feedback
for insert
to anon, authenticated
with check (
  jsonb_typeof(data) = 'object'
  and length(data->>'message') between 10 and 2000
  and length(coalesce(data->>'name', '')) <= 100
  and length(coalesce(data->>'email', '')) <= 254
  and data->>'category' in ('general', 'feature', 'issue', 'privacy')
);

grant insert on public.site_feedback to anon, authenticated;
grant select, insert, update, delete on public.site_feedback to service_role;
