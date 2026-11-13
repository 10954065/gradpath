-- Explicit Data API privileges.
--
-- Earlier migrations relied on Supabase's default privileges for the public schema. Newer hosted projects can be
-- created with "automatically expose new tables" turned off, in which case those defaults are absent and every
-- browser request fails with "permission denied". These grants restate the standard Supabase defaults explicitly
-- so the schema behaves the same on every project. They do not widen access: Row Level Security is enabled on
-- every table and remains the control that decides which rows anon/authenticated users can see or change.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- Keep the same behaviour for objects added by future migrations.
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated, service_role;
