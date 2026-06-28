drop policy if exists "site feedback public create" on public.site_feedback;
revoke insert on public.site_feedback from anon, authenticated;

create table if not exists public.site_feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  category text not null default 'general',
  message text not null,
  created_at timestamptz not null default now(),
  constraint site_feedback_submissions_name_length check (char_length(coalesce(name, '')) <= 100),
  constraint site_feedback_submissions_email_length check (char_length(coalesce(email, '')) <= 254),
  constraint site_feedback_submissions_category check (category in ('general', 'bug', 'feature', 'business')),
  constraint site_feedback_submissions_message_length check (char_length(message) between 10 and 2000)
);

alter table public.site_feedback_submissions enable row level security;

drop policy if exists "site feedback submissions public create" on public.site_feedback_submissions;
create policy "site feedback submissions public create"
  on public.site_feedback_submissions for insert to anon, authenticated
  with check (
    char_length(message) between 10 and 2000
    and char_length(coalesce(name, '')) <= 100
    and char_length(coalesce(email, '')) <= 254
    and category in ('general', 'bug', 'feature', 'business')
  );

drop policy if exists "newsletter public create" on public.newsletter_subscribers;
create policy "newsletter public create"
  on public.newsletter_subscribers for insert to anon, authenticated
  with check (
    char_length(email) between 3 and 254
    and position('@' in email) > 1
  );

grant insert on public.site_feedback_submissions to anon, authenticated;
revoke select, update, delete on public.site_feedback_submissions from anon, authenticated;
