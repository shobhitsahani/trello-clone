# TeamFlow — API Design

## Protocol & Style

- **Primary:** REST over HTTP/JSON (public + internal)
- **Real-time:** WebSocket for notifications, activity feed, presence
- **Async callbacks:** Webhooks (outgoing HTTP POST with HMAC verification)

**Why REST:** Universal, cacheable, browser-native, simple tooling. gRPC/GraphQL not justified at this scale — no internal service mesh, no complex field-shaping needs.

---

## Base Conventions

| Convention | Value |
|------------|-------|
| Base path | `/v1` (version in URI) |
| Auth | `Authorization: Bearer <jwt>` or `X-API-Key: tf_<prefix>_<secret>` |
| Tenant resolution | Via JWT `org_id` claim or API key org lookup |
| Idempotency | `Idempotency-Key: <uuid>` required on all POST/PATCH that mutate |
| Pagination | Cursor-based (default 20, max 100) |
| Time format | RFC3339 (ISO 8601) UTC |
| IDs | UUID v7 (time-sortable) for all entities |
| Errors | Single envelope (see below) |

---

## Error Envelope (Stable Across All Endpoints)

```json
{
  "error": {
    "code": "string",           // machine-readable, stable: "not_found", "rate_limited", "validation_failed", "unauthorized", "forbidden", "conflict", "idempotency_conflict", "internal_error"
    "message": "string",        // human-readable
    "request_id": "string",     // correlation ID for support/debugging
    "retryable": "boolean",     // true for 5xx, 429; false for 4xx (except 429)
    "details": {}               // optional: field errors, conflict info
  }
}
```

**HTTP Status Mapping:**
- 200 OK, 201 Created, 204 No Content
- 400 Bad Request (malformed)
- 401 Unauthorized (missing/invalid auth)
- 403 Forbidden (auth valid, insufficient permission)
- 404 Not Found
- 409 Conflict (resource state conflict, e.g., duplicate slug)
- 422 Unprocessable Entity (validation failed)
- 429 Too Many Requests (rate limited) + `Retry-After` header
- 500 Internal Error
- 503 Service Unavailable (maintenance)

---

## Idempotency Key Contract

**Required on:** All `POST` (creates) and `PATCH` (mutations) that are not naturally idempotent.
**Not required on:** `GET`, `PUT` (full replace), `DELETE` (naturally idempotent).

```
POST /v1/tasks
Idempotency-Key: 9f1c3e2a-7b4d-4a1e-9c2f-8e7d6a5b4c3f
{ "title": "Fix login bug", "project_id": "..." }
```

**Server behavior:**
1. On first request with key → execute, store `(key, org_id, endpoint) → response` with TTL 24h
2. Retry with same key + same body → return stored response (200/201), **do not re-execute**
3. Retry with same key + different body → `422 idempotency_conflict`
4. Key scopes to `(organization_id, endpoint)` — different orgs can reuse keys

---

## Pagination Contract

**Request:**
```
GET /v1/tasks?project_id=...&limit=20&cursor=eyJjcmVhdGVkX2F0IjoiMjAyNC0wMS0xNVQxMDozMDowMFoiLCJpZCI6Ij... 
```

**Response:**
```json
{
  "data": [ { ... }, { ... } ],
  "next_cursor": "eyJ...",      // null if no more pages
  "has_more": true
}
```

**Cursor encoding:** base64url(JSON) of sort key values. Opaque — clients must not parse.

**Default limit:** 20. **Max limit:** 100 (enforced by server).

---

## Versioning Policy

- **Additive changes only** in v1: new optional fields, new endpoints, new enum values
- **Breaking changes** → `/v2/` (new major version in URI)
- Deprecation: `Deprecation: true`, `Sunset: <date>` headers + per-version traffic metrics
- Clients ignore unknown fields (tolerant readers)

---

## Core REST Endpoints

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/auth/register` | Register new user + create first org |
| POST | `/v1/auth/login` | Email/password → JWT pair |
| POST | `/v1/auth/refresh` | Refresh token → new access token |
| POST | `/v1/auth/logout` | Revoke refresh token |
| POST | `/v1/auth/forgot-password` | Send reset email |
| POST | `/v1/auth/reset-password` | Reset with token |
| GET | `/v1/auth/me` | Current user + org memberships |
| POST | `/v1/auth/oauth/{provider}` | OAuth callback (GitHub, Google, GitLab) |

**Register request:**
```json
{ "email": "user@example.com", "password": "...", "full_name": "John Doe", "org_name": "Acme Inc" }
```

**Login response:**
```json
{
  "access_token": "eyJ...",      // JWT, 15 min expiry
  "refresh_token": "eyJ...",     // opaque, 30 day expiry, rotatable
  "user": { "id": "...", "email": "...", "full_name": "...", "organizations": [{ "id": "...", "name": "...", "role": "owner" }] }
}
```

**JWT Claims:**
```json
{ "sub": "user_id", "org_id": "current_org_id", "role": "admin", "permissions": ["read:tasks", "write:projects"], "exp": 1234567890 }
```

---

### Organizations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/organizations` | List user's orgs (cursor) |
| POST | `/v1/organizations` | Create org (owner becomes current user) |
| GET | `/v1/organizations/{id}` | Get org details |
| PATCH | `/v1/organizations/{id}` | Update org (name, settings) |
| DELETE | `/v1/organizations/{id}` | Soft delete (owner only) |
| POST | `/v1/organizations/{id}/restore` | Restore soft-deleted |
| GET | `/v1/organizations/{id}/usage` | Current usage vs limits |
| GET | `/v1/organizations/{id}/audit-logs` | Audit logs (cursor, filter) |

