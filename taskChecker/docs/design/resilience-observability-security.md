# TeamFlow — Resilience, Observability & Security

---

## Resilience & Failure Handling

### Retry Policy (Client-Side Guidance)

| Error Class | Retry? | Backoff | Max Retries |
|-------------|--------|---------|-------------|
| 429 Rate Limited | Yes | `Retry-After` header + jitter | 5 |
| 5xx Server Error | Yes | Exponential (100ms, 200ms, 400ms...) + jitter | 3 |
| 408/504 Timeout | Yes | Exponential + jitter | 3 |
| 4xx (except 429) | No | — | 0 |
| Network error | Yes | Exponential + jitter | 3 |

**Jitter:** Full jitter (random 0 to calculated backoff).

### Server-Side Resilience Patterns

#### Circuit Breaker (Per Downstream Dependency)
- **Applied to:** External APIs (email provider, S3, OAuth providers)
- **State machine:** Closed → Open (after 5 failures in 10s) → Half-Open (test request after 30s)
- **Metrics:** Failure rate, latency p99, open/closed transitions
- **Library:** `opossum` or similar

#### Bulkhead (Resource Isolation)
- **Thread pool / connection pool per external dependency**
- Email: max 10 concurrent
- S3: max 20 concurrent
- Webhooks: max 50 concurrent (separate queue)
- Prevents one slow dependency from starving others

#### Timeouts (Enforced at Gateway + Service)
| Operation | Timeout |
|-----------|---------|
| HTTP request (gateway) | 30s |
| Database query | 10s (statement_timeout) |
| Redis command | 500ms |
| External API call | 10s |
| WebSocket message | 5s |

#### Rate Limiting (Multi-Layer)
1. **Edge (ALB):** IP-based, generous (1000/min) — DDoS protection
2. **Gateway:** Per organization (by plan), per user, per API key
3. **Service:** Per endpoint (e.g., `/auth/login` stricter)
4. **Database:** `statement_timeout` + connection pool limits

