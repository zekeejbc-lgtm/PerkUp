-- The promotion-claims Edge Function expires and lists claims with its
-- service-role client. RLS bypass does not replace table-level privileges.
grant select, update on table public.promotion_claims to service_role;
