create or replace function public.refresh_billing_access_states(p_now timestamptz default now())
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed_count integer := 0;
begin
  with states as (
    select
      s.*,
      case
        when p_now >= s.current_period_end + make_interval(days => s.grace_period_days) then 'frozen'
        when p_now >= s.current_period_end then 'grace'
        when p_now >= s.current_period_end - make_interval(days => s.warning_lead_days) then 'warning'
        else 'active'
      end as access_status,
      invoice.payment_url as latest_payment_url
    from public.billing_subscriptions s
    left join lateral (
      select i.payment_url
      from public.billing_invoices i
      where i.subscription_id = s.id
        and i.status in ('link_created', 'failed')
        and nullif(i.payment_url, '') is not null
      order by i.due_at desc, i.created_at desc
      limit 1
    ) invoice on true
    where s.automation_enabled and s.status not in ('paused', 'cancelled')
  ), updated_subscriptions as (
    update public.billing_subscriptions s
    set status = case
      when st.access_status = 'frozen' then 'frozen'
      when st.access_status = 'grace' then 'past_due'
      else 'active'
    end
    from states st
    where s.id = st.id
      and s.status is distinct from case
        when st.access_status = 'frozen' then 'frozen'
        when st.access_status = 'grace' then 'past_due'
        else 'active'
      end
    returning s.id
  ), updated_stores as (
    update public.stores store
    set data = jsonb_set(
      coalesce(store.data, '{}'::jsonb),
      '{subscriptionAccess}',
      coalesce(store.data->'subscriptionAccess', '{}'::jsonb) || jsonb_build_object(
        'status', st.access_status,
        'gracePeriodDays', st.grace_period_days,
        'graceStartedAt', case
          when st.access_status in ('grace', 'frozen') then st.current_period_end::text
          else ''
        end,
        'graceEndsAt', case
          when st.access_status in ('grace', 'frozen')
            then (st.current_period_end + make_interval(days => st.grace_period_days))::text
          else ''
        end,
        'paymentLink', case
          when st.access_status in ('warning', 'grace', 'frozen')
            and nullif(st.latest_payment_url, '') is not null
          then st.latest_payment_url
          else coalesce(store.data->'subscriptionAccess'->>'paymentLink', '')
        end,
        'updatedAt', p_now::text,
        'updatedBy', 'subscription-billing-worker'
      ),
      true
    )
    from states st
    where store.id = st.store_id
      and (
        coalesce(store.data->'subscriptionAccess'->>'status', '') is distinct from st.access_status
        or (
          st.access_status in ('warning', 'grace', 'frozen')
          and nullif(st.latest_payment_url, '') is not null
          and coalesce(store.data->'subscriptionAccess'->>'paymentLink', '') is distinct from st.latest_payment_url
        )
      )
    returning store.id
  )
  select count(*) into changed_count from updated_stores;
  return changed_count;
end;
$$;

revoke all on function public.refresh_billing_access_states(timestamptz)
  from public, anon, authenticated;
grant execute on function public.refresh_billing_access_states(timestamptz)
  to service_role;
