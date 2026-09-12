/** Realtime: one Redis pub/sub subscriber per gateway process fans out to local
 * WebSocket connections (docs §4/§6). Clients subscribe to org channels scoped
 * to THEIR tenant claim; catch-up after a drop is cursor-based from
 * notifications, so no event is lost when the socket is down. */
import type { Duplex } from "node:stream";
import type { Hono } from "hono";
import { Redis } from "ioredis";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { config } from "../config.js";
import { verifyAccessToken, type AccessClaims } from "../lib/tokens.js";

// Bun ships its own node:http typings for `serve()`'s return, while `ws`
// types target Node's Server — the gateway only needs `.on("upgrade")`.
interface UpgradeServer {
  on(event: "upgrade", listener: (request: import("node:http").IncomingMessage, socket: Duplex, head: Buffer) => void): unknown;
}

type Sink = (payload: string, tenantId: string | null) => void;

const sinks = new Set<Sink>();
let subscriber: Redis | null = null;

function ensureSubscriber(): Redis {
  subscriber ??= (() => {
    // A dedicated subscriber connection — NOT `redis().duplicate()`.
    // duplicate() inherits lazyConnect:true + enableOfflineQueue:false from
    // the shared client, so the psubscribe (and any later reconnect) never
    // establishes a connection and the gateway silently receives nothing.
    // This client owns its lifecycle and reconnects on its own (same shape
    // as the BullMQ `blockingRedis()` connections).
    const sub = new Redis(config().redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times: number) => Math.min(times * 200, 2000),
    });
    // psubscribe races the connection: when Redis isn't reachable yet the
    // command rejects — catch it and retry on every reconnect so a client
    // connecting during startup/Redis-failover can never take us down.
    const subscribe = () => {
      // Re-issuing psubscribe on an already-subscribed pattern is harmless
      // (Redis dedupes it), so every reconnect re-arms the fan-out.
      sub.psubscribe("org:*").catch((err: unknown) => {
        console.error(
          "[realtime] psubscribe failed, will retry on reconnect:",
          (err as Error)?.message ?? err,
        );
      });
    };
    // NOTE: subscribe on BOTH ready and connect. 'ready' fires when the
    // connection is usable for commands; with enableReadyCheck:false the
    // 'connect' event is the reliable re-arm point after a failover, while
    // 'ready' covers the initial handshake.
    sub.on("connect", subscribe);
    sub.on("ready", subscribe);
    subscribe();
    sub.on("pmessage", (_pattern, channel, message) => {
      // Parse once + route by channel suffix instead of parsing per-sink and
      // comparing tenantId in every socket: O(1) parse, fewer wakeups.
      // Channel shape is `org:<tenantId>`.
      const tenantId = channel.startsWith("org:") ? channel.slice(4) : null;
      for (const sink of sinks) {
        try {
          sink(message, tenantId);
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

/** Wire the WS gateway onto the HTTP server's `upgrade` event.
 *
 * Why not @hono/node-ws here: that helper defers the ws handshake until
 * AFTER Hono's middleware chain resolves (app.request → waiter → handleUpgrade).
 * Under Bun's node:http server that delay invalidates the upgrade socket —
 * ws.handleUpgrade() then throws and the client hangs forever. The WS path
 * authenticates at this layer instead (JWT verify is pure crypto, no DB),
 * before touching the socket; everything else (rate limits, scopes, audit)
 * stays on the HTTP middleware where it belongs.
 *
 * `_app` is kept so future HTTP-adjacent realtime endpoints (e.g. a replay
 * cursor) stay in the same module seam; the gateway itself is transport-only.
 */
export function startRealtimeGateway(server: UpgradeServer, _app: Hono): void {
  void _app;
  const wss = new WebSocketServer({ noServer: true });
  wss.on("error", (err: Error) => console.error("[realtime] gateway error:", err.message));

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/v1/ws", "http://localhost");
    if (url.pathname !== "/v1/ws" || request.method !== "GET") {
      rejectUpgrade(socket, 404, JSON.stringify({ error: { code: "not_found", message: "Not found." } }));
      return;
    }
    if ((request.headers.upgrade ?? "").toLowerCase() !== "websocket") {
      rejectUpgrade(socket, 400, JSON.stringify({ error: { code: "bad_request", message: "WebSocket upgrade required." } }));
      return;
    }

    const auth = request.headers.authorization;
    const headerToken = Array.isArray(auth) ? auth[0] : auth;
    const bearer =
      headerToken?.toLowerCase().startsWith("bearer ") ? headerToken.slice(7).trim() : undefined;
    // Same contract as the old route: browsers can't set headers on a WS
    // handshake, so the JWT rides the ?token= query param.
    const token = bearer || url.searchParams.get("token") || undefined;

    let done = false; // settle-once across the sync/async boundary
    let pendingWs: WebSocket | null = null;
    const fail = (message: string) => {
      if (done) return;
      done = true;
      const ws = pendingWs;
      if (ws && ws.readyState === ws.OPEN) {
        // Handshake already completed — close the WS cleanly so the client
        // sees code 4401 instead of a hung socket.
        try {
          ws.close(4401, message);
        } catch {
          // already gone
        }
        return;
      }
      rejectUpgrade(socket, 401, JSON.stringify({ error: { code: "unauthorized", message } }));
    };

    try {
      wss.handleUpgrade(request, socket, head, (ws) => {
        pendingWs = ws;
      });
    } catch (err) {
      fail((err as Error)?.message ?? "WebSocket upgrade failed.");
      return;
    }

    // Verify AFTER the synchronous handshake (Bun requires zero awaits before
    // handleUpgrade). Verification is a local crypto check — no DB/RBAC — and
    // unverified sockets are closed with 4401 before any of their frames are
    // processed: the ws `message` listener is only registered on success, so
    // an attacker's pre-auth frames buffer on the socket but can never reach
    // a handler, and the connection dies within milliseconds.
    if (!token) {
      fail("Missing credentials.");
      return;
    }
    verifyAccessToken(token).then(
      (claims: AccessClaims | null) => {
        if (done) return;
        if (!claims) {
          fail("Invalid or expired access token.");
          return;
        }
        done = true;
        const ws = pendingWs;
        if (!ws || ws.readyState !== ws.OPEN) {
          // client gave up while we verified — nothing to attach
          return;
        }
        attachGatewaySocket(ws, claims.tid);
      },
      () => fail("Invalid or expired access token."),
    );
  });
}

/** Visible for tests: how many sockets are currently subscribed. */
export function realtimeSinkCount(): number {
  return sinks.size;
}

/** Visible for tests: tear down the shared subscriber (lets `bun test`
 * exit cleanly; the gateway process itself never calls this). */
export async function closeRealtimeSubscriber(): Promise<void> {
  const sub = subscriber;
  subscriber = null;
  if (sub) {
    try {
      sub.removeAllListeners();
    } catch {
      // already gone
    }
    await sub.quit().catch(() => {});
  }
}

interface GatewaySocket {
  tenantId: string;
  subscribed: boolean;
  sink: Sink | null;
}

/** Upgrade rejection — a plain HTTP response on the socket, then destroy.
 * A WS client (or curl probe) surfaces this as a failed handshake. */
function rejectUpgrade(socket: Duplex, status: number, body: string): void {
  try {
    const reason = status === 401 ? "Unauthorized" : status === 404 ? "Not Found" : "Bad Request";
    socket.write(
      `HTTP/1.1 ${status} ${reason}\r\n` +
        "Connection: close\r\n" +
        "Content-Type: application/json\r\n" +
        `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
    );
  } catch {
    // socket already gone — nothing to do
  }
  try {
    socket.destroy();
  } catch {
    // already gone
  }
}

/** Attach one verified connection to the org fan-out. */
function attachGatewaySocket(ws: WebSocket, tenantId: string): void {
  const sock: GatewaySocket = { tenantId, subscribed: false, sink: null };

  const detach = () => {
    if (sock.sink) {
      sinks.delete(sock.sink);
      sock.sink = null;
    }
  };

  // The subscriber boots lazily on first connection (same as before); this
  // never awaits, so a down Redis can slow this tick but never stalls the
  // handshake (Bun invalidates deferred upgrade sockets).
  try {
    ensureSubscriber();
  } catch (err) {
    console.error("[realtime] subscriber init failed:", (err as Error)?.message ?? err);
  }

  ws.on("message", (data: RawData) => {
    try {
      const msg = JSON.parse(String(data)) as { action?: string };
      if (msg.action !== "subscribe") {
        ws.send(JSON.stringify({ type: "error", error: "unsupported_action" }));
        return;
      }
      if (!sock.subscribed) {
        sock.subscribed = true;
        sock.sink = (payload, tenantId) => {
          // Fast path: channel already tells us the tenant — no JSON.parse
          // per socket per event. Fall back to parsing only when the channel
          // didn't carry it (older publishers).
          if (tenantId !== null && tenantId !== undefined) {
            if (tenantId !== sock.tenantId) return;
          } else {
            try {
              const parsed = JSON.parse(payload) as { tenantId?: string };
              if (parsed.tenantId !== sock.tenantId) return;
            } catch {
              return;
            }
          }
          if (ws.readyState !== WebSocket.OPEN) return;
          try {
            ws.send(payload);
          } catch {
            // half-closed socket — drop this frame; catch-up via
            // notifications covers it
          }
        };
        sinks.add(sock.sink);
      }
      ws.send(
        JSON.stringify({
          type: "subscribed",
          channel: `org:${sock.tenantId}`,
          hint: "replay missed events via GET /v1/notifications?cursor=",
        }),
      );
    } catch {
      try {
        ws.send(JSON.stringify({ type: "error", error: "bad_json" }));
      } catch {
        // socket gone
      }
    }
  });

  ws.on("close", detach);
  ws.on("error", detach);

  ws.send(
    JSON.stringify({
      type: "connected",
      tenantId: sock.tenantId,
      hint: 'send {"action":"subscribe"} to start receiving events',
    }),
  );
}
