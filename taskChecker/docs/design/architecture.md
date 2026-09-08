# TeamFlow — Service Architecture

## Architecture Style: Modular Monolith

**Decision:** Single deployable unit with enforced internal module boundaries. No network calls between domains.

**Why:**
- Scale is tiny (~1 QPS peak) — distributed system overhead not justified
- Single team, fast iteration, strong consistency needs (RBAC, task moves)
- Clean module boundaries allow future extraction without rewrite
- One database, one migration pipeline, simple ops

**Module Boundaries (enforced by code structure + linting):**

```
src/
├── modules/
│   ├── auth/              # Authentication, sessions, tokens
│   ├── organizations/     # Org CRUD, settings, usage, audit
│   ├── invitations/       # Invite flow, acceptance
│   ├── members/           # Membership, RBAC, roles
│   ├── teams/             # Team CRUD, membership
│   ├── projects/          # Project CRUD, members, settings
│   ├── tasks/             # Task CRUD, status workflow, labels, subtasks
│   ├── comments/          # Comments, threading, reactions, mentions
│   ├── attachments/       # Presigned URLs, metadata, virus scan
│   ├── activity/          # Activity event emission, querying
│   ├── notifications/     # In-app, email, preferences, WebSocket push
│   ├── webhooks/          # Outgoing webhooks, retry, delivery tracking
│   ├── api_keys/          # API key management, validation
│   ├── search/            # Full-text search indexing + query
│   └── subscription/      # Plan limits, usage tracking, enforcement
├── shared/
│   ├── database/          # DB connection, migrations, RLS helpers
│   ├── cache/             # Redis client, cache keys, invalidation
│   ├── queue/             # Background job queue (Redis-based)
│   ├── websocket/         # WS connection manager, pub/sub
│   ├── events/            # Domain event bus (in-process)
│   ├── errors/            # Error types, HTTP mapping
│   ├── validation/        # Shared validators
│   └── middleware/        # Auth, tenant resolution, rate limit, logging
└── main.ts                # App entry, router, DI container
```

**Cross-module communication:** In-process function calls + **domain events** (sync, in-memory bus). Events emitted after transaction commits (using transactional outbox pattern).

---

## Request Flow

```
Client Request
     │
     ▼
┌─────────────────────────────────────┐
│  API Gateway / Load Balancer        │  (TLS termination, rate limit by IP)
└─────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────┐
│  Modular Monolith (Node.js/TypeScript)        │
│  ┌─────────────────────────────────┐  │
│  │ Middleware Chain                │  │
│  │ 1. Request ID + structured log  │  │
│  │ 2. Auth (JWT/API key validation)│  │
│  │ 3. Tenant resolution (org_id)   │  │
│  │ 4. Rate limit (per org/user)    │  │
│  │ 5. RLS context (SET app.current_user_id) │  │
│  └─────────────────────────────────┘  │
│                   │                   │
│                   ▼                   │
│  ┌─────────────────────────────────┐  │
│  │ Route → Controller → Service    │  │
│  │ (module owns its routes)        │  │
│  └─────────────────────────────────┘  │
│                   │                   │
│         ┌─────────┴─────────┐         │
│         ▼                   ▼         │
│  ┌─────────────┐    ┌─────────────┐   │
│  │ PostgreSQL  │    │    Redis    │   │
│  │ (Primary)   │    │ (Cache,     │   │
│  │ + RLS       │    │  Queue,     │   │
│  │             │    │  Pub/Sub)   │   │
│  └─────────────┘    └─────────────┘   │
└─────────────────────────────────────┘
```

---

## Module Responsibilities & Data Ownership

