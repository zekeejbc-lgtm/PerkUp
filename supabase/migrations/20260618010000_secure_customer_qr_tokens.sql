create table if not exists public.customer_qr_tokens (
  token_hash text primary key,
  customer_id text not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists customer_qr_tokens_customer_id_idx
  on public.customer_qr_tokens (customer_id);

create index if not exists customer_qr_tokens_expires_at_idx
  on public.customer_qr_tokens (expires_at);

alter table public.customer_qr_tokens enable row level security;

drop policy if exists "customer qr tokens no direct access" on public.customer_qr_tokens;

revoke all on public.customer_qr_tokens from anon, authenticated;