**Create org request:**
```json
{ "name": "Acme Inc", "slug": "acme-inc" }
```

**Org response:**
```json
{
  "id": "org_...",
  "name": "Acme Inc",
  "slug": "acme-inc",
  "plan": "pro",
  "settings": { "allow_public_projects": true, "default_task_status": "backlog" },
  "created_at": "2024-01-15T10:30:00Z",
  "owner": { "id": "user_...", "email": "...", "full_name": "..." }
}
```

---

### Invitations

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/organizations/{org_id}/invitations` | Invite user (Idempotency-Key) |
| GET | `/v1/organizations/{org_id}/invitations` | List pending invitations |
| DELETE | `/v1/organizations/{org_id}/invitations/{id}` | Revoke invitation |
| POST | `/v1/invitations/accept` | Accept invitation (token in body) |

**Invite request:**
```json
{ "email": "new@user.com", "role": "member" }
```

**Accept request:**
```json
{ "token": "inv_abc123", "password": "..." }  // password if new user
```

---

### Members & RBAC

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/organizations/{org_id}/members` | List members (cursor, filter by role) |
| PATCH | `/v1/organizations/{org_id}/members/{user_id}` | Change role |
| DELETE | `/v1/organizations/{org_id}/members/{user_id}` | Remove member |
| GET | `/v1/organizations/{org_id}/roles` | List available roles + permissions |

**Role change request:**
```json
{ "role": "admin" }
```

**Permission matrix (simplified):**

| Permission | Owner | Admin | Member | Viewer |
|------------|-------|-------|--------|--------|
| Manage org settings | ✅ | ✅ | ❌ | ❌ |
| Invite/remove members | ✅ | ✅ | ❌ | ❌ |
| Manage teams | ✅ | ✅ | ❌ | ❌ |
| Create projects | ✅ | ✅ | ✅ | ❌ |
| Edit any task | ✅ | ✅ | own only | ❌ |
| View all projects | ✅ | ✅ | ✅ | ✅ |
| Manage webhooks/API keys | ✅ | ✅ | ❌ | ❌ |

---

### Teams

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/organizations/{org_id}/teams` | List teams |
| POST | `/v1/organizations/{org_id}/teams` | Create team (Idempotency-Key) |
| GET | `/v1/teams/{id}` | Get team |
| PATCH | `/v1/teams/{id}` | Update team |
| DELETE | `/v1/teams/{id}` | Soft delete |
| GET | `/v1/teams/{id}/members` | List team members |
| POST | `/v1/teams/{id}/members` | Add member |
| DELETE | `/v1/teams/{id}/members/{user_id}` | Remove member |

---

### Projects

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/organizations/{org_id}/projects` | List projects (filter: team_id, is_private) |
| POST | `/v1/organizations/{org_id}/projects` | Create project (Idempotency-Key) |
| GET | `/v1/projects/{id}` | Get project |
| PATCH | `/v1/projects/{id}` | Update project |
| DELETE | `/v1/projects/{id}` | Soft delete |
| POST | `/v1/projects/{id}/restore` | Restore |
| GET | `/v1/projects/{id}/members` | List project members |
| POST | `/v1/projects/{id}/members` | Add member |
| PATCH | `/v1/projects/{id}/members/{user_id}` | Change project role |
| DELETE | `/v1/projects/{id}/members/{user_id}` | Remove member |

**Create project request:**
```json
{
  "name": "Website Redesign",
  "key": "WEB",
  "team_id": "team_...",
  "description": "Redesign marketing site",
  "icon": "globe",
  "color": "#3B82F6"
}
```

---

