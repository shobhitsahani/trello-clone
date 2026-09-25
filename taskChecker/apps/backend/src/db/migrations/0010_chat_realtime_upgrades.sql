-- 0010_chat_realtime_upgrades.sql — images, reactions, sender local-time.
--
-- Extends the tenant-scoped team chat (0004) without breaking existing rows:
--   chat_messages += attachments JSONB, mentions JSONB, client_tz TEXT,
--                    client_local_time TEXT
--   chat_reactions = per-message emoji reactions (one row per user+emoji).
-- RLS mirrors 0004's fail-closed shape. All statements idempotent-guarded so
-- re-runs are safe.

-- 1) New columns on chat_messages (guarded).
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS mentions JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS client_tz TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS client_local_time TEXT;

-- 2) Reactions table.
CREATE TABLE IF NOT EXISTS chat_reactions (
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id         UUID NOT NULL,
  message_id UUID NOT NULL,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL CHECK (char_length(emoji) <= 16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, message_id, user_id, emoji),
  FOREIGN KEY (tenant_id, message_id) REFERENCES chat_messages(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS chat_reactions_message_idx ON chat_reactions (tenant_id, message_id, created_at DESC);

ALTER TABLE chat_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON chat_reactions;
CREATE POLICY tenant_isolation ON chat_reactions USING (
  tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
) WITH CHECK (
  tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
);
ALTER TABLE chat_reactions FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON chat_reactions TO teamflow;
