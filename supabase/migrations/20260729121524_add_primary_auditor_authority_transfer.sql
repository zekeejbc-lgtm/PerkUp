begin;

create table private.primary_auditor_authority (
  singleton boolean primary key default true check (singleton),
  user_id text not null unique references public.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by text references public.users(id) on delete set null
);

create index primary_auditor_authority_assigned_by_idx
on private.primary_auditor_authority (assigned_by);

grant usage on schema private to service_role;
revoke all on table private.primary_auditor_authority from public, anon, authenticated;
grant select, insert, update on table private.primary_auditor_authority to service_role;

insert into private.primary_auditor_authority (singleton, user_id, assigned_by)
select true, u.id, u.id
from public.users u
where lower(coalesce(u.data->>'email', '')) = 'ezequieljohncrisostomo20@gmail.com'
  and u.data->>'role' = 'auditor'
order by u.created_at
limit 1
on conflict (singleton) do nothing;

create or replace function private.protect_permanent_auditor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  authority_user_id text;
begin
  select a.user_id
  into authority_user_id
  from private.primary_auditor_authority a
  where a.singleton = true;

  if authority_user_id is null
    and lower(coalesce(old.data->>'email', '')) = 'ezequieljohncrisostomo20@gmail.com'
  then
    authority_user_id := old.id;
  end if;

  if old.id <> authority_user_id then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Transfer primary auditor authority before deleting this account.'
      using errcode = '42501';
  end if;

  if coalesce(new.data->>'role', '') <> 'auditor'
    or coalesce(new.data->>'accountStatus', 'active') <> 'active'
  then
    raise exception 'Transfer primary auditor authority before changing this account role or status.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_permanent_auditor() from public, anon, authenticated;

create or replace function private.claim_initial_primary_auditor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(coalesce(new.data->>'email', '')) = 'ezequieljohncrisostomo20@gmail.com'
    and new.data->>'role' = 'auditor'
  then
    insert into private.primary_auditor_authority (singleton, user_id, assigned_by)
    values (true, new.id, new.id)
    on conflict (singleton) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.claim_initial_primary_auditor() from public, anon, authenticated;

drop trigger if exists claim_initial_primary_auditor on public.users;
create trigger claim_initial_primary_auditor
after insert on public.users
for each row execute function private.claim_initial_primary_auditor();

create or replace function public.transfer_primary_auditor_authority(
  p_actor_user_id text,
  p_replacement_user_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  authority_user_id text;
  actor_data jsonb;
  replacement_data jsonb;
  changed_at jsonb := jsonb_build_object(
    'seconds', floor(extract(epoch from clock_timestamp()))::bigint,
    'nanoseconds', 0
  );
begin
  if nullif(btrim(p_actor_user_id), '') is null
    or nullif(btrim(p_replacement_user_id), '') is null
    or p_actor_user_id = p_replacement_user_id
  then
    raise exception 'Choose a different account as the replacement auditor.'
      using errcode = '22023';
  end if;

  select a.user_id
  into authority_user_id
  from private.primary_auditor_authority a
  where a.singleton = true
  for update;

  if authority_user_id is null then
    select u.id
    into authority_user_id
    from public.users u
    where lower(coalesce(u.data->>'email', '')) = 'ezequieljohncrisostomo20@gmail.com'
      and u.data->>'role' = 'auditor'
    order by u.created_at
    limit 1
    for update;

    if authority_user_id is not null then
      insert into private.primary_auditor_authority (singleton, user_id, assigned_by)
      values (true, authority_user_id, authority_user_id);
    end if;
  end if;

  if authority_user_id is distinct from p_actor_user_id then
    raise exception 'Only the current primary auditor can transfer auditor authority.'
      using errcode = '42501';
  end if;

  select u.data into actor_data
  from public.users u
  where u.id = p_actor_user_id
  for update;

  select u.data into replacement_data
  from public.users u
  where u.id = p_replacement_user_id
  for update;

  if actor_data is null
    or actor_data->>'role' <> 'auditor'
    or coalesce(actor_data->>'accountStatus', 'active') <> 'active'
  then
    raise exception 'The current primary auditor is not eligible to transfer authority.'
      using errcode = '42501';
  end if;

  if replacement_data is null then
    raise exception 'The replacement account was not found.'
      using errcode = 'P0002';
  end if;

  if replacement_data->>'role' not in ('admin', 'assistant_admin', 'auditor')
    or coalesce(replacement_data->>'accountStatus', 'active') <> 'active'
    or coalesce((replacement_data->>'isDemo')::boolean, false)
  then
    raise exception 'Choose an active, non-demo administrator as the replacement auditor.'
      using errcode = '22023';
  end if;

  update private.primary_auditor_authority
  set user_id = p_replacement_user_id,
      assigned_at = now(),
      assigned_by = p_actor_user_id
  where singleton = true;

  update public.users
  set data = jsonb_set(
    jsonb_set(data, '{role}', '"auditor"', true),
    '{updatedAt}',
    changed_at,
    true
  )
  where id = p_replacement_user_id;

  update public.users
  set data = jsonb_set(
    jsonb_set(data, '{role}', '"admin"', true),
    '{updatedAt}',
    changed_at,
    true
  )
  where id = p_actor_user_id;

  insert into public.audit_events (
    actor_user_id,
    actor_email,
    actor_role,
    action,
    entity_type,
    entity_id,
    source,
    metadata
  )
  values (
    p_actor_user_id::uuid,
    actor_data->>'email',
    'auditor',
    'transfer_auditor_authority',
    'user',
    p_replacement_user_id,
    'database',
    jsonb_build_object(
      'previousAuditorUserId', p_actor_user_id,
      'auditorUserId', p_replacement_user_id
    )
  );

  return jsonb_build_object(
    'previousAuditorUserId', p_actor_user_id,
    'auditorUserId', p_replacement_user_id
  );
end;
$$;

revoke all on function public.transfer_primary_auditor_authority(text, text)
from public, anon, authenticated;
grant execute on function public.transfer_primary_auditor_authority(text, text)
to service_role;

create or replace function public.get_primary_auditor_user_id()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select a.user_id
  from private.primary_auditor_authority a
  where a.singleton = true
$$;

revoke all on function public.get_primary_auditor_user_id()
from public, anon, authenticated;
grant execute on function public.get_primary_auditor_user_id()
to service_role;

commit;
