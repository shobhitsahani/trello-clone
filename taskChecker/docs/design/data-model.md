# TeamFlow — Data Model & Multi-Tenant Design

## Multi-Tenancy Strategy: Shared Database, Row-Level Security

**Chosen approach:** Single PostgreSQL database with `tenant_id` (organization_id) on every table + PostgreSQL Row-Level Security (RLS) policies.

**Why:**
- Scale is small (100 orgs, 5K users) — single writer node is sufficient
- RLS enforces isolation at the database level — impossible to leak data via buggy app code
- Simpler operations: one schema, one migration path, one backup
- Easy to add read replicas later for read scaling

**Alternative considered:** Schema-per-tenant — rejected (migration complexity, connection pooling waste). Database-per-tenant — rejected (operational overhead at this scale).

---

## Core Tables

### organizations
```sql
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(100) NOT NULL UNIQUE,  -- for subdomain/URL
    owner_user_id   UUID NOT NULL,                 -- references users.id
    plan            VARCHAR(20) NOT NULL DEFAULT 'free',  -- free, pro, enterprise
    settings        JSONB NOT NULL DEFAULT '{}',   -- features, limits, branding
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ                    -- soft delete
);

CREATE INDEX idx_orgs_owner ON organizations(owner_user_id);
CREATE INDEX idx_orgs_slug ON organizations(slug);
```

### users
```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255),                  -- null for OAuth-only users
    full_name       VARCHAR(255) NOT NULL,
    avatar_url      VARCHAR(500),
    timezone        VARCHAR(50) DEFAULT 'UTC',
    locale          VARCHAR(10) DEFAULT 'en',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
```

### organization_members (join + RBAC)
```sql
CREATE TYPE org_role AS ENUM ('owner', 'admin', 'member', 'viewer');

CREATE TABLE organization_members (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            org_role NOT NULL DEFAULT 'member',
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    invited_by      UUID REFERENCES users(id),
    PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX idx_org_members_user ON organization_members(user_id);
```

### invitations
```sql
CREATE TABLE invitations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email           VARCHAR(255) NOT NULL,
    role            org_role NOT NULL DEFAULT 'member',
    invited_by      UUID NOT NULL REFERENCES users(id),
    token           VARCHAR(64) NOT NULL UNIQUE,   -- secure random, for accept link
    expires_at      TIMESTAMPTZ NOT NULL,
    accepted_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invitations_org ON invitations(organization_id);
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);
```

### teams
```sql
CREATE TABLE teams (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    is_private      BOOLEAN NOT NULL DEFAULT false,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_teams_org ON teams(organization_id);
CREATE INDEX idx_teams_name ON teams(organization_id, name);
```

### team_members
```sql
CREATE TABLE team_members (
    team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(20) NOT NULL DEFAULT 'member',  -- lead, member
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (team_id, user_id)
);

CREATE INDEX idx_team_members_user ON team_members(user_id);
```

### projects
```sql
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    team_id         UUID REFERENCES teams(id) ON DELETE SET NULL,
    name            VARCHAR(255) NOT NULL,
    key             VARCHAR(10) NOT NULL,               -- e.g., "ENG", "DES" (for task keys like ENG-123)
    description     TEXT,
    icon            VARCHAR(50),                        -- emoji/lucide icon name
    color           VARCHAR(7),                         -- hex color
    is_private      BOOLEAN NOT NULL DEFAULT false,
    settings        JSONB NOT NULL DEFAULT '{}',        -- workflow, default assignee, etc.
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    UNIQUE (organization_id, key)
);

CREATE INDEX idx_projects_org ON projects(organization_id);
CREATE INDEX idx_projects_team ON projects(team_id);
CREATE INDEX idx_projects_key ON projects(organization_id, key);
```

### project_members
```sql
CREATE TABLE project_members (
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(20) NOT NULL DEFAULT 'member',  -- lead, member, viewer
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, user_id)
);

CREATE INDEX idx_project_members_user ON project_members(user_id);
```

### tasks
```sql
CREATE TYPE task_status AS ENUM ('backlog', 'todo', 'in_progress', 'done', 'cancelled');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TABLE tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    number          INTEGER NOT NULL,                   -- per-project sequential (ENG-123)
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    status          task_status NOT NULL DEFAULT 'backlog',
    priority        task_priority NOT NULL DEFAULT 'medium',
    assignee_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    reporter_id     UUID NOT NULL REFERENCES users(id),
    parent_task_id  UUID REFERENCES tasks(id) ON DELETE SET NULL,  -- for subtasks
    story_points    INTEGER,
    due_date        DATE,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    position        INTEGER NOT NULL DEFAULT 0,         -- for board ordering
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    UNIQUE (project_id, number)
);

CREATE INDEX idx_tasks_org ON tasks(organization_id);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_status ON tasks(project_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_parent ON tasks(parent_task_id);
-- Composite for board queries
CREATE INDEX idx_tasks_board ON tasks(project_id, status, position) WHERE deleted_at IS NULL;
```

