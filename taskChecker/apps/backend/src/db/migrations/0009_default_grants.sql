-- 0009_default_grants.sql — future-proof runtime privileges.
--
-- 0001's `GRANT ... ON ALL TABLES` only covered tables existing at bootstrap,
-- which is why project_list_labels (0007) denied the app role until 0008
-- granted it explicitly. Default privileges make every future
-- migration-created table usable by the app role immediately.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO teamflow;