### Tasks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/projects/{project_id}/tasks` | List tasks (filter: status, assignee_id, label_ids, q for search) |
| POST | `/v1/projects/{project_id}/tasks` | Create task (Idempotency-Key) |
| GET | `/v1/tasks/{id}` | Get task |
| PATCH | `/v1/tasks/{id}` | Update task (Idempotency-Key) |
| DELETE | `/v1/tasks/{id}` | Soft delete |
| POST | `/v1/tasks/{id}/restore` | Restore |
| POST | `/v1/tasks/{id}/move` | Move to another project/status (position) |
| POST | `/v1/tasks/{id}/labels` | Add label |
| DELETE | `/v1/tasks/{id}/labels/{label_id}` | Remove label |
| GET | `/v1/tasks/{id}/subtasks` | List subtasks |
| POST | `/v1/tasks/{id}/subtasks` | Create subtask |

**List tasks query params:**
```
?status=in_progress&assignee_id=user_...&label_ids=lbl_1,lbl_2&q=bug&limit=20&cursor=...
```

**Create task request:**
```json
{
  "title": "Fix login redirect loop",
  "description": "After OAuth callback...",
  "status": "todo",
  "priority": "high",
  "assignee_id": "user_...",
  "labels": ["lbl_bug", "lbl_auth"],
  "due_date": "2024-02-01"
}
```

**Task response:**
```json
{
  "id": "task_...",
  "project_id": "proj_...",
  "number": 123,
  "title": "Fix login redirect loop",
  "status": "todo",
  "priority": "high",
  "assignee": { "id": "user_...", "full_name": "...", "avatar_url": "..." },
  "reporter": { "id": "user_...", "full_name": "..." },
  "labels": [{ "id": "lbl_...", "name": "bug", "color": "#EF4444" }],
  "position": 0,
  "due_date": "2024-02-01",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

---

### Comments

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/tasks/{task_id}/comments` | List comments (threaded, cursor) |
| POST | `/v1/tasks/{task_id}/comments` | Add comment (Idempotency-Key) |
| PATCH | `/v1/comments/{id}` | Edit comment |
| DELETE | `/v1/comments/{id}` | Soft delete |
| POST | `/v1/comments/{id}/reactions` | Add reaction (emoji) |
| DELETE | `/v1/comments/{id}/reactions/{emoji}` | Remove reaction |

**Comment request:**
```json
{ "content": "Fixed in PR #456", "parent_id": "comment_..." }
```

---

