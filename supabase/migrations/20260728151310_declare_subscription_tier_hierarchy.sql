-- Make subscription tier hierarchy explicit without touching billing or
-- PayMongo records. Existing catalogs are ranked by price, with their
-- previous position used only as a stable tie-breaker.
with expanded_plans as (
  select
    settings.id as settings_id,
    plan.value as plan,
    plan.ordinality as original_ordinality,
    case
      when coalesce(plan.value->>'price', '') ~ '^[0-9]+([.][0-9]+)?$'
        then (plan.value->>'price')::numeric
      else null
    end as numeric_price
  from public.settings settings
  cross join lateral jsonb_array_elements(
    coalesce(settings.data->'plans', '[]'::jsonb)
  ) with ordinality as plan(value, ordinality)
  where settings.id = 'subscriptions'
),
ranked_plans as (
  select
    settings_id,
    plan || jsonb_build_object(
      'tierRank',
      (
        row_number() over (
          partition by settings_id
          order by numeric_price nulls last, original_ordinality
        ) - 1
      ) * 10
    ) as ranked_plan,
    row_number() over (
      partition by settings_id
      order by numeric_price nulls last, original_ordinality
    ) as tier_position
  from expanded_plans
),
ranked_catalogs as (
  select
    settings_id,
    jsonb_agg(ranked_plan order by tier_position) as plans
  from ranked_plans
  group by settings_id
)
update public.settings settings
set
  data = jsonb_set(settings.data, '{plans}', ranked_catalogs.plans, true),
  updated_at = now()
from ranked_catalogs
where settings.id = ranked_catalogs.settings_id;
