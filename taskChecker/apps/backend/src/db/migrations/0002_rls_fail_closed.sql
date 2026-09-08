-- 0002_rls_fail_closed.sql — harden tenant_isolation policy against the empty GUC.
--
-- Postgres quirk: `set_config('app.tenant_id', x, true)` (SET LOCAL) inside a
-- committed transaction reverts `app.tenant_id` to the EMPTY STRING on pooled
-- sessions, not to NULL/unset. `current_setting('app.tenant_id', true)` then
-- returns '' and `''::uuid` throws 22P02 (invalid input syntax) on every later
-- query reusing that connection — turning RLS's fail-closed design into a
-- request-breaking error after the first tenant-scoped transaction.
--
-- Fix: normalize the empty GUC to NULL with nullif() before the cast. NULL
-- comparisons are false, so the policy still denies everything when no tenant
-- context exists — fail closed, with zero rows instead of an error.

DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'memberships','teams','projects','tasks','comments','attachments','activity',
    'notifications','invites','webhooks','deliveries','api_keys','usage_meter',
    'audit_logs','idempotency'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (
         tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid
       ) WITH CHECK (
         tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid
       )',
      tbl
    );
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;