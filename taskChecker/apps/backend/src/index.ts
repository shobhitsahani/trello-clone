/** Entry point: HTTP server + WS upgrade + worker pool in one deployable
 * (modular monolith — the WS gateway and workers split out at the seams named
 * in docs/design/teamflow.md §8). */
import { serve } from "@hono/node-server";
import { startRealtimeGateway } from "./realtime/ws.js";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { startWorkers } from "./worker/workers.js";
import { closeQueue, ensureDeadlineSweepSchedule } from "./lib/queue.js";
import { closeRedis } from "./lib/redis.js";
import { sql } from "./db/client.js";

const app = createApp();

let workers: ReturnType<typeof startWorkers> = [];

// Capture EADDRINUSE before it becomes an unhandled 'error' event.
// The callback below only fires on successful listen; workers and the deadline
// sweep therefore never start if the port is already taken.
const server = serve({ fetch: app.fetch, port: config().port }, (info) => {
  console.log(`[teamflow-api] listening on :${info.port} (${config().nodeEnv})`);
  // The WS upgrade is wired at the raw Node layer (see realtime/ws.ts): Bun's
  // node:http port invalidates the socket for ws.handleUpgrade() after the
  // first await, and the app's auth middleware necessarily awaits — so the
  // @hono/node-ws handshake (deferred via app.request) can never complete.
  startRealtimeGateway(server, app);

  workers = startWorkers();
  console.log(`[teamflow-api] worker pool started (${workers.length} worker)`);
  // Overdue-task → backlog sweep (repeatable BullMQ job; best-effort schedule).
  void ensureDeadlineSweepSchedule(config().deadlineSweepMs);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if ((err as NodeJS.ErrnoException)?.code === "EADDRINUSE") {
    console.error(`[teamflow-api] port ${config().port} already in use — is another dev server running? Kill it (lsof -i :${config().port} or netstat -ano | findstr :${config().port}) or set PORT env var.`);
  } else {
    console.error("[teamflow-api] server error:", err);
  }
  process.exit(1);
});

async function shutdown(signal: string) {
  console.log(`[teamflow-api] ${signal} received — draining`);
  for (const w of workers) await w.close();
  await closeQueue();
  server.close();
  await sql.end();
  await closeRedis();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));