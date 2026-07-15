alter table public.site_feedback_submissions
  add column if not exists reference_number text,
  add column if not exists status text not null default 'received',
  add column if not exists public_response text,
  add column if not exists internal_notes text,
  add column if not exists status_updated_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.site_feedback_submissions
set reference_number = 'FB-LEGACY-' || upper(substr(replace(id::text, '-', ''), 1, 12))
where reference_number is null;

alter table public.site_feedback_submissions
  alter column reference_number set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'site_feedback_submissions_reference_number_key'
      and conrelid = 'public.site_feedback_submissions'::regclass
  ) then
    alter table public.site_feedback_submissions
      add constraint site_feedback_submissions_reference_number_key unique (reference_number);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'site_feedback_submissions_status_check'
      and conrelid = 'public.site_feedback_submissions'::regclass
  ) then
    alter table public.site_feedback_submissions
      add constraint site_feedback_submissions_status_check
      check (status in ('received', 'reviewing', 'planned', 'in_progress', 'resolved', 'closed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'site_feedback_submissions_public_response_length'
      and conrelid = 'public.site_feedback_submissions'::regclass
  ) then
    alter table public.site_feedback_submissions
      add constraint site_feedback_submissions_public_response_length
      check (char_length(coalesce(public_response, '')) <= 2000);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'site_feedback_submissions_internal_notes_length'
      and conrelid = 'public.site_feedback_submissions'::regclass
  ) then
    alter table public.site_feedback_submissions
      add constraint site_feedback_submissions_internal_notes_length
      check (char_length(coalesce(internal_notes, '')) <= 4000);
  end if;
end $$;

create index if not exists site_feedback_submissions_status_created_idx
  on public.site_feedback_submissions (status, created_at desc);

create index if not exists site_feedback_submissions_created_at_idx
  on public.site_feedback_submissions (created_at desc);

create index if not exists site_feedback_submissions_email_created_idx
  on public.site_feedback_submissions (email, created_at desc)
  where email is not null;

create index if not exists newsletter_subscribers_created_at_idx
  on public.newsletter_subscribers (created_at desc);

drop policy if exists "site feedback submissions public create" on public.site_feedback_submissions;
revoke insert, select, update, delete on public.site_feedback_submissions from anon, authenticated;
grant select, insert, update, delete on public.site_feedback_submissions to service_role;
grant select, insert, update, delete on public.newsletter_subscribers to service_role;
