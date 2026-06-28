create table if not exists public.site_feedback (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  category text not null default 'general',
  message text not null,
  created_at timestamptz not null default now(),
  constraint site_feedback_name_length check (char_length(coalesce(name, '')) <= 100),
  constraint site_feedback_email_length check (char_length(coalesce(email, '')) <= 254),
  constraint site_feedback_message_length check (char_length(message) between 10 and 2000)
);

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now(),
  constraint newsletter_email_length check (char_length(email) between 3 and 254)
);

create unique index if not exists newsletter_subscribers_email_key
  on public.newsletter_subscribers (lower(email));

alter table public.site_feedback enable row level security;
alter table public.newsletter_subscribers enable row level security;

drop policy if exists "site feedback public create" on public.site_feedback;
create policy "site feedback public create"
  on public.site_feedback for insert to anon, authenticated
  with check (true);

drop policy if exists "newsletter public create" on public.newsletter_subscribers;
create policy "newsletter public create"
  on public.newsletter_subscribers for insert to anon, authenticated
  with check (true);

grant insert on public.site_feedback to anon, authenticated;
grant insert on public.newsletter_subscribers to anon, authenticated;
revoke select, update, delete on public.site_feedback from anon, authenticated;
revoke select, update, delete on public.newsletter_subscribers from anon, authenticated;
