import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
const app = new Hono();
app.get("/ws", (c) => {
  return c.text("hi");
});
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
app.get("/v1/ws", upgradeWebSocket((c) => ({
  onOpen: (_e, ws) => ws.send("hello"),
})));
const server = serve({ fetch: app.fetch, port: 4099 }, (info) => console.log("listening", info.port));
injectWebSocket(server);