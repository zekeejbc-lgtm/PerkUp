-- The four-argument function accepts p_stamp_receipt_id default null, so the
-- legacy three-argument overload makes three-field PostgREST RPC calls
-- ambiguous (PostgreSQL 42725).
drop function if exists public.increment_loyalty_totals(text, text, integer);
