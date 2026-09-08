# TeamFlow — Requirements

## Restated Prompt
A multi-tenant SaaS project and workflow management platform (simplified Linear + Jira + Slack) where organizations manage users, teams, projects, tasks, comments, and activity feeds with RBAC, invitations, and real-time updates.

---

## Functional Requirements (Core + Essential SaaS)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | **Organization Management** — Create, read, update, soft-delete organizations | P0 |
| FR-2 | **User Management** — Users belong to organizations; authentication (email/password, OAuth) | P0 |
| FR-3 | **Invitations** — Invite users to org via email; accept/revoke; expiry | P0 |
| FR-4 | **RBAC** — Roles: Owner, Admin, Member, Viewer; permissions per resource type | P0 |
| FR-5 | **Team Management** — Create teams within org; assign users; team-level permissions | P0 |
| FR-6 | **Project Management** — CRUD projects; project members; project settings | P0 |
| FR-7 | **Task Management** — CRUD tasks; status workflow (Todo/In Progress/Done); assignee; labels; priority; due dates | P0 |
| FR-8 | **Comments** — Threaded comments on tasks; mentions; reactions | P0 |
| FR-9 | **Activity Feed** — Real-time org/project/task activity; pagination; filtering | P0 |
| FR-10 | **Attachments** — File upload to tasks/comments; presigned URLs; metadata | P1 |
| FR-11 | **Notifications** — In-app + email; preferences; real-time via WebSocket | P1 |
| FR-12 | **Webhooks** — Outgoing HTTP callbacks for org events; retry with backoff | P1 |
| FR-13 | **API Keys** — Org-scoped keys for integrations; rate limits; scopes | P1 |
| FR-14 | **Usage Limits & Subscription Tiers** — Free/Pro/Enterprise; enforce limits (users, projects, storage, API calls) | P1 |
| FR-15 | **Audit Logs** — Immutable log of sensitive actions; retention; export | P1 |
| FR-16 | **Soft Deletion** — All entities soft-deleted; restore; purge after retention | P0 |
| FR-17 | **Full-Text Search** — Search tasks, comments, projects; faceted filters | P1 |

---

## Non-Functional Requirements

| Category | Target | Rationale |
|----------|--------|-----------|
| **Scale** | 100 orgs, ≤50 users/org (5,000 total), 2,500 DAU | Small B2B SaaS start |
| **Peak QPS** | ~1.2 QPS (read + write) | 70:30 read/write, 20 actions/user/day |
| **Storage (7 yr)** | ~80 GB | 15K writes/day × 2KB × 2,555 days |
| **Latency (p99)** | < 100 ms | High-perf feel like Linear |
| **Availability** | 99.95% (~4.4 min/month downtime) | Standard B2B SLA |
| **Consistency** | Read-your-writes; strong for mutations | Collaboration requires fresh data |
| **Durability** | Zero data loss on single-node failure | PostgreSQL WAL + replication |
| **Multi-tenancy** | Strict tenant isolation; no cross-org leaks | SaaS requirement |
| **Real-time** | < 500 ms push latency for notifications/activity | Live collaboration feel |

---

## Out of Scope (Explicit)

- Multi-region deployment (single region for MVP)
- Advanced workflow automation (rules, triggers)
- Custom fields / custom workflows per project
- Time tracking / estimates / burndown charts
- Mobile apps (web-responsive only)
- SSO/SAML (OAuth only for MVP)
- Granular field-level permissions
- Data import/export (CSV, Jira, etc.)
- Marketplace / third-party app framework
- AI features (summarization, auto-triaging)

---

## Assumptions

1. **Single region** (us-east-1 or equivalent) for MVP; multi-region is Phase 2
2. **PostgreSQL** as primary store — single writer node handles 1k QPS; we need ~1 QPS
3. **Redis** for cache, sessions, pub/sub, job queue — single node or managed
4. **Modular monolith** — clean domain boundaries, no network hops between domains
5. **Row-level security (RLS)** in PostgreSQL for tenant isolation
6. **TLS everywhere** — external and internal (mTLS not required for MVP)
7. **Observability** — structured logs, metrics, traces from day one