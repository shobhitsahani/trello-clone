# Requirements — TeamFlow (Multi-Tenant SaaS)

## Functional requirements (core)

### Must-have (MVP for portfolio)
- [ ] **Organization Management** — Create org, invite members, manage org settings, billing/subscription tier
- [ ] **RBAC** — Roles (Owner, Admin, Member, Viewer), per-resource permissions, team-level roles
- [ ] **Team Management** — Create teams, assign members, team-level project access
- [ ] **Projects** — CRUD projects, project settings, project members, archive/restore
- [ ] **Tasks** — CRUD tasks, assignees, statuses, priorities, labels, due dates, subtasks, dependencies
- [ ] **Comments** — Threaded comments on tasks, mentions, reactions, edit/delete
- [ ] **Attachments** — File upload/download, preview, virus scan, CDN delivery
- [ ] **Activity Feeds** — Org/team/project-level activity streams, real-time updates
- [ ] **Notifications** — In-app, email, push; preferences; batching; real-time via WebSocket
- [ ] **WebSockets** — Real-time presence, typing indicators, live updates for tasks/comments
- [ ] **Webhooks** — Outgoing webhooks for task/project/org events, retry with backoff, signing
- [ ] **API Keys** — Scoped API keys per org, rate limiting, rotation, audit
- [ ] **Subscription Tiers** — Free/Pro/Enterprise, usage limits (seats, storage, API calls), Stripe integration
- [ ] **Audit Logs** — Immutable event log for compliance, queryable, retention policies
- [ ] **Soft Deletion** — Trash/restore for all entities, 30-day retention, purge job
- [ ] **Full-Text Search** — Search across tasks, comments, projects; autocomplete; filters

### Deferred (v2+)
- [ ] AI-powered task triage / summarization
- [ ] Custom workflows / automation rules
- [ ] Time tracking / reporting
- [ ] Mobile push notifications (native)
- [ ] SSO / SAML / OIDC
- [ ] Multi-region deployment
- [ ] Advanced analytics dashboard

## Non-functional requirements

| Requirement | Target | Notes |
|---|---|---|
| **Scale (DAU)** | 50,000 | 500 orgs × 100 users avg; 3× peak factor |
| **Scale (MAU)** | 150,000 | |
| **Growth (12mo)** | 10× | Design for 500K DAU headroom |
| **Read:Write ratio** | 90:10 | Read-heavy (feeds, lists, search) |
| **Latency (p99)** | < 200ms | API reads; writes < 500ms; WebSocket < 100ms |
| **Availability** | 99.95% | ~4.4 min/month downtime budget |
| **Consistency** | Mixed | Strong: org/auth/rbac/billing; Eventual: feeds/notifications/search index |
| **Durability** | RPO < 1s, RTO < 5min | PostgreSQL sync replication; S3 for blobs |
| **Multi-tenancy** | Row-level isolation | Every query scoped by `tenant_id` (org_id) |
| **Security** | SOC2-ready | Encryption at rest (AES-256), in transit (TLS 1.3), PII handling |
| **Data residency** | Single region (US-East) | Multi-region out of scope for v1 |

## Out of scope (explicit)
- Multi-region active-active (single region with DR)
- SSO/SAML (email/password + OAuth only)
- Native mobile apps (responsive web only)
- Advanced AI features (placeholder only)
- Custom workflow engine (linear workflow only)
- Time tracking / invoicing
- White-labeling / custom domains
- On-premise deployment

## Assumptions
- B2B SaaS: organizations are the tenant boundary; users belong to one org (multi-org via separate accounts)
- Average org: 50 users, 10 teams, 20 projects, 500 tasks
- Attachments: 10% of tasks have files, avg 2MB each → blob storage
- Webhooks: 5 per org avg, 10 events/sec peak per org
- Search: 5% of actions trigger search, index lag < 5s acceptable
- Audit logs: 100 events/user/day → 5M events/day at scale
- Background jobs: 20% of writes spawn async work (email, webhook, search index)
- WebSocket connections: 80% of online users, ~40K concurrent at peak

## Key numbers (→ back-of-the-envelope)

| Metric | Value | Calculation |
|---|---|---|
| **Peak read QPS** | ~1,500 | 50K DAU × 100 actions × 0.9 read / 86.4K × 3 peak |
| **Peak write QPS** | ~170 | 50K DAU × 100 actions × 0.1 write / 86.4K × 3 peak |
| **Storage/day** | ~1.5 GB | Writes × 2KB + attachments (150MB) |
| **Storage/year (10yr)** | ~5.5 TB | Including blob storage |
| **Bandwidth (peak)** | ~350 KB/s | Read payload dominates |
| **Working set (hot)** | ~50 GB | Active orgs, recent tasks, search indexes |
| **WebSocket concurrent** | ~40K | 80% of peak online users |
| **Audit log events/day** | ~5M | 100 events/user/day |
| **Search index size** | ~500 GB | Tasks + comments + projects |

---
### Validation
- [x] At least one item is in Out of scope
- [x] Every non-functional requirement has a number
- [x] Assumptions are written down
- [x] Core features are focused (15 MVP, 8 deferred)