### Activity Feed

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/organizations/{org_id}/activity` | Org-level activity (cursor) |
| GET | `/v1/projects/{project_id}/activity` | Project-level activity |
| GET | `/v1/tasks/{task_id}/activity` | Task-level activity |

**Query params:** `?action=created,status_changed&user_id=...&since=2024-01-01T00:00:00Z&limit=50&cursor=...`

**Response:**
```json
{
  "data": [
    {
      "id": 123456,
      "action": "status_changed",
      "user": { "id": "user_...", "full_name": "..." },
      "task": { "id": "task_...", "number": 123, "title": "..." },
      "metadata": { "from": "todo", "to": "in_progress" },
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "next_cursor": "...",
  "has_more": true
}
```

---

### Attachments

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/attachments/presign` | Get presigned upload URL (Idempotency-Key) |
| POST | `/v1/attachments` | Register uploaded file (Idempotency-Key) |
| GET | `/v1/attachments/{id}` | Get attachment metadata |
| DELETE | `/v1/attachments/{id}` | Delete attachment |

**Presign request:**
```json
{ "filename": "screenshot.png", "content_type": "image/png", "size_bytes": 102400, "task_id": "task_..." }
```

**Presign response:**
```json
{
  "upload_url": "https://s3.amazonaws.com/...",
  "fields": { "key": "...", "policy": "...", "signature": "..." },
  "attachment_id": "att_..."
}
```

---

### Notifications

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/notifications` | List notifications (filter: is_read, type) |
| PATCH | `/v1/notifications/{id}/read` | Mark as read |
| POST | `/v1/notifications/read-all` | Mark all as read |
| GET | `/v1/notifications/preferences` | Get notification preferences |
| PATCH | `/v1/notifications/preferences` | Update preferences |

---

### Webhooks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/organizations/{org_id}/webhooks` | List webhooks |
| POST | `/v1/organizations/{org_id}/webhooks` | Create webhook (Idempotency-Key) |
| GET | `/v1/webhooks/{id}` | Get webhook |
| PATCH | `/v1/webhooks/{id}` | Update webhook |
| DELETE | `/v1/webhooks/{id}` | Delete webhook |
| POST | `/v1/webhooks/{id}/test` | Send test payload |
| GET | `/v1/webhooks/{id}/deliveries` | List recent deliveries (for debugging) |

**Create webhook request:**
```json
{
  "name": "Slack notifications",
  "url": "https://hooks.slack.com/services/...",
  "events": ["task.created", "task.updated", "comment.created"],
  "is_active": true
}
```

**Webhook payload (POST to configured URL):**
```json
{
  "id": "evt_...",
  "type": "task.created",
  "timestamp": "2024-01-15T10:30:00Z",
  "organization_id": "org_...",
  "data": { ...task object... },
  "signature": "sha256=..."  // HMAC-SHA256 of body with webhook secret
}
```

---

### API Keys

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/organizations/{org_id}/api-keys` | List API keys (masked) |
| POST | `/v1/organizations/{org_id}/api-keys` | Create API key (Idempotency-Key) |
| GET | `/v1/api-keys/{id}` | Get API key details |
| DELETE | `/v1/api-keys/{id}` | Revoke API key |
| POST | `/v1/api-keys/{id}/rotate` | Rotate key (returns new key once) |

**Create API key request:**
```json
{ "name": "CI/CD deploy", "scopes": ["read:tasks", "write:tasks", "read:projects"], "expires_at": "2025-01-01T00:00:00Z" }
```

**Response (only time full key is shown):**
```json
{ "id": "key_...", "key": "tf_live_abc123def456...", "prefix": "tf_live_abc123", "scopes": [...] }
```

---

### Search

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/organizations/{org_id}/search` | Full-text search across tasks, comments, projects |

**Query params:** `?q=login bug&type=task,comment&project_id=...&limit=20&cursor=...`

**Response:**
```json
{
  "data": [
    { "type": "task", "id": "task_...", "title": "Fix login bug", "highlight": "Fix <mark>login</mark> <mark>bug</mark>", "project": { "id": "proj_...", "key": "WEB" } },
    { "type": "comment", "id": "comment_...", "content": "The <mark>login</mark> issue...", "task": { "id": "task_...", "number": 42 } }
  ],
  "next_cursor": "...",
  "has_more": true
}
```

---

## WebSocket API (Real-Time)

**Connection:** `wss://api.teamflow.io/v1/ws?token=<access_token>`

**Message format (both directions):**
```json
{ "type": "message_type", "payload": { ... }, "request_id": "optional-for-req-resp" }
```

### Client → Server

| Type | Payload | Description |
|------|---------|-------------|
| `subscribe` | `{ "channels": ["org:org_123", "project:proj_456", "task:task_789"] }` | Subscribe to channels |
| `unsubscribe` | `{ "channels": [...] }` | Unsubscribe |
| `presence` | `{ "status": "online|away|busy", "project_id": "optional" }` | Update presence |
| `ping` | `{}` | Heartbeat (server responds `pong`) |

### Server → Client

| Type | Payload | Description |
|------|---------|-------------|
| `welcome` | `{ "connection_id": "ws_...", "subscribed_channels": [...] }` | On connect |
| `notification` | `{ "id": "notif_...", "type": "assigned", "title": "...", "data": {...} }` | Real-time notification |
| `activity` | `{ "id": 12345, "action": "commented", "user": {...}, "task": {...}, "metadata": {...} }` | Activity feed event |
| `task_updated` | `{ "task_id": "task_...", "changes": { "status": "in_progress" }, "updated_by": "user_..." }` | Task change |
| `presence_update` | `{ "user_id": "user_...", "status": "online", "project_id": "proj_..." }` | User presence |
| `error` | `{ "code": "unauthorized", "message": "..." }` | Connection-level error |

**Channels:**
- `org:{org_id}` — org-wide activity, announcements
- `project:{project_id}` — project activity, task changes
- `task:{task_id}` — task updates, comments
- `user:{user_id}` — personal notifications

**Reconnection:** Client must implement exponential backoff (1s, 2s, 4s, 8s, max 30s) + jitter. Server sends `welcome` with current subscriptions on reconnect.

---

## Rate Limiting

| Tier | Requests/min | Burst | WebSocket Connections |
|------|-------------|-------|----------------------|
| Free | 60 | 10 | 1 |
| Pro | 300 | 50 | 5 |
| Enterprise | 1000 | 200 | 20 |

**Headers returned:**
- `X-RateLimit-Limit: 300`
- `X-RateLimit-Remaining: 295`
- `X-RateLimit-Reset: 1705312800`

**On limit:** `429 Too Many Requests` + `Retry-After: 60`

---

## API Key Scopes

| Scope | Resources |
|-------|-----------|
| `read:organizations` | GET orgs |
| `write:organizations` | PATCH org |
| `read:projects` | GET projects |
| `write:projects` | POST/PATCH/DELETE projects |
| `read:tasks` | GET tasks, comments, activity |
| `write:tasks` | POST/PATCH/DELETE tasks, comments |
| `read:users` | GET members |
| `write:users` | Invite, change roles, remove |
| `read:webhooks` | GET webhooks |
| `write:webhooks` | POST/PATCH/DELETE webhooks |
| `admin` | All above + audit logs, usage |

---

## OpenAPI Spec

Full OpenAPI 3.1 spec at `/v1/openapi.json` (served by API gateway). Includes all schemas, examples, and error responses.