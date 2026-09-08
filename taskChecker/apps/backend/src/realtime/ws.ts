/** Realtime: one Redis pub/sub subscriber per gateway process fans out to local
 * WebSocket connections (docs §4/§6). Clients subscribe to org channels scoped
 * to THEIR tenant claim; catch-up after a drop is cursor-based from
 * notifications, so no event is lost when the socket is down. */
import type { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";
import type { Redis } from "ioredis";
import { redis } from "../lib/redis.js";
import type { Principal } from "../lib/auth.js";

type Sink = (payload: string) => void;

const sinks = new Set<Sink>();
let subscriber: Redis | null = null;

function ensureSubscriber(): Redis {
  subscriber ??= (() => {
    const sub = redis().duplicate();
    // psubscribe races the (lazy) connection: when Redis isn't reachable yet
    // the command rejects, and as a floating promise that rejection crashes
    // the whole gateway process. Catch it and retry on every reconnect so a
    // client connecting during startup/Redis-failover can never take us down.
    const subscribe = () => {
      sub.psubscribe("org:*").catch((err: unknown) => {
        console.error(
          "[realtime] psubscribe failed, will retry on reconnect:",
          (err as Error)?.message ?? err,
        );
      });
    };
    sub.on("ready", subscribe);
    subscribe();
    sub.on("pmessage", (_pattern, _channel, message) => {
      for (const sink of sinks) {
        try {
          sink(message);
        } catch {
          // one bad client must not break the fan-out
        }
      }
    });
    sub.on("error", (err) => console.error("[realtime] subscriber error:", err.message));
    return sub;
  })();
  return subscriber;
}

export function setupRealtime(app: Hono, upgradeWebSocket: UpgradeWebSocket<unknown, { onError: (err: unknown) => void }>): void {
  app.get(
    "/v1/ws",
    upgradeWebSocket((c) => {
      const principal = c.get("principal") as Principal | undefined;
      if (!principal) {
        return { onOpen: (_e, ws) => ws.close(4401, "unauthorized") };
      }
      const tenantPrefix = `org:${principal.tenantId}`;
      let sink: Sink | null = null;

      return {
        onOpen: (_event, ws) => {
          try {
            ensureSubscriber();
            ws.send(JSON.stringify({ type: "connected", tenantId: principal.tenantId, hint: 'send {"action":"subscribe"} to start receiving events' }));
          } catch (err) {
            // A send/subscribe failure must not propagate — an exception here
            // tears down the whole gateway process, not just this socket.
            console.error("[realtime] onOpen failed:", (err as Error)?.message ?? err);
            try {
              ws.close(1011, "realtime unavailable");
            } catch {
              // socket already gone — nothing to do
            }
          }
        },
        onMessage: (event, ws) => {
          try {
            const msg = JSON.parse(String(event.data)) as { action?: string };
            if (msg.action !== "subscribe") {
              ws.send(JSON.stringify({ type: "error", error: "unsupported_action" }));
              return;
            }
            if (!sink) {
              sink = (payload) => {
                const parsed = JSON.parse(payload) as { tenantId?: string };
                if (parsed.tenantId === principal.tenantId) ws.send(payload);
              };
              sinks.add(sink);
            }
            ws.send(JSON.stringify({ type: "subscribed", channel: tenantPrefix, hint: "replay missed events via GET /v1/notifications?cursor=" }));
          } catch {
            ws.send(JSON.stringify({ type: "error", error: "bad_json" }));
          }
        },
        onClose: () => {
          if (sink) sinks.delete(sink);
        },
      };
    }),
  );
}

export function realtimeSinkCount(): number {
  return sinks.size;
}
