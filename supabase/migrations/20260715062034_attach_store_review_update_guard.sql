create or replace function private.enforce_store_review_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_role text := coalesce((select private.current_user_role()), '');
begin
  if current_user in ('postgres', 'service_role')
    or actor_role in ('admin', 'assistant_admin')
  then
    return new;
  end if;

  if not (select private.owns_store(old.data->>'storeId')) then
    raise exception 'Only the store owner can reply to this review'
      using errcode = '42501';
  end if;

  if (new.data - 'ownerReply' - 'ownerRepliedAt' - 'ownerReplyUpdatedAt')
     is distinct from
     (old.data - 'ownerReply' - 'ownerRepliedAt' - 'ownerReplyUpdatedAt') then
    raise exception 'Store owners may only change their reply'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_store_review_update() from public, anon, authenticated;

drop trigger if exists enforce_store_review_update on public.store_reviews;
create trigger enforce_store_review_update
before update on public.store_reviews
for each row
execute function private.enforce_store_review_update();
