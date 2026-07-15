-- Store owners can edit their public business profile, but subscription,
-- lifecycle, and branch-topology fields are controlled by administrators.
-- Keep this enforcement in the live database because the stores row is otherwise
-- intentionally writable from the browser through RLS.
create or replace function private.protect_store_subscription_access()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  protected_key text;
begin
  if current_user in ('postgres', 'service_role')
    or coalesce((select private.current_user_role()), '') = 'admin'
  then
    return new;
  end if;

  foreach protected_key in array array[
    'status',
    'subscriptionLevel',
    'subscriptionDependencies',
    'branchLimit',
    'owedAmount',
    'pendingOwedAmount',
    'pendingOwedAmountEffectiveAt',
    'paymentSchedule',
    'subscriptionStart',
    'subscriptionEnd',
    'subscriptionAccess',
    'parentStoreId',
    'isPrimaryBranch'
  ]
  loop
    if old.data->protected_key is distinct from new.data->protected_key then
      raise exception 'Only an administrator can change store field "%".', protected_key
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function private.protect_store_subscription_access()
  from public, anon, authenticated;

-- Cover foreign keys used by deletes, joins, and claim lookups.
create index if not exists application_files_application_id_idx
  on public.application_files (application_id);

create index if not exists promotion_claims_card_id_idx
  on public.promotion_claims (card_id);

create index if not exists promotion_claims_redeemed_by_idx
  on public.promotion_claims (redeemed_by);