| Module | Owns Tables | Emits Events | Consumes Events |
|--------|-------------|--------------|-----------------|
| `auth` | users, sessions | `user.created`, `user.logged_in` | — |
| `organizations` | organizations, subscription_usage | `org.created`, `org.updated`, `org.deleted` | — |
| `invitations` | invitations | `invitation.created`, `invitation.accepted` | `user.created` |
| `members` | organization_members | `member.added`, `member.removed`, `member.role_changed` | `invitation.accepted` |
| `teams` | teams, team_members | `team.created`, `team.member_added` | — |
| `projects` | projects, project_members | `project.created`, `project.updated`, `project.member_added` | `team.created` |
| `tasks` | tasks, labels, task_labels | `task.created`, `task.updated`, `task.deleted`, `task.moved` | `project.created` |
| `comments` | comments | `comment.created`, `comment.updated`, `comment.deleted` | `task.created` |
| `attachments` | attachments | `attachment.uploaded`, `attachment.deleted` | `task.created`, `comment.created` |
| `activity` | activity_events | — | **All mutation events** |
| `notifications` | notifications | `notification.created` | `task.*`, `comment.*`, `member.*`, `invitation.*` |
| `webhooks` | webhooks, webhook_deliveries | — | `activity.*` (filtered) |
| `api_keys` | api_keys | `api_key.created`, `api_key.revoked` | — |
| `search` | (tsvector indexes) | — | `task.*`, `comment.*`, `project.*` |
| `subscription` | subscription_usage | `usage.updated`, `limit.exceeded` | `org.*`, `user.*`, `project.*`, `task.*` |

**Rule:** A module only writes to its own tables. Reads can join across modules via service calls (in-process).

---

## Domain Events (In-Process Bus)

```typescript
// Event definition
interface DomainEvent<T = unknown> {
  type: string;           // e.g., "task.created"
  payload: T;
  organizationId: string;
  userId: string;
  timestamp: Date;
  correlationId: string;  // for tracing
}

// Emission (in service, after DB commit)
eventBus.emit('task.created', {
  taskId: task.id,
  projectId: task.projectId,
  title: task.title,
  assigneeId: task.assigneeId,
}, { organizationId, userId, correlationId });

// Consumption (in another module's event handler)
eventBus.on('task.created', async (event) => {
  // Create notification for assignee
  // Index in search
  // Emit activity event
});
```

**Transactional Outbox Pattern:** Events written to `outbox` table in same DB transaction as domain change. Background worker publishes to in-process bus (guarantees at-least-once delivery).

---

## Background Job System

**Queue:** Redis-based (bullmq or similar) — single queue per priority tier.

| Queue | Priority | Jobs | Retry |
|-------|----------|------|-------|
| `high` | 10 | Webhook deliveries, email sends, search indexing | 3x, exp backoff |
| `default` | 5 | Activity event persistence, notification creation, usage aggregation | 5x, exp backoff |
| `low` | 1 | Cleanup (soft delete purge), audit log export, report generation | 2x |

**Job payload:** Minimal — entity IDs + correlation ID. Worker re-fetches fresh data.

**Dead Letter Queue:** Failed jobs after max retries → DLQ for manual inspection.

**Scheduled jobs:** Cron-style (cleanup at 2 AM UTC, usage rollup at midnight UTC).

---

## Caching Strategy

**Redis usage:**
1. **Session cache** — JWT validation result (user + permissions) TTL 5 min
2. **Rate limit counters** — sliding window, per org/user/IP
3. **WebSocket presence** — `presence:org:{org_id}:user:{user_id}` TTL 30s (heartbeat refresh)
4. **Computed views** — Project board columns (task counts per status) TTL 30s
5. **Search results** — Popular queries TTL 5 min
6. **Idempotency keys** — `(org_id, endpoint, key) → response` TTL 24h

**Cache invalidation:** On mutation, invalidate related keys via event handler:
```typescript
eventBus.on('task.updated', (event) => {
  cache.del(`board:${event.payload.projectId}`);
  cache.del(`task:${event.payload.taskId}`);
  cache.del(`search:org:${event.organizationId}:*`);
});
```

**No cache-aside for primary reads** — PostgreSQL is fast enough at this scale. Cache only for computed/aggregated views.

---

## WebSocket Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Client A   │     │  Client B   │     │  Client C   │
│  (WS conn)  │     │  (WS conn)  │     │  (WS conn)  │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           ▼
              ┌─────────────────────────┐
              │  WebSocket Manager      │  (in-process, per worker)
              │  - Connection registry  │
              │  - Channel subscriptions│
              │  - Message routing      │
              └───────────┬─────────────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
       ┌─────────────┐         ┌─────────────┐
       │  Redis      │         │  In-process │
       │  Pub/Sub    │         │  Event Bus  │
       │  (multi-    │         │  (single    │
       │   worker)   │         │   worker)   │
       └─────────────┘         └─────────────┘
