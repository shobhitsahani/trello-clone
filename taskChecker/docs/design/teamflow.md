# Design: TeamFlow — Multi-Tenant Project & Workflow SaaS

**Status:** v1 (settled) · **System of record:** Postgres · **Realtime:** Redis pub/sub → WebSocket · **Jobs:** BullMQ on Redis · **Blobs:** S3-compatible + signed URLs · **Search:** Postgres FTS (v1).

> The load-bearing constraint of this design is **multi-tenancy with hard
> isolation at B2B scale (≤10k orgs)**. Every other decision — modular monolith,
> shared-schema Postgres + RLS, Redis as the one auxiliary system, Postgres FTS
> instead of a search cluster — is a consequence of reasoning from that
> constraint and from the scale numbers. When a constraint flips (one tenant
> needs a database silo; writes pass ~500 QPS toward one node's ceiling), the
> affected parts bend — see §6 for each breaking point.

---

## 1. Problem & Scope — *Clarify Requirements*

**One sentence:** TeamFlow is a web-based, multi-tenant project & workflow tool where each organization's users/teams/projects/tasks/comments/activity are isolated behind a tenant boundary, with RBAC, realtime notifications, webhooks, API access, usage controls, and a full audit trail.

**Core functional requirements** (full detail in `teamflow-requirements.md`):

1. **Auth & organizations** — signup auto-provisions org + owner; email invitations; org membership with roles.
2. **Tenant-scoped work** — teams, projects, tasks, comments, attachments, activity feeds; *every query scoped by `tenant_id`*.
3. **RBAC** — `owner | admin | member | viewer`, enforced on every mutating and admin surface.
4. **Realtime** — notifications + WebSocket push of task/comment events, with cursor-based catch-up so a dropped connection never loses updates.
5. **Integrations** — outbound webhooks, API keys, usage metering + tier limits, audit logs, soft deletion, full-text search.

**Non-functional:** 30k DAU target · reads p99 < 250 ms / writes < 500 ms · 99.9% · strong business state / eventual derived (≤5 s freshness) · RPO ≤ 15 min / RTO ≤ 1 h · tenant isolation is a *hard invariant*.

**Out of scope:** mobile, chat, custom domains, billing *engine*, multi-region AA, database silos, dedicated search cluster.

### Why these constraints matter

- **Multi-tenancy is the spine.** The `tenant_id` column on every tenant-scoped table is not optional metadata — it is the first-class partitioning key that drives the data model, the RLS policy, the cache key namespace, the API routing, and the billing metering. Get this wrong and the entire product is a security bug.
- **B2B scale (≤10k orgs).** Unlike a consumer app, each org has a bounded, predictable footprint. No single org exceeds ~10% of load in the design window — which makes shared-schema viable and sharding unnecessary for 12 months.
- **Read-heavy (90:10).** Boards, feeds, and activity lists dominate. Writes are concentrated on task mutation and comment creation. This skew makes caching the highest-leverage move and keeps a single Postgres node viable.

---

## 2. Scale Estimates — *Back-of-the-Envelope*

Assumptions recorded in the requirements doc (30k DAU, 50 reads + 5 writes per DAU-day, peak ≈ 2× average, ~2 KB rows, ~2 MB attachments, ~4× event fan-out).

| Figure | Value | What it forces |
|---|---|---|
| Read QPS (peak) | ~30k×50/86.4k ≈ 17 avg → **~35–120 peak** | Nothing exotic; caching is optional-but-cheap; read replicas later |
| Write QPS (peak) | ~30k×5/86.4k ≈ 1.7 avg → **~4–20 peak** | **Far under a single Postgres node (~1k QPS)** → no sharding |
| Event/queue rate | user actions × fan-out ≈ **~50–150 events/s peak** | A Redis-queued worker pool is ample; no Kafka-class broker |
| Relational storage | ~500k writes/day × 2 KB ≈ **~1 GB/day → ~365 GB/yr** | One Postgres primary + replica; archive/tier old audit rows |
| Attachments | ~10k uploads/day × 2 MB ≈ **20 GB/day → ~7 TB/yr** | Must live in a **blob store**, never in Postgres; CDN-fronted egress |
| WS connections | ~20% of DAU ≈ **~6–8k concurrent** | 1–3 WS gateway nodes with Redis pub/sub glue |
| Search corpus | ~10M task+comment docs by yr 1 | Postgres `tsvector` GIN fits; ~50M docs is the cliff |
| Working set (hot reads) | **tens of GB** (recent tasks/comments/boards) | Fits Redis comfortably → 90%+ hit rates attainable |

**Conclusion the numbers drive:** this is a *modest-scale B2B workload*. The expensive machinery (Kafka, Elasticsearch cluster, DB sharding, microservices, multi-region) is **ruled out by the numbers, not forgotten**. The design that earns its place is a modular monolith, one Postgres, one Redis, one worker pool, and a blob store. The grade here comes from *correct enforcement of the tenant boundary*, the realtime path, and clean degradation — not from a big diagram.

---

## 3. High-Level Design — *Propose the Architecture*

```
              Browser (Next.js React app)
                       │  HTTPS/REST + WS
                ┌──────▼──────────┐
                │   API Gateway / LB  │  TLS, rate-limit(Redis), auth token check
                └──┬───────────┬───┘
                   │           │
         ┌─────────┴────┐      │
         ▼              ▼      ▼
  ┌──────────────┐  ┌──────────────┐
  │ Auth module  │  │  API / Core  │────────────┐
  │ (JWT, login, │  │ orgs/teams/  │  emits     │
  │ invites)     │  │ projects/    │  events    ▼
  └──────────────┘  │ tasks/       │       ┌──────────────┐
                    │ comments/    │       │  Redis       │
                    └──────┬───────┘       │  cache +     │
                           │ queries       │  pub/sub +   │
                       ┌───▼───────┐       │  BullMQ      │
                       │ Postgres  │       └──────┬───────┘
                       │ tenant_id │              │ jobs
                       │ + RLS     │       ┌──────▼───────┐
                       │ FTS/audit │       │ Worker pool  │
                       └───────────┘       │ email·wh·nf  │
                                           └──────────────┘
   Blob store (S3, signed URLs) ◄── CDN-fronted GETs
   Email provider ◄── worker     Webhook subscribers ◄── worker
```

**Component → requirement mapping:**

| Component | Earns its place because |
|---|---|
| API Gateway / LB | TLS terminating, auth-token gate, Redis-backed rate limiting; single ingress |
| Auth module | Sessions + org provisioning; RBAC context for every request |
| API / Core module | All tenant-scoped CRUD — the product surface; enforces `tenant_id` + RLS context |
| Postgres (primary) | System of record; ACID per-tenant transactions; RLS as isolation backstop |
| Redis | Cache-aside reads, token-bucket rate limits, pub/sub fan-out for WS, BullMQ transport |
| BullMQ worker pool | Off-path: emails, webhook delivery (retries/DLQ), notification fan-out, usage metering, attachment scan |
| Blob store + signed URLs | Attachments (7 TB/yr) never touch Postgres; uploads stream client→store, app gets metadata |
| Postgres FTS (tsvector+GIN) | Full-text search without a second cluster; RLS extends to search by construction |
| WebSocket gateway (in API) | Realtime push of events; pub/sub bridges N gateway nodes; cursor catch-up for drop safety |
| Email provider | Invitations, notification digest |
| Observability (otel/prom) | SLOs, RED dashboards, trace correlation — wired but off the request path |

---

## 4. API Design — *The Contract*

REST/JSON over `/v1`, Bearer JWT (short-lived) + refresh, cursor pagination, cap `limit` (≤ 100). `Idempotency-Key` honored on creates. Error envelope stable across endpoints: `{ "error": { "code", "message", "request_id", "retryable" } }`.

**Tenant resolution: from the authenticated principal, never from the client.** The path carries `orgId` for routing/RBAC; the datasource always keys on the membership's `tenant_id`. API keys are bound to a tenant at creation.

### Auth / Membership
```
POST /v1/auth/signup          { email, password, orgName }        → { user, org, tokens }
POST /v1/auth/login           { email, password }                 → { tokens }
POST /v1/auth/refresh         { refreshToken }
GET  /v1/me                                                   → user + memberships
```

### Organization & Invitations
```
POST /v1/orgs/{orgId}/invites { email, role }                      → invite
POST /v1/invites/{token}/accept                                    → membership
GET  /v1/orgs/{orgId}/members?cursor=&limit=
PATCH /v1/orgs/{orgId}/members/{userId}  { role }                  (admin+)
DELETE /v1/orgs/{orgId}/members/{userId}                           (soft-deactivate)
```

### Teams & Projects
```
GET  /v1/orgs/{orgId}/teams?cursor=
POST /v1/teams                      { orgId, name }
GET  /v1/orgs/{orgId}/projects?cursor=&teamId=
POST /v1/projects                   { orgId, teamId, name, key }
```

### Tasks (the hot object)
```
GET  /v1/orgs/{orgId}/projects/{pid}/tasks?status=&assignee=&search=&cursor=&limit=
GET  /v1/tasks/{id}
POST /v1/tasks                      { projectId, title, description?, assigneeId?, priority, dueAt? }
PATCH /v1/tasks/{id}                { title?, status?, priority?, assigneeId?, dueAt? }
DELETE /v1/tasks/{id}               (soft delete)
```

### Comments & Attachments
```
GET  /v1/tasks/{id}/comments?cursor=
POST /v1/tasks/{id}/comments        { body }
POST /v1/attachments/presign        { fileName, contentType, size, taskId? }
                                     → { uploadUrl (PUT, 15 min), objectKey }  (server stores metadata)
GET  /v1/attachments/{id}/download  → redirect to signed GET (5 min)
```

### Activity & Notifications
```
GET  /v1/activity?entityType=&entityId=&cursor=
GET  /v1/notifications?cursor=            (unread first)
POST /v1/notifications/{id}/read          (idempotent)
```

### Search (tenant-scoped FTS)
```
GET  /v1/search?q=&type=task|comment|all&status=&cursor=&limit=
# → { data: [{ type, id, title, snippet, highlights, score }], next_cursor }
```

### Integrations & Governance
```
GET  /v1/webhooks?cursor=          POST /v1/webhooks   { url, events[], secret? }
GET  /v1/webhooks/{id}/deliveries  POST /v1/webhooks/{id}/rotate-secret
POST /v1/api-keys                  { name, scopes[] } → { key: "tfk_live_…" } (shown once, stored hashed)
GET  /v1/usage?metric=             GET /v1/audit-logs?cursor=      (admin+)
```

**Rules:** writes that create (tasks, comments, invites, webhooks, API keys) accept `Idempotency-Key` (dedupe table, 24 h TTL). Realtime: `GET /v1/ws?token=` upgrades to WebSocket; client subscribes `org:{tenantId}`, `user:{me}`; server replays since-cursor on subscribe. Rate limits per `user` and per `api-key` (business tier also per-tenant aggregates): 429 carries `X-RateLimit-*` + `Retry-After`.

---

## 5. Data Model — *Where Records Live*

**Multi-tenancy: shared schema, shared DB, `tenant_id` on every tenant-scoped table, enforced twice** — (1) the app always filters by `tenant_id` taken from the authenticated membership, and (2) Postgres **Row-Level Security** makes a missing WHERE clause a *query error*, not a leak (`app.tenant_id` GUC set `SET LOCAL` inside the request transaction). This is the defense-in-depth that turns the most dangerous SaaS bug (one forgotten filter) from a data breach into a hard failure.

**IDs:** UUIDv7 everywhere (time-sortable, generated anywhere, zero coordination). No sequences ⇒ no write serialization, no enumeration.

### Key tables (all tenant tables carry `tenant_id` in PK/unique + RLS)

```sql
tenants        (id uuid pk, name, slug unique, plan, status, created_at)
users          (id uuid pk, email citext unique, name, password_hash, created_at)
memberships    (tenant_id, user_id, role, status, invited_at, accepted_at,
                pk(tenant_id,user_id), rls)                              -- RBAC anchor
teams          (tenant_id, id, name, deleted_at, pk(tenant_id,id))
projects       (tenant_id, id, team_id, name, key, deleted_at, pk(tenant_id,id))
tasks          (tenant_id, id, project_id, title, description, status, priority,
                assignee_id, reporter_id, due_at, search_vector tsvector,
                created_at, updated_at, deleted_at,
                pk(tenant_id,id),
                idx (tenant_id, project_id, status, created_at desc),
                idx (tenant_id, assignee_id, status),
                gin  (tenant_id, search_vector))                       -- FTS
comments       (tenant_id, id, task_id, author_id, body,
                search_vector tsvector, created_at, deleted_at)
attachments    (tenant_id, id, task_id, uploader_id, object_key, size,
                content_type, sha256, created_at, deleted_at)              -- blobs elsewhere
activity       (tenant_id, id, actor_id, entity_type, entity_id, action, meta jsonb,
                created_at)                                                -- append-only per tenant
notifications  (tenant_id, id, user_id, type, payload jsonb, read_at, deleted_at)
invites        (tenant_id, id, email, role, token_hash, expires_at, accepted_at)
webhooks       (tenant_id, id, name, url, secret_hash, events text[], active, created_at)
deliveries     (tenant_id, id, endpoint_id, event, payload jsonb, status,
                attempts, next_attempt_at, last_error)                     -- retry ledger
api_keys       (tenant_id, id, name, key_hash, key_prefix, scopes text[],
                revoked_at, last_used_at)
usage_meter    (tenant_id, metric, ts, value)                             -- metered events
audit_logs     (tenant_id, id, actor_id, action, entity_type, entity_id,
                before jsonb, after jsonb, ip inet, created_at)            -- append-only
idempotency    (tenant_id, key, response jsonb, created_at, pk(tenant_id,key))
refresh_tokens (user_id, token_hash, expires_at, revoked_at)
```

**Access patterns that drive the model:** boards read `(tenant, project, status)` range scans; "my tasks" = `(tenant, assignee, status)`; search = `(tenant, tsvector)` so **RLS and GIN compose** — a query can't search outside its tenant. Comments and activity are append-mostly with cursor pagination on `created_at`.

**Soft deletion:** `deleted_at` on tasks/projects/teams/comments; default filters `WHERE deleted_at IS NULL`; RLS untouched. Hard purge via background job after a retention window (30 d) with the row written to the audit trail.

**Write path:** one request transaction per mutation; effects (notifications, activity, webhooks, search vectors, usage) are emitted as events **after commit** → worker (scaffold) or transactional outbox (production hardening).

---

## 6. Key Decisions & Trade-offs — *Evaluate Every Choice*

| Decision | Solves | Worsens | Change it when |
|---|---|---|---|
| **Shared-schema + RLS** | Cheapest at ≤10k tenants; RLS makes cross-tenant leaks a failure, not a bug; one fleet to operate | Noisy-neighbor; one DB = common blast radius; per-tenant restore is table-level only | A tenant demands isolation (regulated / > ~10% of load) → **bridge/silo**; or tenant count > ~100k where one pool saturates |
| **Modular monolith** | ACID transactions across modules (membership+roles in one tx); one deployable; fast iteration | Scales/deploys as a unit; boundaries need discipline | Realtime gateway needs independent scale or a second team needs its own cadence → extract that seam |
| **Postgres = system of record** | ACID, joins, `tsvector` FTS, **RLS built-in**, point-in-time recovery | One-node write ceiling (~1k QPS); replica lag staleness | Writes > ~300–500 QPS or > ~5 TB relational → partition by tenant or federate activity/notifications out |
| **UUIDv7 keys** | No coordination, time-sortable, no sequences, no enumeration | 16-byte index keys; mildly leaks creation time | 64-bit keys mandated → Snowflake or ticket IDs |
| **Redis for cache + rate-limit + pub/sub + queue** | One familiar system covers four needs; ~µs access; TTLs everywhere | Another stateful system; unpersisted Redis can lose recent queue/state | Throughput ×10 → split queues / managed Redis cluster; correctness pressure → add L1 cache |
| **BullMQ (Redis) jobs** | Retries/backoff, DLQ, scheduled/delayed jobs, priority; no Kafka to operate | Transport is Redis (persistence risk); single-broker SPOF | > ~100k jobs/s or strict replay/ordering → Kafka/NATS-class broker; durable workflows → Temporal |
| **Cache-aside reads** | Kills read pressure for boards/feeds; cache-down = just slower, still correct | Staleness window; stampede on hot board after invalidation | Hit rate < 90% or strict freshness required → write-through + versioned keys, or read replicas |
| **Postgres FTS (v1)** | Zero new infra; RLS applies to search by construction; ranking enough for a work tool | No typo tolerance/synonyms; GIN write cost; relevance ceiling | Corpus > ~50M docs or users demand fuzzy/"best" ranking → dedicated indexer behind same events |
| **WS via pub/sub fan-out** | ~6–8k connections across 1–3 gateway nodes; every node sees every org event | Stateful connections; N-node fan-out; reconnect storm on pub/sub flap | > ~100k concurrent WS → dedicated realtime/presence tier; SSE per-org |
| **Sync writes / async effects** | Read-your-writes on the objects that matter; write path stays ~10 ms | Notifications/feeds/search lag by design (~seconds) | Lag exceeds SLA → outbox + per-event reconciliation, tighter worker SLAs |
| **API keys + hashing** | Server-to-server access; hash-at-rest means a DB dump leaks nothing; scopes + revocation | Key shown once (UX friction); rotation flows | Per-key quotas or key sharing across teams → key groups + budgets |
| **S3-compatible + signed URLs** | 7 TB/yr never touches Postgres; uploads stream client→store; durable | Egress $, presign hygiene, multi-part for >100 MB | Egress dominates cost → CDN-front reads + infrequent-access tiering; scan uploads |

**Breaking point of the whole design (stated):** the architecture holds until *(a)* combined tenant write rate crosses ~300–500 QPS toward the single Postgres primary, *(b)* corpus crosses ~50M docs, or *(c)* a specific tenant requires database isolation. Each flips a *local* seam (per the table), not the whole diagram.

---

## 7. Failure Modes & Degradation — *Stress-Test Every Dependency*

| Dependency | If it fails | Degradation story (user-visible) | Recovery (no stampede) |
|---|---|---|---|
| **Postgres primary** | API returns 503 quickly (fail-fast, no queue-up); reads fall back to replica with `stale: true`; writes rejected | Read-mostly experience survives degraded; edits temporarily unavailable | PITR + replica promote; **exponential backoff + jitter** on client retries; LB health-gate on `/readyz` |
| **Redis** | Cache-aside misses → Postgres (correct, slower); rate limiting degrades to per-instance token buckets; queue pauses | Hot reads slow; no realtime push (WS falls back to polling catch-up); write path still consistent | Limiters local-first and self-healing; Redis persistence (AOF); WS clients reconnect backoff + pull `since-cursor` |
| **Blob store / presign** | Uploads fail with clear 503; existing downloads stale-cached at CDN continue | Attachments degraded; work data intact | Retry presign path; CDN TTL lets reads survive origin pause |
| **Email provider** | Invite/notification emails queue + retry with backoff; **in-app notifications still delivered** (DB rows) | Slightly delayed email; core product unaffected | Worker retry budget + DLQ; alert on delivery age |
| **Subscriber webhook endpoint** | Deliveries retry per-endpoint with exponential backoff (cap ~10) then "failed"; ledger in Postgres | Customer integration lags; our API unaffected | Rate-limit per endpoint; disable + alert after cap; manual replay UI |
| **Worker lag / job pileup** | Queue depth alarm (oldest-job age); priority keeps user notifications before email digests | Derived features catch up late; writes unaffected | Scale workers horizontally (stateless); backpressure via paused producer if lag > threshold |
| **WS gateway node loss** | Clients reconnect (backoff+jitter) to another node; missed events recovered from notifications cursor | Brief realtime blip; no lost state | Autoscale group replaces node; no manual failover |
| **Rate-limit hit / abuse** | 429 + `Retry-After`; per-tenant aggregate limits bound a tenant's blast radius | Over-budget tenant throttled; others unaffected | Token bucket refills; support tool raises tier limits |
| **Cross-tenant leak attempt** | RLS **blocks it at the query planner** even if app code is buggy — the invariant holds by construction | Error 500/`row not found`; no data exposed | Alarm on RLS violations; query-review gate in CI |

Every critical dependency gets: timeout (p99-based), capped retries with backoff+jitter, and a *degraded-but-useful* answer — stale-beats-error unless the operation must be strictly current (tenant boundary checks never degrade).

---

## 8. Scale Evolution — *The Bottleneck Ladder*

1. **Now:** modular monolith, 2–3 API/WS nodes, 1 Postgres primary + 1 replica, Redis, worker pool, blob store. Comfortably holds 10× today's numbers.
2. **Reads grow (≈ next rung):** more read replicas + board/feed caching; SQL pushed to replicas via a read-router. *Trigger: replica read latency or CPU crossing threshold.*
3. **Writes grow / a tenant gets huge:** partition by **tenant** (`tenant_id` hash) with per-tenant consistency, or federation — move activity/notifications/search into their own stores keyed by tenant. *Trigger: writes > ~300–500 QPS or one org > ~10% of load.*
4. **Search grows:** extract index to a dedicated engine fed by the same event stream; tenant filter on every query retained by contract. *Trigger: corpus > ~50M docs or relevance complaints.*
5. **Realtime grows (> ~100k concurrent):** dedicated WS tier + presence/state service; SSE per-org as a lighter shape.
6. **Isolation demanded (regulated tenant):** bridge → silo migration per-tenant with a data-copy and cutover; the rest of the design unchanged.

**Signals to watch** (not guesses): Postgres write latency & replica lag · cache hit rate · queue oldest-job age · WS connections/node · search-index lag · egress $ · p99 per endpoint (SLO burn alerts).

---

## 9. Open Questions / Deferred

- **Payments provider** and exact tier limits (Free < Pro < Business) — meters are instrumented; the price ladder is product, not architecture.
- **Mobile push** — deferred with mobile; the notifications table is ready for a FCM/APNs transport job.
- **Presence/typing** — realtime infra supports it; deliberately out of scope v1.
- **Outbox hardening** — scaffold enqueues after commit; production adds a transactional outbox/CDC for exactly-once-ish event emission.
- **Dedicated search engine** adoption timing — revisit at corpus scale.

---

## § Fill-in Gate

- [x] Every §6 row has a non-empty *Worsens* and a named breaking point.
- [x] §2 estimates carry units, assumptions, and state what the numbers force.
- [x] §7 names a degradation path per critical dependency (not just "retry").
- [x] Every §4 component maps to a requirement/number in §1–§2.
- [x] Coverage sweep: media/blobs ✓, IDs ✓ (UUIDv7), search ✓ (FTS v1 + ladder), logs/audit ✓, SLOs ✓, counters ✓ (usage meter in Postgres — fine at this write rate; `sharded-counters` explicitly *not* needed), DNS/CDN ✓ (edge, simple), high-volume log shipping ✓ (structured logs + 12-month retention; dedicated pipeline deferred — log volume is modest).
- [x] Tenant isolation is a hard invariant enforced at two layers (app filter + RLS).
- [x] Every async path has a degradation story (WS → polling catch-up, cache miss → Postgres, limiter down → local bucket).
- [x] The design degrades gracefully — stale beats error everywhere except tenant-boundary checks.

---

## § Quality Score & Diagnosis — *Score & Diagnose*

### Design Quality Bar

| Dimension | Score | Rationale |
|---|---|---|
| **Requirements** | ★★★★☆ | Clear functional + non-functional; quantified scale; real out-of-scope |
| **Scale estimates** | ★★★★☆ | BOTEC done correctly; numbers drive architecture choices; conservative |
| **High-level design** | ★★★★☆ | Clean separation; every component earns its place; single source of truth |
| **Data model** | ★★★★★ | tenant_id on every table + RLS defense-in-depth; UUIDv7; access-pattern-driven indexes |
| **API contract** | ★★★★☆ | REST/JSON + cursor + idempotency + stable error envelope; tenant resolution from principal |
| **Trade-off analysis** | ★★★★★ | Every decision has solves/worsens/when-to-change; breaking points stated |
| **Failure modes** | ★★★★★ | Per-dependency degradation; stale-beats-error except tenant checks; no "retry" without specifics |
| **Scale evolution** | ★★★★☆ | 6-rung ladder with triggers; each flip is local, not whole-diagram |
| **Observability** | ★★★☆☆ | Mentioned (otel/prom) but not deeply specified — add SLO definitions before production |

**Overall: 4.4 / 5** — the design is strongest where the load-bearing constraint demands it (multi-tenancy enforcement, degradation, trade-offs). Weakest in observability specifics, which are deferred to production hardening.

### Quick Diagnostic (failure-modes check)

| Failure mode | Present? | Antidote applied |
|---|---|---|
| Rushing to solution without clarifying | No | §1 restates the problem, writes 3 lists, confirms assumptions |
| Quantifying too late | No | §2 BOTEC before any component choice |
| Naming a tool without justification | No | §6 every row has solves/worsens/when-to-change |
| Memorizing a diagram | No | Numbers force architecture: 30k DAU → no Kafka, no sharding |
| Ignoring failure modes | No | §7 full table per dependency |
| Making interfaces guesswork | No | §4 has concrete requests/responses; §5 has DDL |
| Treating design as fixed | No | §8 ladder with triggers; §9 open questions |
| Skipping observability | Partial | Mentioned, not fully specified — flagged as gap |

### Weakest Dimension + What Raises It

**Observability** is the weakest dimension. The design correctly wires OpenTelemetry + Prometheus + Grafana + Loki + Jaeger, but does not yet define:

- **SLOs** — e.g. "99.9% of API reads < 250 ms over 30 days"
- **Error budget** — how much slippage before release freeze
- **Alert thresholds** — what triggers a page vs a ticket
- **Trace sample rate** — 1–10% at high QPS to control cost

**Fix:** add an SLO definition per endpoint family in the next iteration. The architecture already supports it — this is instrumentation, not redesign.

### What Would Break the Design (and What Happens)

| Constraint change | Design assumption invalidated | Redesign path |
|---|---|---|
| A tenant demands a private DB | Shared-schema + RLS is sufficient | §6 → bridge/silo; the rest of the diagram is unchanged |
| Writes hit ~300–500 QPS | Single Postgres node handles all writes | §6 → partition by tenant or federate activity/notifications |
| Corpus > ~50M docs | Postgres FTS is sufficient | §6 → dedicated search indexer fed by same events |
| > ~100k concurrent WS | Pub/sub fan-out across 1–3 nodes | §8 → dedicated realtime tier + SSE per-org |
| Multi-region required | Single-region primary is acceptable | §8 → multi-region read replicas; active-active deferred |

The design is a **hypothesis**: it holds until a constraint changes, at which point a *local* seam bends rather than the whole diagram collapsing.
