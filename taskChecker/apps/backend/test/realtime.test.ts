/** Realtime gateway test — boots a real HTTP server + the WS gateway (no mocks)
 * and asserts the client-visible contract:
 *   1. bad token → clean 4401 close (never a hang),
 *   2. good token → connected → subscribe → subscribed,
 *   3. a Redis `org:<tenant>` publish fans out to the subscribed socket,
 *   4. cross-tenant publishes never leak into the socket.
 *
 * Needs Redis on localhost:6379 (same rule as integration.test.ts): skips
 * when Redis is unreachable so `bun test` without infra stays green.
 */
import { afterAll, describe, expect, it } from "bun:test";
import { createServer, type Server } from "node:http";
import { Redis } from "ioredis";
import { WebSocket } from "ws";
import { Hono } from "hono";
import { signAccessToken } from "../src/lib/tokens.js";
import { realtimeSinkCount, closeRealtimeSubscriber, startRealtimeGateway } from "../src/realtime/ws.js";

process.env.JWT_SECRET ??= "dev-only-change-me-at-least-32-chars-with-randomness";

const TENANT_A = "0".repeat(27) + "aaaaa";
const TENANT_B = "0".repeat(27) + "bbbbb";
const USER_A = "0".repeat(27) + "ccccc";

async function probeRedis(): Promise<Redis | null> {
  const probe = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    connectTimeout: 1500,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  // ioredis with lazyConnect + no offline queue rejects the ping unless we
  // connect explicitly — but connect() hangs when Redis is down, so race it.
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
  const attempt = (async (): Promise<Redis | null> => {
    try {
      await probe.connect();
      await probe.ping();
      return probe;
    } catch {
      try {
        probe.disconnect();
      } catch {
        // already down
      }
      return null;
    }
  })();
  const result = await Promise.race([attempt, timeout]);
  if (!result) {
    try {
      probe.disconnect();
    } catch {
      // already down
    }
  }
  return result;
}

const probe = await probeRedis();
const redisUp = probe !== null;

// Module state shared (deliberately) across this file's tests — Bun runs them
// serially. A *dedicated* subscriber probe confirms the gateway's Redis
// pattern-subscription is live before any fan-out assertion runs: the first
// socket's attach races `psubscribe`, so publishing immediately after
// `subscribed` can otherwise drop the event on a cold subscriber.

interface OpenSocket {
  ws: WebSocket;
  frames: Record<string, unknown>[];
}

function nextFrame(sock: OpenSocket, type: string, timeoutMs = 5000): Promise<Record<string, unknown>> {
  const found = sock.frames.find((f) => f.type === type);
  if (found) return Promise.resolve(found);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      sock.ws.off("message", onMessage);
      reject(new Error(`timed out waiting for ${type}`));
    }, timeoutMs);
    const onMessage = (data: { toString(): string }) => {
      try {
        const parsed = JSON.parse(data.toString()) as { type?: string };
        if (parsed.type === type) {
          clearTimeout(timer);
          sock.ws.off("message", onMessage);
          resolve(parsed as Record<string, unknown>);
        }
      } catch {
        // not JSON — ignore
      }
    };
    sock.ws.on("message", onMessage);
  });
}

function openSocket(base: string, token?: string): Promise<OpenSocket> {
  return new Promise((resolve, reject) => {
    const url = token ? `${base}?token=${encodeURIComponent(token)}` : base;
    const ws = new WebSocket(url);
    const sock: OpenSocket = { ws, frames: [] };
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        // already gone
      }
      reject(new Error("timed out waiting for open"));
    }, 8000);
    ws.on("open", () => {
      clearTimeout(timer);
      resolve(sock);
    });
    ws.on("message", (data) => {
      try {
        sock.frames.push(JSON.parse(data.toString()) as Record<string, unknown>);
      } catch {
        // not JSON — ignore
      }
    });
  });
}

