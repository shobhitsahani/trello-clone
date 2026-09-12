/** Entry point: HTTP server + WS upgrade + worker pool in one deployable
 * (modular monolith — the WS gateway and workers split out at the seams named
 * in docs/design/teamflow.md §8). */
import { serve } from "@hono/node-server";
import { startRealtimeGateway } from "./realtime/ws.js";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { startWorkers } from "./worker/workers.js";
import { closeQueue } from "./lib/queue.js";
import { closeRedis } from "./lib/redis.js";
import { sql } from "./db/client.js";

const app = createApp();

const server = serve({ fetch: app.fetch, port: config().port }, (info) => {
  console.log(`[teamflow-api] listening on :${info.port} (${config().nodeEnv})`);
});
// The WS upgrade is wired at the raw Node layer (see realtime/ws.ts): Bun's
// node:http port invalidates the socket for ws.handleUpgrade() after the
// first await, and the app's auth middleware necessarily awaits — so the
// @hono/node-ws handshake (deferred via app.request) can never complete.
startRealtimeGateway(server, app);

const workers = startWorkers();
console.log(`[teamflow-api] worker pool started (${workers.length} worker)`);

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