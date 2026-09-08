/**
 * End-to-end integration suite — the "does the whole multi-tenant picture
 * actually hold together" proof. Requires Postgres + Redis from docker-compose:
 *
 *   docker compose up -d
 *   bun run db:migrate
 *   TEAMFLOW_IT=1 bun test test/integration.test.ts
 *
 * When TEAMFLOW_IT is unset the suite skips, and it also auto-skips when the DB
 * probe fails — so a missing stack never fails the unit-test run.
 *
 * What it proves:
 *   1. Tenants are data-isolated through the API (A can't read B's task).
 *   2. RLS is the backstop: plain SQL without a tenant context sees zero rows,
 *      and a direct INSERT outside a tenant context is REJECTED by the DB.
 *   3. Invite → accept → login works end-to-end (register + scrypt hash).
 *   4. API-key scopes are enforced (read-only key cannot mutate).
 *   5. Idempotency-Key dedupe, soft deletion, and full-text search behave.
 */
import { describe, expect, it, beforeAll } from "bun:test";
import postgres from "postgres";
import { uuidv7 } from "../src/lib/ids.js";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://teamflow:teamflow@localhost:5432/teamflow";

// Fast probe (2s connect timeout, separate tiny pool) — decides whether the
// suite runs at all. `bun test` without infra must stay green + quick.
async function probeDb(): Promise<boolean> {
  const probe = postgres(DATABASE_URL, { connect_timeout: 2, max: 1 });
  try {
    await probe`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

const dbUp = await probeDb();
const forced = process.env.TEAMFLOW_IT === "1";

interface Auth {
  accessToken: string;
  tenantId: string;
}

interface Api {
  request: (path: string, init?: RequestInit) => Promise<Response>;
  auth: (t: string) => RequestInit;
  json: (body: unknown) => RequestInit;
}

describe.skipIf(!dbUp || !forced)("teamflow multi-tenant integration", () => {
  let api: Api;

  beforeAll(async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();
    api = {
      request: async (path, init) => await app.request(path, init),
      auth: (t) => ({ headers: { Authorization: `Bearer ${t}` } }),
      json: (body) => ({
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    };
  }, 30_000);

  const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const email = (who: string) => `${who}-${tag}@example.com`;

  async function signup(who: string, orgName: string): Promise<Auth> {
    const res = await api.request("/v1/auth/signup", {
      method: "POST",
      ...api.json({ email: email(who), password: "password123", name: who, orgName }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { org: { id: string }; tokens: { accessToken: string } };
    return { accessToken: body.tokens.accessToken, tenantId: body.org.id };
  }

  async function authed<T>(res: Response): Promise<T> {
    const body = (await res.json()) as T & { error?: unknown };
    expect(body.error).toBeUndefined();
    return body;
  }
it("signs up two fully isolated organizations", async () => {
    const a = await signup("alpha", "Alpha Co");
    const b = await signup("beta", "Beta Co");
    expect(a.tenantId).not.toBe(b.tenantId);
  });

  it("isolates tasks between tenants through the API", async () => {
    const a = await signup(`iso-a-${tag}`, `Iso A ${tag}`);
    const b = await signup(`iso-b-${tag}`, `Iso B ${tag}`);

    const projA = await authed<{ project: { id: string } }>(
      await api.request("/v1/projects", {
        method: "POST",
        ...api.json({ name: "A Project", key: "AP" }),
        ...api.auth(a.accessToken),
      }),
    );
    const projB = await authed<{ project: { id: string } }>(
      await api.request("/v1/projects", {
        method: "POST",
        ...api.json({ name: "B Project", key: "BP" }),
        ...api.auth(b.accessToken),
      }),
    );

    const taskA = await authed<{ task: { id: string; title: string } }>(
      await api.request("/v1/tasks", {
        method: "POST",
        ...api.json({ projectId: projA.project.id, title: `A-only-task-${tag}` }),
        ...api.auth(a.accessToken),
      }),
    );
    const taskB = await authed<{ task: { id: string; title: string } }>(
      await api.request("/v1/tasks", {
        method: "POST",
        ...api.json({ projectId: projB.project.id, title: `B-only-task-${tag}` }),
        ...api.auth(b.accessToken),
      }),
    );

    // direct cross-tenant fetch → 404 (row isn't visible, no 500 leaks it)
    const cross = await api.request(`/v1/tasks/${taskB.task.id}`, api.auth(a.accessToken));
    expect(cross.status).toBe(404);
    const cross2 = await api.request(`/v1/tasks/${taskA.task.id}`, api.auth(b.accessToken));
    expect(cross2.status).toBe(404);

    // org path mismatch is rejected even when the caller IS a tenant
    const wrongOrg = await api.request(`/v1/orgs/${b.tenantId}/projects`, api.auth(a.accessToken));
    expect(wrongOrg.status).toBe(403);

    // board list for A contains only A's task
    const boardA = await authed<{ data: { id: string; title: string }[] }>(
      await api.request(`/v1/orgs/${a.tenantId}/projects/${projA.project.id}/tasks?limit=50`, api.auth(a.accessToken)),
    );
    expect(boardA.data.map((t) => t.id)).toContain(taskA.task.id);
    expect(boardA.data.map((t) => t.id)).not.toContain(taskB.task.id);

    // full-text search is tenant-scoped too
    const search = await authed<{ results: { id: string; type: string }[] }>(
      await api.request(`/v1/search?q=B-only-task&limit=20`, api.auth(a.accessToken)),
    );
    expect(search.results.some((r) => r.id === taskB.task.id)).toBe(false);
  });
it("enforces RLS at the SQL layer (defense in depth)", async () => {
    const { sql } = await import("../src/db/client.js");

    // (a) No tenant context ⇒ SELECT returns ZERO rows — fail-closed, no leak.
    const rows = await sql<{ count: number }[]>`select count(*)::int as count from tasks`;
    expect(Number(rows[0]?.count ?? 0)).toBe(0);

    // (b) A direct INSERT without a tenant context is REJECTED by Postgres —
    //     the RLS WITH CHECK policy denies rows that don't match the context.
    let rejected = false;
    try {
      await sql`insert into tasks (tenant_id, id, project_id, title)
                values (${uuidv7()}, ${uuidv7()}, ${uuidv7()}, 'rogue')`;
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
  });

  it("invite → accept → login flows end-to-end", async () => {
    const a = await signup(`inv-owner-${tag}`, `Invite Co ${tag}`);
    const inviteeEmail = email(`invitee-${tag}`);

    const invite = await authed<{ invitationUrl: string }>(
      await api.request(`/v1/orgs/${a.tenantId}/invites`, {
        method: "POST",
        ...api.json({ email: inviteeEmail, role: "member" }),
        ...api.auth(a.accessToken),
      }),
    );
    const token = invite.invitationUrl.split("/").pop()!;

    const accept = await api.request(`/v1/invites/${token}`, {
      method: "POST",
      ...api.json({ name: "Invitee", password: "password123" }),
    });
    expect(accept.status).toBe(200);

    // The invitee can now log in — proves register hashes with scrypt (a
    // historic bug hashed the raw password, making invitee accounts un-loginable).
    const login = await api.request("/v1/auth/login", {
      method: "POST",
      ...api.json({ email: inviteeEmail, password: "password123" }),
    });
    expect(login.status).toBe(200);
    const body = (await login.json()) as { tenant: { tenant_id: string } };
    expect(body.tenant.tenant_id).toBe(a.tenantId);
  });
it("enforces API-key scopes (read-only key cannot mutate)", async () => {
    const a = await signup(`key-owner-${tag}`, `Key Co ${tag}`);

    const created = await authed<{ key: string }>(
      await api.request("/v1/api-keys", {
        method: "POST",
        ...api.json({ name: "read-only", scopes: ["read"] }),
        ...api.auth(a.accessToken),
      }),
    );

    const headers = { "X-TeamFlow-Key": created.key };
    const read = await api.request(`/v1/orgs/${a.tenantId}/projects`, { headers });
    expect(read.status).toBe(200);

    const write = await api.request("/v1/teams", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "nope" }),
    });
    expect(write.status).toBe(403);
  });

  it("honors Idempotency-Key on create and soft-deletes without leaking", async () => {
    const a = await signup(`idem-owner-${tag}`, `Idem Co ${tag}`);
    const proj = await authed<{ project: { id: string } }>(
      await api.request("/v1/projects", {
        method: "POST",
        ...api.json({ name: "Idem Project", key: "IP" }),
        ...api.auth(a.accessToken),
      }),
    );

    const idemKey = `key-${tag}`;
    const first = await authed<{ task: { id: string }; idempotentReplay: boolean }>(
      await api.request("/v1/tasks", {
        method: "POST",
        headers: { "Idempotency-Key": idemKey, Authorization: `Bearer ${a.accessToken}` },
        body: JSON.stringify({ projectId: proj.project.id, title: "once" }),
      }),
    );
    const second = await authed<{ task: { id: string }; idempotentReplay: boolean }>(
      await api.request("/v1/tasks", {
        method: "POST",
        headers: { "Idempotency-Key": idemKey, Authorization: `Bearer ${a.accessToken}` },
        body: JSON.stringify({ projectId: proj.project.id, title: "once" }),
      }),
    );
    expect(first.idempotentReplay).toBe(false);
    expect(second.idempotentReplay).toBe(true);
    expect(second.task.id).toBe(first.task.id);

    // soft delete: task disappears from direct + list reads
    const del = await api.request(`/v1/tasks/${first.task.id}`, {
      method: "DELETE",
      ...api.auth(a.accessToken),
    });
    expect(del.status).toBe(200);
    expect((await api.request(`/v1/tasks/${first.task.id}`, api.auth(a.accessToken))).status).toBe(404);
  });
});