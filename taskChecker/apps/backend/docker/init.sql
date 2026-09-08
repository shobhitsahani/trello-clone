-- Bootstrap: the API's restricted app role. The `postgres` bootstrap superuser
-- owns the schema (migrations) and the SECURITY DEFINER lookups; `teamflow`
-- is NOSUPERUSER so Postgres RLS actually applies to every app query.
CREATE ROLE teamflow LOGIN PASSWORD 'teamflow' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT ALL ON SCHEMA public TO teamflow;
GRANT ALL ON DATABASE teamflow TO teamflow;