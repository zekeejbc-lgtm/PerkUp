-- Public-ID assignment is an internal trigger operation. Run the trigger
-- function as its postgres owner so callers do not need access to the private
-- schema or to generate_public_id().
alter function private.assign_public_id() security definer;

-- Keep name resolution locked down for the privileged trigger function.
alter function private.assign_public_id() set search_path = '';
