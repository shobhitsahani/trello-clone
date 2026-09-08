/** App assembly — the "API Gateway" concerns (request id, rate limits) plus the
 * mounted modules. Public routes skip auth; everything else requires a
 * principal, and every tenant-scoped handler opens with inTenant(). */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { randomToken } from "./lib/ids.js";
import { authenticate, enforceApiScopes } from "./lib/auth.js";
import { rateLimit } from "./lib/ratelimit.js";
import { errorHandler, notFoundHandler } from "./lib/errors.js";
import { sql } from "./db/client.js";
import { redisHealthy } from "./lib/redis.js";
import { authRoutes } from "./modules/auth.js";
import { orgRoutes } from "./modules/orgs.js";
import { coreRoutes } from "./modules/core.js";
import { taskRoutes } from "./modules/tasks.js";
import { commentRoutes } from "./modules/comments.js";
import { feedRoutes } from "./modules/feed.js";
import { searchRoutes } from "./modules/search.js";
import { govRoutes } from "./modules/governance.js";
import { attachmentRoutes } from "./modules/attachments.js";
import { billingRoutes } from "./modules/billing.js";

const PUBLIC_PATHS = [
  /^\/v1\/auth\/(signup|login|refresh|logout)$/,
  /^\/v1\/invites\/[^/]+$/,
  /^\/livez$/,
  /^\/readyz$/,
];

const RATE_LIMIT = 600; // requests/min per principal
const RATE_WINDOW = 60; // seconds

export function createApp(): Hono {
  const app = new Hono();

  // CORS support for frontend clients
  app.use(
    "*",
    cors({
      origin: (origin) => origin || "*",
      allowHeaders: ["Content-Type", "Authorization", "X-TeamFlow-Signature", "Idempotency-Key", "X-Object-Key", "Upgrade"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      exposeHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "Retry-After"],
      credentials: true,
    }),
  );

  // request id + stable error envelope everywhere
  app.use(async (c, next) => {
    c.set("requestId", randomToken(8));
    await next();
  });

  // root service info
  app.get("/", (c) =>
    c.json({
      service: "teamflow-api",
      status: "running",
      version: "v1",
      endpoints: {
        livez: "/livez",
        readyz: "/readyz",
        auth: "/v1/auth/*",
      },
    }),
  );

  // liveness (process only — dependency checks live in readiness)
  app.get("/livez", (c) => c.json({ ok: true, service: "teamflow-api" }));

  // readiness — dependency probes the LB health-gates on
  app.get("/readyz", async (c) => {
    const pgOk = (await sql`select 1`.catch(() => null)) !== null;
    const redisOk = await redisHealthy();
    return c.json(
      { ok: pgOk && redisOk, checks: { postgres: pgOk ? "up" : "down", redis: redisOk ? "up" : "down" } },
      pgOk && redisOk ? 200 : 503,
    );
  });

  // auth (skips public paths; WS token comes via ?token=)
  app.use("/v1/*", async (c, next) => {
    if (PUBLIC_PATHS.some((re) => re.test(c.req.path))) return next();
    await authenticate(c, next);
  });

  // per-principal rate limit (Redis fixed window, in-memory fallback)
  app.use("/v1/*", async (c, next) => {
    const p = c.get("principal");
    if (!p) return next();
    const result = await rateLimit(`rl:${p.tokenType}:${p.userId || p.tenantId}`, RATE_LIMIT, RATE_WINDOW);
    c.header("X-RateLimit-Limit", String(result.limit));
    c.header("X-RateLimit-Remaining", String(result.remaining));
    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfterSeconds));
      return c.json(
        {
          error: {
            code: "rate_limited",
            message: `Rate limit exceeded; retry in ${result.retryAfterSeconds}s.`,
            request_id: c.get("requestId"),
            retryable: true,
          },
        },
        429,
      );
    }
    await next();
  });

  // API-key scopes: read-only keys cannot mutate. User tokens pass through.
  app.use("/v1/*", enforceApiScopes);

  // modules
  app.route("/v1", authRoutes); // /v1/auth/* + /v1/me + /v1/invites/:token (public)
  app.route("/v1", orgRoutes); // org + member management
  app.route("/v1", coreRoutes); // teams + projects
  app.route("/v1", taskRoutes); // tasks
  app.route("/v1", commentRoutes); // comments
  app.route("/v1", feedRoutes); // activity + notifications
  app.route("/v1", searchRoutes); // full-text search
  app.route("/v1", govRoutes); // webhooks, api keys, audit, usage
  app.route("/v1", billingRoutes); // billing + subscription tiers
  app.route("/v1", attachmentRoutes); // attachments

  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}