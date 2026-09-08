# TeamFlow API — Multi-Tenant SaaS Backend

Hono + Postgres (RLS) + Redis + BullMQ. Every tenant-owned row carries `tenant_id`;
Postgres Row-Level Security is the backstop, not the only gate.

## Quickstart

```sh
docker compose up -d          # Postgres + Redis + MinIO
bun install
bun run db:migrate            # schema + RLS policies
bun run db:seed               # 2 demo orgs (acme / globex), password123
bun run dev                   # API on :3001 (see .env)
```

## Verify

```sh
bun test                      # unit suite (no infra needed)
bun run test:integration      # end-to-end tenant-isolation suite (needs stack up)
bun run check-types
```

Integration suite proves: cross-tenant 404s/403s, RLS fail-closed at the SQL layer
(zero rows without tenant context, direct INSERT rejected), invite → accept → login,
API-key scope enforcement, Idempotency-Key dedupe, soft delete, tenant-scoped FTS.

## Tenancy model

- Tenant-scoped tables keyed `(tenant_id, id)`; FKs carry `tenant_id` → a task can
  never reference another tenant's project *by constraint*.
- `withTenant(tenantId, fn)` opens a request-scoped tx, `SET LOCAL app.tenant_id`,
  then runs the handler. RLS policy filters/validates every row against it.
- App connects as non-superuser `teamflow` role (superusers bypass RLS).
- Three controlled escapes via `SECURITY DEFINER` fns: invite lookup, API-key
  lookup, memberships-for-user — all return `tenant_id`; caller picks the tenant.

## API surface (v1)

| Area | Endpoints |
|---|---|
| Auth | `POST /v1/auth/signup` (auto-provisions org + owner), `/login`, `/refresh`, `/logout`, `/switch-org`, `GET /v1/me` |
| Orgs | `GET /v1/orgs/:id`, `POST /v1/orgs/:id/invites`, `POST /v1/invites/:token` (public), member roles/deactivate, `/disable`, `/leave` |
| Teams / Projects | CRUD + soft delete; project cap per tier |
| Tasks | CRUD, Idempotency-Key, cache-aside board reads, soft delete |
| Comments / Attachments | cursor-paginated comments; presigned S3 PUT/GET (or in-memory dev backend) |
| Feed | `GET /v1/activity`, `GET /v1/notifications`, mark-read |
| Search | `GET /v1/search?q=` — Postgres FTS, ts_rank_cd, tenant-scoped by construction |
| Governance | webhooks (+ rotate-secret, delivery ledger), API keys (hashed, scoped), audit logs, usage vs tier limits |
| Realtime | `GET /v1/ws` (JWT via `?token=`), Redis pub/sub per-org fan-out, cursor catch-up |

Cross-cutting: stable error envelope `{error:{code,message,request_id,retryable}}`,
per-principal rate limits (Redis, in-memory fallback), usage meters, audit trail
written in the same tx as the mutation.

## Background jobs (BullMQ)

`notify` (notification fan-out, deterministic ids → idempotent redelivery),
`webhook` (HMAC-signed delivery + retry ledger, exponential backoff),
`usage` (meter aggregates). Emitted post-commit; DB is source of truth.

## Subscription tiers

`free | pro | business` — daily API calls (Redis counter, fail-open on Redis
outage), seats, storage, events/day, active projects. Enforced in auth middleware
+ invites (seat cap) + projects (cap). Meters visible at `GET /v1/usage`.

## Degradation (docs §7)

Redis down → cache misses, in-memory rate windows, fail-open quota, best-effort
pub/sub. Postgres down → 503 `dependency_unavailable`, retryable. WS drop →
cursor replay from notifications. No hang paths: Redis client rejects offline
commands immediately (`enableOfflineQueue: false`).
