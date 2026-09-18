-- 0008_project_list_labels_grants.sql — 0007 created the table + RLS policy
-- but never granted privileges to the app role (see 0004_chat_messages.sql
-- for the established pattern), so every read/write failed with
-- "permission denied for table project_list_labels" (HTTP 500 on
-- GET/PUT /v1/projects/:id/lists). GRANTs apply immediately; no restart needed.

GRANT SELECT, INSERT, UPDATE, DELETE ON project_list_labels TO teamflow;