describe.skipIf(!redisUp)("realtime gateway", () => {
  let server: Server;
  let base = "";
  let tokenA = "";

  const ready = (async () => {
    tokenA = await signAccessToken({ sub: USER_A, tid: TENANT_A, role: "owner" });
    const app = new Hono();
    server = createServer((_req, res) => res.end("ok"));
    startRealtimeGateway(server as never, app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    base = `ws://127.0.0.1:${port}/v1/ws`;
  })();

  afterAll(async () => {
    await probe?.quit().catch(() => {});
    await closeRealtimeSubscriber();
    for (const tracked of trackedSockets) {
      try {
        tracked.close();
      } catch {
        // already gone
      }
    }
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  // Every socket a test opens must eventually close, or `bun test` hangs on
  // the open handle. Tests register here instead of closing inline so a
  // mid-test assertion failure can't leak the process.
  const trackedSockets = new Set<WebSocket>();
  function track(sock: OpenSocket): OpenSocket {
    trackedSockets.add(sock.ws);
    sock.ws.on("close", () => trackedSockets.delete(sock.ws));
    return sock;
  }

  it("rejects a bad token with 4401 instead of hanging", async () => {
    await ready;
    const ws = new WebSocket(`${base}?token=garbage`);
    const code = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("bad-token socket hung")), 8000);
      ws.on("close", (c: number) => {
        clearTimeout(timer);
        resolve(c);
      });
    });
    expect(code).toBe(4401);
  });

// Pattern-subscription readiness: NUMPAT>=1 can be satisfied by ANY client on
  // the shared Redis (dev server, orphaned run) while THIS gateway's async
  // psubscribe is still in flight — publishing then drops the event on a cold
  // subscriber and the test flakes. So after NUMPAT, warm up THIS gateway:
  // republish a ping until our own socket echoes it, proving our psubscribe
  // is live before the real assertion publish.
  async function waitForOwnSubscription(sock: OpenSocket, tenant: string, timeoutMs = 8000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    const marker = `warmup-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    for (;;) {
      await probe!.publish(`org:${tenant}`, JSON.stringify({ tenantId: tenant, type: "warmup.ping", marker }));
      try {
        const frame = await nextFrame(sock, "warmup.ping", Math.min(500, Math.max(100, deadline - Date.now())));
        if (frame.marker === marker) return;
        // A stale warmup frame from an earlier loop iteration — keep warming.
        sock.frames.splice(sock.frames.indexOf(frame), 1);
      } catch {
        // not yet — republish until deadline
      }
      if (Date.now() > deadline) throw new Error("timed out waiting for own gateway subscription");
    }
  }

  it("connects, subscribes, and fans out same-tenant events", async () => {
    await ready;
    const sock = track(await openSocket(base, tokenA));
    try {
      const connected = await nextFrame(sock, "connected");
      expect(connected.tenantId).toBe(TENANT_A);
      sock.ws.send(JSON.stringify({ action: "subscribe" }));
      const subscribed = await nextFrame(sock, "subscribed");
      expect(subscribed.channel).toBe(`org:${TENANT_A}`);

      await waitForOwnSubscription(sock, TENANT_A);
      const marker = `gateway-test-${Date.now()}`;
      const published = await probe!.publish(`org:${TENANT_A}`, JSON.stringify({ tenantId: TENANT_A, type: "task.created", marker }));
      const event = await nextFrame(sock, "task.created");
      expect(event.marker).toBe(marker);
    } finally {
      sock.ws.close();
    }
  });

  it("never leaks cross-tenant events into a subscribed socket", async () => {
    await ready;
    const sock = track(await openSocket(base, tokenA));
    try {
      await nextFrame(sock, "connected");
      sock.ws.send(JSON.stringify({ action: "subscribe" }));
      await nextFrame(sock, "subscribed");
      await probe!.publish(`org:${TENANT_B}`, JSON.stringify({ tenantId: TENANT_B, type: "task.created", marker: "leak" }));
      await new Promise((r) => setTimeout(r, 1200));
      expect(sock.frames.some((f) => f.type === "task.created")).toBe(false);
    } finally {
      sock.ws.close();
    }
  });

  it("cleans up sinks when sockets close", async () => {
    await ready;
    // A previous test's socket may still be draining its close frame; count
    // only the delta this test creates instead of an absolute value.
    const sock = track(await openSocket(base, tokenA));
    await nextFrame(sock, "connected");
    const before = realtimeSinkCount();
    sock.ws.send(JSON.stringify({ action: "subscribe" }));
    await nextFrame(sock, "subscribed");
    expect(realtimeSinkCount()).toBe(before + 1);
    await new Promise<void>((resolve) => {
      sock.ws.on("close", () => resolve());
      sock.ws.close();
    });
    await new Promise((r) => setTimeout(r, 200));
    expect(realtimeSinkCount()).toBe(before);
  });
});

