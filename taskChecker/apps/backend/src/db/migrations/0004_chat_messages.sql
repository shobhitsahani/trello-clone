-- 0004_chat_messages.sql — tenant-scoped team chat.
--
-- One message stream per tenant (the ChatRail). Rows are soft-deletable;
-- scoped reads exclude deleted rows. RLS mirrors 0002's fail-closed shape
-- (nullif-hardened GUC): no tenant context ⇒ zero rows, writes rejected.

CREATE TABLE chat_messages (
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id         UUID NOT NULL,
  author_id  UUID NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX chat_messages_tenant_created_idx ON chat_messages (tenant_id, created_at DESC);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chat_messages USING (
  tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
) WITH CHECK (
  tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
);
ALTER TABLE chat_messages FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON chat_messages TO teamflow;
