-- ============================================================================
-- 0001_init.sql — TeamFlow schema + multi-tenant RLS (defense in depth).
--
-- Tenancy model (docs/design/teamflow.md §5):
--   * tenant-scoped tables are keyed (tenant_id, id); FKs include tenant_id so a
--     task can never reference another tenant's project, *by constraint*.
--   * ROW LEVEL SECURITY is enabled on every tenant table. The app sets
--     `app.tenant_id` (SET LOCAL, request-scoped) before running queries; a
--     query missing a tenant filter is an ERROR — no rows -> no leak.
--   * The connection role must be NON-superuser (superusers bypass RLS).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- App runtime role: NON-superuser so PostgreSQL RLS is actually enforced
-- (superusers bypass row-level security). Provisioning/migrations run as the
-- bootstrap superuser (DATABASE_MIGRATE_URL). docker/init.sql also creates the
-- role at container init; this block is idempotent so a non-Docker deploy works
-- from migrations alone.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'teamflow') THEN
    CREATE ROLE teamflow LOGIN PASSWORD 'teamflow' NOSUPERUSER;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------
CREATE TYPE teamflow_plan     AS ENUM ('free', 'pro', 'business');
CREATE TYPE membership_role   AS ENUM ('owner', 'admin', 'member', 'viewer');
CREATE TYPE membership_status AS ENUM ('invited', 'active', 'deactivated');
CREATE TYPE task_status       AS ENUM ('backlog', 'todo', 'in_progress', 'in_review', 'done');
CREATE TYPE task_priority     AS ENUM ('critical', 'high', 'medium', 'low', 'none');

