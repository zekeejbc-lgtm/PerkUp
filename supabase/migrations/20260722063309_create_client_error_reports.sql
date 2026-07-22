create table public.client_error_reports (
  id uuid primary key default gen_random_uuid(),
  error_code text not null unique,
  status text not null default 'open',
  message text not null,
  stack_trace text,
  page_url text,
  route text,
  user_agent text,
  app_version text,
  context jsonb not null default '{}'::jsonb,
  reporter_user_id uuid references auth.users(id) on delete set null,
  reporter_role text,
  reporter_key text not null,
  internal_notes text,
  created_at timestamptz not null default now(),
  status_updated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  constraint client_error_reports_code_format
    check (error_code ~ '^ERR-[0-9]{8}-[A-F0-9]{8}$'),
  constraint client_error_reports_status
    check (status in ('open', 'in_progress', 'fixed')),
  constraint client_error_reports_message_length
    check (char_length(message) between 1 and 2000),
  constraint client_error_reports_stack_length
    check (char_length(coalesce(stack_trace, '')) <= 8000),
  constraint client_error_reports_context_object
    check (jsonb_typeof(context) = 'object')
);

create index client_error_reports_status_created_idx
  on public.client_error_reports (status, created_at desc);

create index client_error_reports_reporter_cooldown_idx
  on public.client_error_reports (reporter_key, created_at desc);

alter table public.client_error_reports enable row level security;

-- Reports are accepted only by the error-reports Edge Function. Browser roles
-- intentionally have no direct table privileges; admins read through the
-- authenticated admin backend after its role check.
revoke all on public.client_error_reports from anon, authenticated;
grant select, insert, update, delete on public.client_error_reports to service_role;
