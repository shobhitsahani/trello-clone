-- 0005_perf_indexes.sql — snappiness: cover hot auth lookups + stable
-- (created_at, id) keyset pagination so pages never skip/duplicate rows.
--
-- All CONCURRENTLY-incompatible in a txn runner? Plain CREATE INDEX IF NOT
-- EXISTS keeps the migration runner simple; tables are small at this stage.

-- Auth hot paths (every login/refresh/API-key/invite request scanned).
CREATE INDEX IF NOT EXISTS refresh_tokens_hash_idx ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS api_keys_hash_idx ON api_keys (key_hash);
CREATE INDEX IF NOT EXISTS invites_hash_idx ON invites (token_hash);

-- Stable newest-first keyset pages: (created_at DESC, id DESC).
CREATE INDEX IF NOT EXISTS tasks_tenant_created_id_idx ON tasks (tenant_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS chat_messages_tenant_created_id_idx ON chat_messages (tenant_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS comments_tenant_task_created_id_idx ON comments (tenant_id, task_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS activity_tenant_created_id_idx ON activity (tenant_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS notifications_user_created_id_idx ON notifications (tenant_id, user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS audit_tenant_created_id_idx ON audit_logs (tenant_id, created_at DESC, id DESC);

-- Tenant list screens (teams/projects/webhooks/api_keys order by created_at).
CREATE INDEX IF NOT EXISTS teams_tenant_created_idx ON teams (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS projects_tenant_created_idx ON projects (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS webhooks_tenant_created_idx ON webhooks (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS api_keys_tenant_created_idx ON api_keys (tenant_id, created_at DESC);