-- ---------------------------------------------------------------------------
-- global (not tenant-scoped) tables
-- ---------------------------------------------------------------------------
CREATE TABLE tenants (
  id         UUID PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  plan       teamflow_plan NOT NULL DEFAULT 'free',
  status     TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            UUID PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id         UUID PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- tenant-scoped tables — composite PK (tenant_id, id), FKs carry tenant_id
-- ---------------------------------------------------------------------------
CREATE TABLE memberships (
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        membership_role NOT NULL,
  status      membership_status NOT NULL DEFAULT 'active',
  invited_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX memberships_user_idx ON memberships (user_id);

CREATE TABLE teams (
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id         UUID NOT NULL,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE projects (
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id         UUID NOT NULL,
  team_id    UUID,
  name       TEXT NOT NULL,
  key        TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, key)
);

CREATE TABLE tasks (
  tenant_id    UUID NOT NULL,
  id           UUID NOT NULL,
  project_id   UUID NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  status       task_status NOT NULL DEFAULT 'backlog',
  priority     task_priority NOT NULL DEFAULT 'none',
  assignee_id  UUID,
  reporter_id  UUID,
  due_at       TIMESTAMPTZ,
  search_vector tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, id),
  -- same-tenant FK by construction: a task can only reference a project in ITS tenant
  FOREIGN KEY (tenant_id, project_id) REFERENCES projects (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX tasks_project_status_idx ON tasks (tenant_id, project_id, status, created_at DESC);
CREATE INDEX tasks_assignee_status_idx ON tasks (tenant_id, assignee_id, status);
CREATE INDEX tasks_updated_idx ON tasks (tenant_id, updated_at DESC);
CREATE INDEX tasks_search_idx ON tasks USING GIN (search_vector);

CREATE TABLE comments (
  tenant_id    UUID NOT NULL,
  id           UUID NOT NULL,
  task_id      UUID NOT NULL,
  author_id    UUID NOT NULL,
  body         TEXT NOT NULL,
  search_vector tsvector
    GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(body, '')), 'A')) STORED,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, task_id) REFERENCES tasks (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX comments_task_idx ON comments (tenant_id, task_id, created_at);
CREATE INDEX comments_search_idx ON comments USING GIN (search_vector);

CREATE TABLE attachments (
  tenant_id    UUID NOT NULL,
  id           UUID NOT NULL,
  task_id      UUID,
  uploader_id  UUID NOT NULL,
  file_name    TEXT NOT NULL,
  object_key   TEXT NOT NULL,
  size         INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  sha256       TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, task_id) REFERENCES tasks (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX attachments_task_idx ON attachments (tenant_id, task_id);

CREATE TABLE activity (
  tenant_id   UUID NOT NULL,
  id          UUID NOT NULL,
  actor_id    UUID,
  entity_type TEXT NOT NULL,
  entity_id   UUID NOT NULL,
  action      TEXT NOT NULL,
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX activity_entity_idx ON activity (tenant_id, entity_type, entity_id, created_at DESC);

CREATE TABLE notifications (
  tenant_id  UUID NOT NULL,
  id         UUID NOT NULL,
  user_id    UUID NOT NULL,
  type       TEXT NOT NULL,
  payload    JSONB NOT NULL,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX notifications_user_idx ON notifications (tenant_id, user_id, read_at, created_at DESC);

CREATE TABLE invites (
  tenant_id    UUID NOT NULL,
  id           UUID NOT NULL,
  email        TEXT NOT NULL,
  role         membership_role NOT NULL DEFAULT 'member',
  token_hash   TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  accepted_at  TIMESTAMPTZ,
  invited_by_id UUID NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, email),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE webhooks (
  tenant_id   UUID NOT NULL,
  id          UUID NOT NULL,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  events      TEXT[] NOT NULL DEFAULT '{}'::text[],
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE deliveries (
  tenant_id       UUID NOT NULL,
  id              UUID NOT NULL,
  endpoint_id     UUID NOT NULL,
  event           TEXT NOT NULL,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, endpoint_id) REFERENCES webhooks (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX deliveries_endpoint_idx ON deliveries (tenant_id, endpoint_id, status);

CREATE TABLE api_keys (
  tenant_id   UUID NOT NULL,
  id          UUID NOT NULL,
  name        TEXT NOT NULL,
  key_hash    TEXT NOT NULL,
  key_prefix  TEXT NOT NULL,
  scopes      TEXT[] NOT NULL DEFAULT '{}'::text[],
  revoked_at  TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE usage_meter (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric    TEXT NOT NULL,
  ts        TIMESTAMPTZ NOT NULL,
  value     INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX usage_tenant_metric_ts_idx ON usage_meter (tenant_id, metric, ts);

CREATE TABLE audit_logs (
  tenant_id   UUID NOT NULL,
  id          UUID NOT NULL,
  actor_id    UUID NOT NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   UUID,
  before      JSONB,
  after       JSONB,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX audit_tenant_ts_idx ON audit_logs (tenant_id, created_at DESC);

CREATE TABLE idempotency (
  tenant_id  UUID NOT NULL,
  key        TEXT NOT NULL,
  response   JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY — the isolation backstop. A mutation that forgets its
-- tenant filter CHECK-fails; a read that forgets it returns nothing outside the
-- current tenant. current_setting returns NULL when unset, and NULL comparisons
-- are false, so the policy defaults to "deny everything" — fail closed.
-- ---------------------------------------------------------------------------
ALTER TABLE memberships  ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams         ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites       ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys      ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_meter   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency   ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'memberships','teams','projects','tasks','comments','attachments','activity',
    'notifications','invites','webhooks','deliveries','api_keys','usage_meter',
    'audit_logs','idempotency'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (
         tenant_id = (current_setting(''app.tenant_id'', true)::uuid)
       ) WITH CHECK (
         tenant_id = (current_setting(''app.tenant_id'', true)::uuid)
       )',
      tbl
    );
    -- Tables are owned by the migration superuser here, so RLS already applies
    -- to the non-superuser app role. FORCE keeps it that way even if someone
    -- re-runs migrations as a table-owning role: owners bypass RLS by default
    -- unless FORCEd. Only a true superuser can bypass FORCE — the app must
    -- never connect as one.
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

-- Application runtime role (NON-superuser): required table privileges for the
-- app itself. Tables are owned by the bootstrap superuser, so teamflow is fully
-- RLS-subjected — every query is filtered by app.tenant_id.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO teamflow;

-- ---------------------------------------------------------------------------
-- CONTROLLED RLS ESCAPE HATCHES (SECURITY DEFINER).
--
-- Three lookups must run BEFORE a tenant context exists: resolving an invite
-- by token, an API key to its tenant, and a user's memberships at login / org
-- picker. Bypassing RLS is required there — but only through these two functions,
-- with a locked search_path, no table privileges beyond EXECUTE, and every
-- result carrying tenant_id so the caller still picks the tenant.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION lookup_invite_by_token(p_token_hash text)
RETURNS TABLE (tenant_id uuid, id uuid, email text, role membership_role, expires_at timestamptz, accepted_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT tenant_id, id, email, role, expires_at, accepted_at
  FROM invites
  WHERE invites.token_hash = lookup_invite_by_token.p_token_hash
$$;

CREATE OR REPLACE FUNCTION lookup_api_key(p_key_hash text)
RETURNS TABLE (tenant_id uuid, id uuid, name text, scopes text[], revoked_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT tenant_id, id, name, scopes, revoked_at
  FROM api_keys
  WHERE api_keys.key_hash = lookup_api_key.p_key_hash
$$;

CREATE OR REPLACE FUNCTION memberships_for_user(p_user_id uuid)
RETURNS TABLE (tenant_id uuid, tenant_name text, tenant_slug text, plan teamflow_plan, role membership_role, status membership_status)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.tenant_id, t.name::text, t.slug::text, t.plan, m.role, m.status
  FROM memberships m
  JOIN tenants t ON t.id = m.tenant_id
  WHERE m.user_id = memberships_for_user.p_user_id
$$;

REVOKE ALL ON FUNCTION lookup_invite_by_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION lookup_api_key(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION memberships_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lookup_invite_by_token(text) TO teamflow;
GRANT EXECUTE ON FUNCTION lookup_api_key(text) TO teamflow;
GRANT EXECUTE ON FUNCTION memberships_for_user(uuid) TO teamflow;