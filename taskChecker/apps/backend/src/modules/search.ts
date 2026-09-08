/** Full-text search over tasks + comments (Postgres tsvector + GIN).
 * v1 decision (docs §6): no separate search cluster — RLS and the tenant filter
 * apply to search *by construction*, since the vectors live in the tenant rows.
 * Ranking: ts_rank_cd over websearch_to_tsquery (BM25-ish, explainable). */
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { inTenant } from "../lib/request.js";
import { badRequest } from "../lib/errors.js";
import { parseLimit } from "../lib/cursor.js";
import { recordUsage } from "../lib/usage.js";

export const searchRoutes = new Hono();

// GET /v1/search?q=&type=task|comment|all&limit=
searchRoutes.get("/search", async (c) => {
  const p = c.get("principal");
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2) throw badRequest("q must be at least 2 characters.");
  const type = (c.req.query("type") ?? "all") as "task" | "comment" | "all";
  const limit = parseLimit(c.req.query("limit"), 50, 20);

  const rows = await inTenant(c, async (tx) => {
    const wantTasks = type === "task" || type === "all";
    const wantComments = type === "comment" || type === "all";
    const rank = sql<number>`ts_rank_cd(t.search_vector, websearch_to_tsquery('english', ${q}))`;
    const taskRows = wantTasks
      ? await tx.execute(sql`
          select 'task' as type, t.id::text as id, t.title as title,
                 t.status::text as status, t.project_id::text as project_id,
                 ${rank} as score,
                 ts_headline('english', t.title || ' ' || t.description,
                             websearch_to_tsquery('english', ${q}),
                             'StartSel=<mark>,StopSel=</mark>,MaxFragments=2') as snippet
          from tasks t
          where t.tenant_id = ${p.tenantId} and t.deleted_at is null
            and t.search_vector @@ websearch_to_tsquery('english', ${q})
          order by score desc, t.created_at desc
          limit ${limit}
        `)
      : [];
    const commentRows = wantComments
      ? await tx.execute(sql`
          select 'comment' as type, cm.id::text as id, cm.task_id::text as task_id,
                 cm.author_id::text as author_id,
                 ts_rank_cd(cm.search_vector, websearch_to_tsquery('english', ${q})) as score,
                 ts_headline('english', cm.body, websearch_to_tsquery('english', ${q}),
                             'StartSel=<mark>,StopSel=</mark>,MaxFragments=1') as snippet
          from comments cm
          where cm.tenant_id = ${p.tenantId} and cm.deleted_at is null
            and cm.search_vector @@ websearch_to_tsquery('english', ${q})
          order by score desc, cm.created_at desc
          limit ${limit}
        `)
      : [];
    return [...taskRows, ...commentRows];
  });

  recordUsage(p.tenantId, "searches", 1);
  return c.json({ query: q, results: rows });
});