### task_labels (many-to-many)
```sql
CREATE TABLE labels (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            VARCHAR(50) NOT NULL,
    color           VARCHAR(7) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, name)
);

CREATE TABLE task_labels (
    task_id         UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    label_id        UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, label_id)
);
```

### comments
```sql
CREATE TABLE comments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    task_id         UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id       UUID REFERENCES comments(id) ON DELETE CASCADE,  -- threading
    content         TEXT NOT NULL,
    edited_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_comments_task ON comments(task_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_comments_user ON comments(user_id);
CREATE INDEX idx_comments_parent ON comments(parent_id);
```

### attachments
```sql
CREATE TABLE attachments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    task_id         UUID REFERENCES tasks(id) ON DELETE CASCADE,
    comment_id      UUID REFERENCES comments(id) ON DELETE CASCADE,
    uploaded_by     UUID NOT NULL REFERENCES users(id),
    filename        VARCHAR(255) NOT NULL,
    content_type    VARCHAR(100) NOT NULL,
    size_bytes      BIGINT NOT NULL,
    storage_key     VARCHAR(500) NOT NULL,              -- S3/GCS key
    checksum        VARCHAR(64),                        -- SHA-256
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    CHECK (task_id IS NOT NULL OR comment_id IS NOT NULL)
);

CREATE INDEX idx_attachments_task ON attachments(task_id);
CREATE INDEX idx_attachments_comment ON attachments(comment_id);
```

### activity_events (append-only, immutable)
```sql
CREATE TYPE activity_action AS ENUM (
    'created', 'updated', 'deleted', 'restored',
    'assigned', 'unassigned', 'status_changed', 'priority_changed',
    'commented', 'mentioned', 'labeled', 'unlabeled',
    'member_added', 'member_removed', 'role_changed',
    'invited', 'invitation_accepted', 'invitation_revoked'
);

CREATE TABLE activity_events (
    id              BIGSERIAL PRIMARY KEY,              -- sequential for cursor pagination
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
    task_id         UUID REFERENCES tasks(id) ON DELETE SET NULL,
    user_id         UUID NOT NULL REFERENCES users(id),
    action          activity_action NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}',        -- diff, old/new values, etc.
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partition by organization_id + time for retention/performance
CREATE INDEX idx_activity_org_time ON activity_events(organization_id, created_at DESC);
CREATE INDEX idx_activity_task ON activity_events(task_id, created_at DESC);
CREATE INDEX idx_activity_user ON activity_events(user_id, created_at DESC);
```

### notifications
```sql
CREATE TYPE notification_type AS ENUM (
    'assigned', 'mentioned', 'commented', 'status_changed',
    'invitation', 'invitation_accepted', 'task_due_soon', 'task_overdue'
);

CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            notification_type NOT NULL,
    title           VARCHAR(255) NOT NULL,
    message         TEXT,
    reference_type  VARCHAR(20),                        -- task, project, comment, invitation
    reference_id    UUID,
    is_read         BOOLEAN NOT NULL DEFAULT false,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC) WHERE is_read = false;
CREATE INDEX idx_notifications_user_all ON notifications(user_id, created_at DESC);
```

### webhooks
```sql
CREATE TABLE webhooks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    url             VARCHAR(500) NOT NULL,
    secret          VARCHAR(64) NOT NULL,               -- HMAC secret for verification
    events          TEXT[] NOT NULL,                    -- array of event types to subscribe
    is_active       BOOLEAN NOT NULL DEFAULT true,
    failure_count   INTEGER NOT NULL DEFAULT 0,
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhooks_org ON webhooks(organization_id);
```

### webhook_deliveries (for retry/debugging)
```sql
CREATE TABLE webhook_deliveries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id      UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type      VARCHAR(50) NOT NULL,
    payload         JSONB NOT NULL,
    response_status INTEGER,
    response_body   TEXT,
    attempt         INTEGER NOT NULL DEFAULT 1,
    next_retry_at   TIMESTAMPTZ,
    succeeded_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_deliveries_pending ON webhook_deliveries(next_retry_at) WHERE succeeded_at IS NULL;
```

