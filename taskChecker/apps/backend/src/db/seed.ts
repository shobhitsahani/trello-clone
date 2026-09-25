/** Seed: two orgs with demo users/teams/projects/tasks to demonstrate tenant
 * isolation at the data level (same seed shape, disjoint rows per tenant).
 *
 *   bun run db:seed
 */
import { and, eq } from "drizzle-orm";
import { db, sql } from "./client.js";
import { hashPassword } from "../lib/password.js";
import { uuidv7 } from "../lib/ids.js";
import {
  activityEvents,
  comments,
  memberships,
  projects,
  tasks,
  teams,
  tenants,
  users,
} from "./schema.js";
import { withTenant } from "../lib/tenant.js";

interface SeedUser {
  email: string;
  name: string;
}

const PASSWORD = "password123"; // dev only — never ship real creds

async function seedUser(u: SeedUser): Promise<string> {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, u.email)).limit(1);
  if (existing[0]) return existing[0].id;
  const id = uuidv7();
  await db.insert(users).values({ id, email: u.email, name: u.name, passwordHash: hashPassword(PASSWORD) });
  return id;
}

async function seedOrg(opts: { slug: string; name: string; owner: SeedUser; members: SeedUser[] }) {
  const existingTenant = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, opts.slug)).limit(1);
  const tenantId = existingTenant[0]?.id ?? uuidv7();
  if (!existingTenant[0]) {
    await db.insert(tenants).values({ id: tenantId, name: opts.name, slug: opts.slug, plan: "free" });
  }

  const ownerId = await seedUser(opts.owner);
  await withTenant(tenantId, async (tx) => {
    const existingMem = await tx
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(eq(memberships.userId, ownerId))
      .limit(1);
    if (!existingMem[0]) {
      await tx.insert(memberships).values({ tenantId, userId: ownerId, role: "owner", status: "active" });
    }

    for (const m of opts.members) {
      const mid = await seedUser(m);
      const has = await tx.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.userId, mid)).limit(1);
      if (!has[0]) {
        await tx.insert(memberships).values({ tenantId, userId: mid, role: "member", status: "active" });
      }
    }

    // Idempotent re-runs: reuse the demo team/project when they already exist
    // (fresh uuids every run would violate the per-tenant key uniqueness).
    const teamName = `${opts.name} Core`;
    const existingTeam = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.tenantId, tenantId), eq(teams.name, teamName)))
      .limit(1);
    const teamId = existingTeam[0]?.id ?? uuidv7();
    if (!existingTeam[0]) {
      await tx.insert(teams).values({ tenantId, id: teamId, name: teamName });
    }

    const existingProject = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.tenantId, tenantId), eq(projects.key, "LAU")))
      .limit(1);
    // Demo tasks/comments/activity are seeded once alongside a fresh project —
    // re-runs reuse the rows instead of duplicating them.
    const freshProject = !existingProject[0];
    const projectId = existingProject[0]?.id ?? uuidv7();
    if (freshProject) {
      await tx.insert(projects).values({ tenantId, id: projectId, teamId, name: "Launch", key: "LAU" });
    }

    if (freshProject) {
      const t1 = uuidv7();
      await tx.insert(tasks).values({
        tenantId,
        id: t1,
        projectId,
        title: "Design the onboarding flow",
        description: "First-run experience for new orgs",
        status: "in_progress",
        priority: "high",
        assigneeId: opts.members[0] ? undefined : ownerId,
        reporterId: ownerId,
      });
      const t2 = uuidv7();
      await tx.insert(tasks).values({
        tenantId,
        id: t2,
        projectId,
        title: "Set up webhooks for task events",
        description: "Deliver task.created to subscribers",
        status: "backlog",
        priority: "medium",
        assigneeId: ownerId,
        reporterId: ownerId,
      });

      if (opts.members[0]) {
        const memberId = await seedUser(opts.members[0]);
        await tx.insert(comments).values({
          tenantId,
          id: uuidv7(),
          taskId: t2,
          authorId: memberId,
          body: `Tracking this for ${opts.name} — looks great.`,
        });
      }

      await tx.insert(activityEvents).values({
        tenantId,
        id: uuidv7(),
        actorId: ownerId,
        entityType: "task",
        entityId: t1,
        action: "created",
        meta: { title: "Design the onboarding flow" },
      });
    }
  });

  console.log(`seeded org: ${opts.slug} (tenant_id=${tenantId})`);
  return tenantId;
}

async function main() {
  await seedOrg({
    slug: "acme",
    name: "Acme Inc",
    owner: { email: "alice@acme.io", name: "Alice Owns" },
    members: [{ email: "bob@acme.io", name: "Bob Member" }],
  });
  await seedOrg({
    slug: "globex",
    name: "Globex Corp",
    owner: { email: "carol@globex.io", name: "Carol Owns" },
    members: [{ email: "dave@globex.io", name: "Dave Member" }],
  });
  console.log(`demo password for all seeded users: ${PASSWORD}`);
  await sql.end();
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});