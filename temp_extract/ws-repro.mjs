// Repro script: login -> open WS twice (same tenant) -> subscribe both ->
// POST chat message -> verify the OTHER socket still gets chat.created
// (cross-socket fan-out) and DELETE fans out chat.deleted.
const BASE = "http://localhost:4002/v1";
const WS = "ws://localhost:4002/v1/ws";

const loginRes = await fetch(`${BASE}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "alice@acme.io", password: "password123" }),
});
const loginData = await loginRes.json();
const token = loginData.tokens?.accessToken;
if (!token) {
  console.error("login failed:", JSON.stringify(loginData).slice(0, 500));
  process.exit(1);
}
console.log("login ok, tenant =", loginData.tenant?.tenant_id);
const auth = { Authorization: `Bearer ${token}` };

async function openSocket(name) {
  const ws = new WebSocket(`${WS}?token=${encodeURIComponent(token)}`);
  const frames = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    frames.push(msg);
    console.log(`<< [${name}]`, msg.type);
  };
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${name}: open timeout`)), 8000);
    ws.onopen = () => { clearTimeout(t); resolve(); };
    ws.onerror = (e) => { clearTimeout(t); reject(new Error(`${name}: ${e.message}`)); };
  });
  ws.send(JSON.stringify({ action: "subscribe" }));
  await new Promise((r) => setTimeout(r, 500));
  return { ws, frames };
}

const a = await openSocket("A");
const b = await openSocket("B");
const aHad = (t) => a.frames.some((m) => m.type === t);
const bHad = (t) => b.frames.some((m) => m.type === t);
console.log("A connected/subscribed:", aHad("connected"), aHad("subscribed"));
console.log("B connected/subscribed:", bHad("connected"), bHad("subscribed"));

// 1. POST a message from A; B must receive chat.created (cross-socket fan-out)
const body = `fanout test ${Date.now()}`;
const post = await fetch(`${BASE}/chat/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...auth },
  body: JSON.stringify({ body }),
});
const posted = await post.json();
console.log("chat POST status =", post.status, "id =", posted.message?.id);
await new Promise((r) => setTimeout(r, 2000));
const aCreated = aHad("chat.created");
const bCreated = bHad("chat.created");
console.log("A got chat.created:", aCreated, "| B got chat.created:", bCreated);

// 2. Cross-tenant isolation: globex must NOT see acme's message
const login2 = await (
  await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "carol@globex.io", password: "password123" }),
  })
).json();
const ws2 = new WebSocket(`${WS}?token=${encodeURIComponent(login2.tokens.accessToken)}`);
const frames2 = [];
ws2.onmessage = (ev) => frames2.push(JSON.parse(ev.data));
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("globex open timeout")), 8000);
  ws2.onopen = () => { clearTimeout(t); res(); };
  ws2.onerror = (e) => { clearTimeout(t); rej(e); };
});
ws2.send(JSON.stringify({ action: "subscribe" }));
await new Promise((r) => setTimeout(r, 500));
const post2 = await fetch(`${BASE}/chat/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...auth },
  body: JSON.stringify({ body: `isolation test ${Date.now()}` }),
});
console.log("second chat POST status =", post2.status);
await new Promise((r) => setTimeout(r, 2000));
const leaked = frames2.some((m) => m.type === "chat.created");
console.log("globex socket saw acme chat.created (must be false):", leaked);

// 3. DELETE fans out chat.deleted to subscribers
const del = await fetch(`${BASE}/chat/messages/${posted.message.id}`, {
  method: "DELETE",
  headers: auth,
});
console.log("chat DELETE status =", del.status);
await new Promise((r) => setTimeout(r, 2000));
console.log("A got chat.deleted:", aHad("chat.deleted"), "| B got chat.deleted:", bHad("chat.deleted"));

// 4. Bad token must fail fast (no hang)
const bad = new WebSocket(`${WS}?token=garbage`);
const badResult = await new Promise((resolve) => {
  const t = setTimeout(() => resolve("TIMEOUT (bad)"), 8000);
  bad.onclose = (e) => { clearTimeout(t); resolve(`closed code=${e.code}`); };
  bad.onerror = () => { clearTimeout(t); resolve("error"); };
});
console.log("bad-token socket:", badResult);

// 5. Notifications still work (worker path unaffected)
const notes = await (await fetch(`${BASE}/notifications?limit=5`, { headers: auth })).json();
console.log("notifications list ok:", Array.isArray(notes.data));

for (const s of [a.ws, b.ws, ws2]) try { s.close(); } catch { /* noop */ }
bad.close();

const ok = aCreated && bCreated && !leaked && aHad("chat.deleted") && bHad("chat.deleted");
console.log("\n=== RESULT:", ok ? "PASS" : "FAIL", "===");
process.exit(ok ? 0 : 1);