```

**Single worker:** In-process event bus directly routes to connection manager.

**Multiple workers (future):** Redis Pub/Sub fans out events to all workers. Each worker delivers to its local connections.

**Connection state:** Stored in Redis hash `ws:conn:{connection_id}` → `{ user_id, org_id, channels[], connected_at }`. Enables presence, admin disconnect, graceful drain.

---

## API Gateway / Edge

**For MVP:** Embedded in monolith (Fastify/Express + middleware). No separate gateway service.

**When to extract:** Multiple deployables, need for centralized auth/WAF, or different teams owning edge vs app.

**Gateway responsibilities (in monolith):**
- TLS termination (or ALB does it)
- Request ID generation + propagation
- Auth validation (JWT signature, API key lookup)
- Tenant resolution → set `app.current_org_id`, `app.current_user_id`
- Rate limiting (Redis sliding window)
- Request/response logging (structured JSON)
- CORS, security headers
- OpenAPI spec serving

---

## Deployment Topology (MVP)

```
                    ┌─────────────────┐
                    │   Internet      │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  ALB / Cloud    │  (AWS ALB, GCP Cloud Load Balancing)
                    │  Load Balancer  │  (TLS cert, health checks)
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌───────────┐  ┌───────────┐  ┌───────────┐
        │  App Pod  │  │  App Pod  │  │  App Pod  │  (3+ for HA)
        │  (Node.js)│  │  (Node.js)│  │  (Node.js)│
        └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌───────────┐  ┌───────────┐  ┌───────────┐
        │  PgBouncer│  │   Redis   │  │  Object   │
        │  (Pooler) │  │  (Cache,  │  │  Storage  │
        │           │  │  Queue,   │  │  (S3/GCS) │
        │           │  │  Pub/Sub) │  │           │
        └─────┬─────┘  └───────────┘  └───────────┘
              │
              ▼
        ┌───────────┐
        │PostgreSQL │  (Primary + 1 read replica)
        │  Primary  │
        └───────────┘
```

**Scaling:**
- App pods: Horizontal (CPU > 70% → scale out, min 3 for HA)
- PostgreSQL: Vertical first, then read replica for read scaling
- Redis: Vertical, then cluster mode if needed

---

## Configuration & Secrets

| Config | Source |
|--------|--------|
| Database URL | Secret manager (AWS Secrets Manager, GCP Secret Manager) |
| Redis URL | Secret manager |
| JWT signing key | Secret manager (rotate quarterly) |
| Encryption keys | Secret manager |
| S3/GCS credentials | Secret manager |
| Feature flags | Config map / LaunchDarkly / custom |
| Log level | Env var |

**No secrets in code or Docker images.**

---

## Database Connection Pooling

**PgBouncer** in transaction pooling mode between app and PostgreSQL.

| Setting | Value |
|---------|-------|
| Pool mode | transaction |
| Max client connections | 100 per app pod |
| Default pool size | 20 per app pod |
| Max pool size | 50 per app pod |
| Idle timeout | 30s |

**Why:** Prevents connection exhaustion under load; 3 pods × 50 = 150 connections max, well within PostgreSQL limits.

---

## Migration Strategy

- **Tool:** Node-based (e.g., `node-pg-migrate` or `kysely-migrate`)
- **Direction:** Up only (no down migrations in production)
- **Process:** CI runs migrations on staging; production migrations manual approval
- **Backward compatibility:** Additive schema changes only in v1; breaking changes require v2 deploy with dual-write period
- **RLS policies:** Migrated with schema; tested in CI with multi-tenant test suite

---

## Future Extraction Points (Seams)

| Module | Extraction Trigger | Extraction Target |
|--------|-------------------|-------------------|
| `notifications` | High fan-out, different scaling (email/WS) | Separate service + message queue |
| `webhooks` | High retry volume, isolation from API latency | Separate service + durable queue |
| `search` | Complex queries, need for Elasticsearch | Separate service + search engine |
| `attachments` | Large blob throughput, CDN integration | Separate service + blob store |
| `activity` | High write volume, append-only | Separate service + time-series DB |

**Current state:** All in-process. Extraction = replace in-process call with HTTP/gRPC + async event bridge.