### api_keys
```sql
CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    key_hash        VARCHAR(64) NOT NULL,               -- SHA-256 of the key (prefix stored separately)
    key_prefix      VARCHAR(12) NOT NULL,               -- first 12 chars for identification
    scopes          TEXT[] NOT NULL,                    -- e.g., ['read:tasks', 'write:projects']
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
```

### audit_logs (immutable, append-only)
```sql
CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,  -- null for system actions
    ip_address      INET,
    user_agent      TEXT,
    action          VARCHAR(100) NOT NULL,                -- e.g., 'org.settings.changed', 'user.deleted'
    resource_type   VARCHAR(50),                          -- organization, user, project, etc.
    resource_id     UUID,
    old_values      JSONB,
    new_values      JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_org_time ON audit_logs(organization_id, created_at DESC);
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
```

### subscription_usage (for limit enforcement)
```sql
CREATE TABLE subscription_usage (
    organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    users_count     INTEGER NOT NULL DEFAULT 0,
    projects_count  INTEGER NOT NULL DEFAULT 0,
    storage_bytes   BIGINT NOT NULL DEFAULT 0,
    api_calls_month BIGINT NOT NULL DEFAULT 0,
    period_start    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Row-Level Security (RLS) Policies

Enable RLS on all tenant-scoped tables:

```sql
-- Enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
-- ... all other tables ...

-- Policy: users can only see orgs they're members of
CREATE POLICY org_isolation ON organizations
    USING (id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id')::UUID
    ));

-- Policy: users can only see members of their orgs
CREATE POLICY org_members_isolation ON organization_members
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id')::UUID
    ));

-- Policy: users can only see teams in their orgs
CREATE POLICY teams_isolation ON teams
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id')::UUID
    ));

-- ... similar for all tables ...
```

**Application sets `app.current_user_id`** at request start (via middleware). RLS ensures even `SELECT * FROM tasks` cannot leak cross-org data.

---

## Cursor Pagination Keys

| Entity | Sort Order | Cursor Encodes |
|--------|------------|----------------|
| Tasks (board) | `(status, position, id)` | `(status, position, id)` |
| Tasks (list) | `(created_at DESC, id DESC)` | `(created_at, id)` |
| Comments | `(created_at DESC, id DESC)` | `(created_at, id)` |
| Activity | `(created_at DESC, id DESC)` | `(created_at, id)` |
| Notifications | `(created_at DESC, id DESC)` | `(created_at, id)` |

Cursor = base64url(JSON) of sort key values. Opaque to clients.

---

## Indexing Strategy Summary

| Table | Primary Access Patterns | Indexes |
|-------|------------------------|---------|
| tasks | By project + status (board), by assignee, by project + created_at | `idx_tasks_board`, `idx_tasks_assignee`, `idx_tasks_project` |
| comments | By task + time | `idx_comments_task` |
| activity_events | By org + time, by task + time | `idx_activity_org_time`, `idx_activity_task` |
| notifications | By user + unread, by user + time | `idx_notifications_user_unread`, `idx_notifications_user_all` |
| webhook_deliveries | By next_retry_at (pending) | `idx_webhook_deliveries_pending` |

---

## Soft Delete Pattern

All entities have `deleted_at TIMESTAMPTZ`. Application queries **always** include `WHERE deleted_at IS NULL` (enforced by RLS policy or query builder). Restore = `UPDATE ... SET deleted_at = NULL`. Purge job runs daily for entities deleted > 90 days (configurable per plan).

---

## Full-Text Search

**PostgreSQL built-in `tsvector` + GIN index** (no external Elasticsearch needed at this scale).

```sql
ALTER TABLE tasks ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED;

CREATE INDEX idx_tasks_fts ON tasks USING GIN(search_vector);
-- Similar for comments, projects
```

Query: `WHERE search_vector @@ plainto_tsquery('english', $1)` with `organization_id` filter.

---

## Capacity Check (from BOTEC)

| Metric | Value | Fits in Single Node? |
|--------|-------|---------------------|
| Peak QPS | ~1.2 | ✅ (1k QPS capacity) |
| Storage (7 yr) | ~80 GB | ✅ (fits in RAM + SSD) |
| Connections | ~2,500 DAU × 2 = 5K | ✅ (PgBouncer pools to 100) |
| Working set | Hot orgs + recent activity | ✅ (< 10 GB) |

**No sharding needed.** Read replicas can be added if read QPS grows.