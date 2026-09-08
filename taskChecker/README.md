# TeamFlow — Multi-Tenant Project & Workflow SaaS

Simplified Linear + Jira + Slack integrations. Monorepo:

- `apps/backend` — Hono API. Postgres (shared schema + **RLS**) + Redis + BullMQ. See [apps/backend/README.md](apps/backend/README.md).
- `packages/*` — shared TS/ESLint/UI configs.

## The load-bearing feature: tenant isolation

```
Organization A                Organization B
├── Users                     ├── Users
├── Teams                     ├── Teams
├── Projects                  ├── Projects
└── Tasks                     └── Tasks
```

Every tenant-owned row carries `tenant_id`. Defense in depth:

1. **Composite keys** — tenant tables keyed `(tenant_id, id)`; FKs carry `tenant_id`, so cross-tenant references are impossible *by constraint*.
2. **Query scoping** — every handler opens `withTenant()`: `SET LOCAL app.tenant_id` inside a request-scoped tx.
3. **Postgres RLS** — policies filter/validate rows against `app.tenant_id`. No tenant context ⇒ zero rows on read, rejected writes. App connects as non-superuser so RLS actually applies.

## Quickstart

```sh
cd apps/backend
docker compose up -d        # Postgres + Redis + MinIO
bun install
bun run db:migrate          # schema + RLS policies
bun run db:seed             # 2 demo orgs (acme / globex, password: password123)
bun run dev                 # API on :3001
bun test                    # unit tests (no infra needed)
bun run test:integration    # tenant-isolation e2e suite (needs stack up)
```

## Design docsSee `docs/design/` � requirements, architecture, data model, API design,
scale estimates, resilience/observability, and the scale-evolution ladder.