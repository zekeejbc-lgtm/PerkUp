-- RLS does not protect TRUNCATE, and client roles do not need schema-management
-- privileges. Keep only the per-table DML grants declared by prior migrations.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- Require future tables to opt in to the Data API with explicit grants.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
