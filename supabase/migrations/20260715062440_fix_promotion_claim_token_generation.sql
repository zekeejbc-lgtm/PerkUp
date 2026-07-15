-- pgcrypto is installed in the extensions schema on hosted Supabase. The
-- function's restricted search path previously made gen_random_bytes invisible.
alter function public.claim_promotion_reward(uuid, text)
  set search_path = public, extensions, pg_temp;