**Rate limit headers:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After` on 429.

#### Graceful Degradation
| Component Fails | Degraded Behavior |
|-----------------|-------------------|
| Redis (cache) | Bypass cache, direct DB reads (slower but works) |
| Redis (queue) | Jobs accumulate in DB outbox table, processed when Redis recovers |
| Redis (Pub/Sub) | WebSocket falls back to polling (long-poll endpoint) |
| Email provider | Queue emails locally, retry; show "email delayed" in UI |
| S3/GCS | Presign fails → return error, client retries |
| Read replica | Route reads to primary (higher latency, still works) |

#### Database Resilience
- **Primary + 1 synchronous read replica** (same AZ) — zero data loss on primary failure
- **Automatic failover** (managed service: RDS, Cloud SQL) — < 60s failover
- **Connection pooling (PgBouncer)** — absorbs connection spikes
- **Statement timeout** — prevents runaway queries
- **Idle transaction timeout** — prevents abandoned transactions

#### WebSocket Resilience
- **Heartbeat:** Client ping every 25s, server pong (detects dead connections)
- **Reconnection:** Client exponential backoff (1s, 2s, 4s, 8s, max 30s) + jitter
- **Connection limits:** Per org (by plan), per IP (10)
- **Graceful drain:** On deploy, stop accepting new connections, wait 30s for in-flight, then terminate

#### Idempotency (Replay Safety)
- All mutating POST/PATCH require `Idempotency-Key`
- Key stored in Redis with 24h TTL: `idem:{org_id}:{endpoint}:{key}` → `{ status, response, body_hash }`
- On retry: compare body hash; mismatch → 422; match → return stored response

---

## Observability

### Three Pillars

#### Metrics (Prometheus Format)
**Infrastructure:**
- `process_cpu_seconds_total`, `process_resident_memory_bytes`, `nodejs_eventloop_lag_seconds`
- `http_requests_total{method,path,status}`, `http_request_duration_seconds{method,path}`
- `db_connections_active`, `db_query_duration_seconds{query_type}`
- `redis_commands_total{cmd}`, `redis_latency_seconds`
- `ws_connections_active{org_id}`, `ws_messages_total{direction,type}`

**Business:**
- `org_active_users{daily|weekly|monthly}`
- `tasks_created_total{org_id,project_id,status}`
- `invitations_sent_total{org_id}`, `invitations_accepted_total{org_id}`
- `webhook_deliveries_total{org_id,status}`, `webhook_delivery_latency_seconds`
- `api_key_usage_total{org_id,scope}`
- `subscription_usage{org_id,metric}` (gauges)
- `errors_total{module,code}`

**SLOs (Alert on Burn Rate):**
| SLO | Target | Alert Window |
|-----|--------|--------------|
| API Availability | 99.95% | 5m burn rate > 2% |
| API Latency p99 | < 100ms | 5m p99 > 200ms |
| WebSocket Availability | 99.9% | 5m disconnect rate > 1% |
| Webhook Delivery Success | 99% | 1h success rate < 99% |
| Background Job Lag | < 60s | max lag > 300s |

#### Structured Logging (JSON)
**Every log line:**
```json
{
  "timestamp": "2024-01-15T10:30:00.123Z",
  "level": "info",
  "request_id": "req_abc123",
  "correlation_id": "corr_xyz789",
  "user_id": "user_123",
  "organization_id": "org_456",
  "module": "tasks",
  "message": "Task created",
  "duration_ms": 45,
  "metadata": { "task_id": "task_789", "project_id": "proj_123" }
}
```

**Log levels:**
- `error`: Unhandled exceptions, failed external calls, DB errors
- `warn`: Rate limit hit, circuit breaker open, slow query (>1s), retry attempts
- `info`: Request start/end, business events (task created, user invited)
- `debug`: Query params, cache hits/misses, event bus emissions

**Sampling:** Debug logs sampled at 10% in production.

#### Distributed Tracing (OpenTelemetry)
- **Trace context:** W3C `traceparent` header propagated through all calls
- **Spans:** HTTP request, DB query, Redis command, external API call, job processing
- **Attributes:** `http.method`, `http.route`, `http.status_code`, `db.statement`, `messaging.system`
- **Sampling:** 100% for errors, 10% for success (adjustable)
- **Export:** OTLP to Jaeger/Tempo/Datadog

**Correlation ID:** Generated at gateway, returned in `X-Correlation-ID` response header, included in all logs/spans.

---

### Health Checks

| Endpoint | Checks | Used By |
|----------|--------|---------|
| `GET /health/live` | Process alive | Kubernetes liveness probe |
| `GET /health/ready` | DB reachable, Redis reachable, migrations current | Kubernetes readiness probe, ALB |
| `GET /health/startup` | Same as ready + cache warm | Kubernetes startup probe |

**Response:**
```json
{
  "status": "healthy",
  "checks": {
    "database": { "status": "healthy", "latency_ms": 2 },
    "redis": { "status": "healthy", "latency_ms": 1 },
    "migrations": { "status": "healthy", "pending": 0 }
  },
  "version": "1.2.3",
  "commit": "abc123"
}
```

---

### Alerting Rules (Critical)

| Alert | Condition | Severity | Runbook |
|-------|-----------|----------|---------|
| HighErrorRate | `rate(http_requests_total{status=~"5.."}[5m]) > 0.05` | Critical | Check logs, recent deploy |
| HighLatency | `histogram_quantile(0.99, http_request_duration_seconds) > 0.2` | Critical | Check DB, external deps |
| DatabaseDown | `up{job="postgres"} == 0` | Critical | Check RDS/Cloud SQL |
| RedisDown | `up{job="redis"} == 0` | Critical | Check ElastiCache/Memorystore |
| WebSocketConnectionsHigh | `ws_connections_active > limit * 0.9` | Warning | Scale pods, check leak |
| JobQueueLag | `max(job_queue_lag_seconds) > 300` | Warning | Scale workers, check errors |
| WebhookFailureRate | `rate(webhook_deliveries_total{status="failed"}[1h]) > 0.01` | Warning | Check target URLs, DLQ |
| DiskSpaceLow | `disk_free_bytes / disk_total_bytes < 0.15` | Warning | Cleanup, expand volume |
| CertificateExpiring | `ssl_cert_expiry_days < 30` | Warning | Rotate cert |

---

## Security

### Authentication & Authorization

**JWT (Access Tokens):**
- Algorithm: RS256 (asymmetric, rotating keys)
- Expiry: 15 minutes
- Claims: `sub` (user_id), `org_id`, `role`, `permissions[]`, `session_id`
- Stored in memory only (not localStorage) — HttpOnly cookie for web, Authorization header for API

**Refresh Tokens:**
- Opaque, 256-bit random, stored hashed in DB
- Expiry: 30 days (rotating on use)
- Rotation: On refresh, issue new access + new refresh, revoke old refresh
- Revocation: On logout, password change, security event, admin action

**API Keys:**
- Prefix `tf_live_` / `tf_test_` for identification
- Stored as SHA-256 hash + prefix (first 12 chars)
- Scopes enforced at gateway middleware
- Expiry enforced; rotation returns new key once

**Session Management:**
- `sessions` table: `id, user_id, refresh_token_hash, user_agent, ip, created_at, last_used_at, revoked_at`
- Max 10 active sessions per user (configurable)
- Concurrent session limit enforced

### Multi-Tenant Isolation (Defense in Depth)

1. **RLS (Database):** Primary enforcement — impossible to query cross-org
2. **Gateway Middleware:** Validates `org_id` in JWT matches requested resource
3. **Service Layer:** All queries scoped to `organization_id` from context
4. **API Keys:** Scoped to single organization
5. **WebSocket Channels:** Prefixed with `org:{org_id}` — cannot subscribe cross-org

### Data Protection

| Data | Protection |
|------|------------|
| Passwords | Argon2id (memory-hard), cost calibrated to 100ms |
| API Keys | SHA-256 hash + prefix; never logged |
| Webhook Secrets | Encrypted at rest (AES-256-GCM), decrypted only at delivery |
| PII in Logs | Redacted: emails → `us***@example.com`, IPs → last octet masked |
| Encryption in Transit | TLS 1.2+ everywhere (ALB, DB, Redis, S3) |
| Encryption at Rest | Managed service defaults (RDS, Redis, S3 all encrypted) |

### Input Validation & Injection Prevention

- **Zod schemas** for all request bodies, query params, path params
- **Parameterized queries only** — no string interpolation in SQL (Kysely/Prisma)
- **Output encoding** — HTML escape for any user content rendered in web
- **Content Security Policy** — Strict CSP headers
- **File Uploads:** Type validation, size limits (10MB default, 100MB max), virus scan (ClamAV) async

### Security Headers (All Responses)

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss:; frame-ancestors 'none'
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

### CORS Policy

- **Allowed origins:** Configured per environment (exact match, no wildcards)
- **Allowed methods:** GET, POST, PATCH, DELETE, OPTIONS
- **Allowed headers:** Authorization, Content-Type, Idempotency-Key, X-API-Key
- **Exposed headers:** X-RateLimit-*, X-Correlation-ID, Deprecation, Sunset
- **Credentials:** true (for cookie-based auth)

### Audit Logging (Immutable)

All security-relevant actions logged to `audit_logs` table:
- Authentication: login, logout, password change, MFA enable/disable
- Authorization: role changes, member add/remove, permission grants
- Data access: Bulk exports, audit log views
- Configuration: Org settings, webhook changes, API key create/revoke
- Administrative: User impersonation, soft delete/restore, plan changes

**Retention:** 7 years (compliance). Exportable via API (admin only).

### Vulnerability Management

- **Dependency scanning:** `npm audit` + Snyk/GitHub Dependabot in CI
- **Container scanning:** Trivy in CI pipeline
- **SAST:** CodeQL in CI
- **Secrets scanning:** GitLeaks in CI + pre-commit hook
- **Penetration testing:** Annual third-party

---

## Incident Response

### Runbook Template
Every critical alert has a runbook with:
1. **Symptom** — What the alert means in plain language
2. **Impact** — User-facing impact
3. **Diagnosis** — Dashboards to check, queries to run
4. **Mitigation** — Immediate actions (scale, rollback, feature flag)
5. **Resolution** — Root cause fix
6. **Postmortem** — Template link, timeline, action items

### On-Call
- Primary + secondary rotation (weekly)
- Escalation: Primary → Secondary → Engineering Lead
- Runbooks in GitOps repo (accessible offline)

### Postmortem Process
- Blameless, within 5 business days
- Timeline, impact, root cause (5 whys), action items with owners
- Shared company-wide (sanitized)

---

## Backup & Disaster Recovery

| Component | Backup Strategy | RPO | RTO |
|-----------|-----------------|-----|-----|
| PostgreSQL | Automated daily snapshots + continuous WAL archiving (PITR) | < 1s | < 30 min |
| Redis | AOF every 1s + daily RDB snapshot | < 1s | < 15 min |
| Object Storage | Cross-region replication (CRR) | 0 | < 5 min |
| Application Config | GitOps (ArgoCD/Flux) — declarative | 0 | < 10 min |

**DR Drill:** Quarterly failover test to staging environment.