import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { createApp } from "../taskChecker/apps/backend/src/app.js";
import { setupRealtime } from "../taskChecker/apps/backend/src/realtime/ws.js";

const app = createApp();

// Time app.request (the upgrade listener awaits this)
const origRequest = app.request.bind(app);
app.request = async (input: any, init?: any, env?: any) => {
  const t = Date.now();
  try {
    const res = await origRequest(input, init, env);
    console.log(`[dbg] app.request resolved in ${Date.now() - t}ms status=${res.status}`);
    return res;
  } catch (e) {
    console.log(`[dbg] app.request THREW in ${Date.now() - t}ms`, e);
    throw e;
  }
};

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
setupRealtime(app, upgradeWebSocket);

const server = serve({ fetch: app.fetch, port: 4004 }, (info) => {
  console.log(`[dbg] listening on :${info.port}`);
});

server.on("upgrade", (req: any, socket: any, head: any) => {
  console.log(`[dbg] raw upgrade event req.url=${req.url}`);
  socket.on("close", () => console.log(`[dbg] socket closed (was upgrade)`));
});

injectWebSocket(server);
console.log("[dbg] injected, ready");