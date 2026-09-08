/** Attachments: metadata lives in Postgres (tenant-scoped), bytes live in the
 * blob store. prod path: presigned PUT direct to S3 (client → store, app never
 * proxies bytes); dev path (`UPLOAD_BACKEND=memory`): bytes flow through the
 * app into an in-memory store so the flow runs with zero infra. */
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import { inTenant } from "../lib/request.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { uuidv7 } from "../lib/ids.js";
import { requireRole, Rbac } from "../lib/rbac.js";
import { audit } from "../lib/audit.js";
import { attachments, tasks } from "../db/schema.js";
import { config } from "../config.js";
import { memGet, memPut, presignUrl, uploadBackend } from "../lib/blobs.js";

export const attachmentRoutes = new Hono();

// POST /v1/attachments/presign { fileName, contentType, size, taskId? } — member+
attachmentRoutes.post("/presign", async (c) => {
  const p = c.get("principal");
  const parsed = z
    .object({
      fileName: z.string().min(1).max(200),
      contentType: z.string().min(3).max(120),
      size: z.number().int().positive().max(200 * 1024 * 1024), // 200 MB cap
      taskId: z.string().uuid().optional(),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("fileName, contentType, size (<=200MB) and optional taskId are required.");
  requireRole(p.role, Rbac.write);
  // Blob metadata must cite a real user (uploader_id NOT NULL). API keys are
  // server-to-server and have no user identity — require a user token here.
  if (!p.userId) throw forbidden("Attachments require a user token.");

  return inTenant(c, async (tx) => {
    if (parsed.data.taskId) {
      const task = await tx.query.tasks.findFirst({
        where: (t, { and: a, eq: e, isNull: n }) => a(e(t.tenantId, p.tenantId), e(t.id, parsed.data.taskId!), n(t.deletedAt)),
      });
      if (!task) throw notFound("Task not found in this organization.");
    }
    const id = uuidv7();
    // key is tenant-prefixed: implicit per-tenant namespace at the store level
    const objectKey = `${p.tenantId}/${parsed.data.taskId ?? "org"}/${id}/${parsed.data.fileName}`;
    const sha256 = createHash("sha256").update(objectKey).digest("hex"); // placeholder; real sum computed at upload

    await tx.insert(attachments).values({
      tenantId: p.tenantId, id, taskId: parsed.data.taskId ?? null, uploaderId: p.userId,
      fileName: parsed.data.fileName, objectKey, size: parsed.data.size,
      contentType: parsed.data.contentType, sha256,
    });
    await audit(tx, { tenantId: p.tenantId, actorId: p.userId, action: "attachment.presigned", entityType: "attachment", entityId: id, after: { fileName: parsed.data.fileName, size: parsed.data.size } });

    if (uploadBackend() === "s3") {
      const presigned = presignUrl({ method: "PUT", bucket: config().s3Bucket ?? "teamflow-attachments", key: objectKey, contentType: parsed.data.contentType, expiresSec: 900 });
      return c.json({ attachmentId: id, objectKey, upload: { method: presigned.method, url: presigned.url, headers: presigned.headers, expiresInSec: 900 } }, 201);
    }
    // memory backend: bytes go through the app
    return c.json({
      attachmentId: id,
      objectKey,
      upload: {
        method: "PUT" as const,
        url: `${config().publicBaseUrl}/v1/attachments/upload/${id}`,
        headers: { "Content-Type": parsed.data.contentType, "X-Object-Key": objectKey },
        expiresInSec: 900,
      },
    }, 201);
  });
});

// PUT /v1/attachments/upload/{id} — memory backend only: app receives bytes.
attachmentRoutes.put("/upload/:id", async (c) => {
  const p = c.get("principal");
  const id = c.req.param("id");
  const objectKey = c.req.header("x-object-key");
  if (!objectKey || !objectKey.startsWith(`${p.tenantId}/`)) throw forbidden("Object key does not belong to this organization.");
  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) throw badRequest("Empty body.");

  return inTenant(c, async (tx) => {
    const row = await tx.query.attachments.findFirst({ where: (a2, { and: a, eq: e }) => a(e(a2.tenantId, p.tenantId), e(a2.id, id)) });
    if (!row || row.objectKey !== objectKey) throw notFound("Attachment not found.");
    const contentType = c.req.header("content-type") ?? row.contentType;
    memPut(objectKey, Buffer.from(body), contentType);
    await tx
      .update(attachments)
      .set({ size: body.byteLength, sha256: createHash("sha256").update(Buffer.from(body)).digest("hex") })
      .where(and(eq(attachments.tenantId, p.tenantId), eq(attachments.id, id)));
    return c.json({ ok: true, bytes: body.byteLength });
  });
});

// GET /v1/attachments/{id}/download — 302 to signed GET (s3) or stream (memory).
attachmentRoutes.get("/attachments/:id/download", async (c) => {
  const p = c.get("principal");
  const id = c.req.param("id");
  return inTenant(c, async (tx) => {
    const row = await tx.query.attachments.findFirst({ where: (a2, { and: a, eq: e }) => a(e(a2.tenantId, p.tenantId), e(a2.id, id)) });
    if (!row) throw notFound("Attachment not found.");
    if (uploadBackend() === "s3") {
      const presigned = presignUrl({ method: "GET", bucket: config().s3Bucket ?? "teamflow-attachments", key: row.objectKey, expiresSec: 300 });
      return c.redirect(presigned.url, 302);
    }
    const obj = memGet(row.objectKey);
    if (!obj) throw notFound("Object not uploaded yet.");
    return c.body(new Uint8Array(obj.bytes), 200, { "Content-Type": obj.contentType, "Content-Length": String(obj.bytes.byteLength) });
  });
});