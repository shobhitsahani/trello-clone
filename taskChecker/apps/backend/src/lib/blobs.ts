/** Attachment storage: S3-compatible store with short-lived SigV4 presigned
 * URLs (write-once, read-many; bytes never touch Postgres) — plus a `memory`
 * backend for zero-infra local dev that serves bytes through the app.
 * See docs §5/§6 — key = tenantId/entity/key, so the store namespace is
 * implicitly tenant-partitioned even though the app metadata table enforces it.
 */
import { createHash, createHmac } from "node:crypto";
import { config } from "../config.js";

function hmac(key: Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** AWS SigV4 signing key chain (S3). */
function signingKey(secret: string, dateStamp: string, region: string): Buffer {
  return hmac(hmac(hmac(hmac(Buffer.from(`AWS4${secret}`, "utf8"), dateStamp), region), "s3"), "aws4_request");
}

function encodePath(path: string): string {
  return path.split("/").map((s) => encodeURIComponent(s)).join("/");
}

export interface Presigned {
  method: "PUT" | "GET";
  url: string;
  headers: Record<string, string>;
}

/**
 * Presign an object URL valid for `expiresSec`. Canonical query is sorted, the
 * payload is UNSIGNED-PAYLOAD (S3 only), signed headers = host [+ content-type].
 */
export function presignUrl(opts: {
  method: "PUT" | "GET";
  bucket: string;
  key: string;
  contentType?: string;
  expiresSec: number;
}): Presigned {
  const cfg = config();
  const endpoint = cfg.s3Endpoint ?? "";
  const host = new URL(endpoint).host;
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const region = cfg.s3Region ?? "us-east-1";
  const scope = `${dateStamp}/${region}/s3/aws4_request`;

  const signedHeaders = opts.contentType ? "host;content-type" : "host";
  const queryParts = [
    "X-Amz-Algorithm=AWS4-HMAC-SHA256",
    `X-Amz-Credential=${encodeURIComponent(`${cfg.s3AccessKey}/${scope}`)}`,
    `X-Amz-Date=${amzDate}`,
    `X-Amz-Expires=${opts.expiresSec}`,
    `X-Amz-SignedHeaders=${signedHeaders}`,
  ].sort();

  const canonicalHeaders =
    `host:${host}\n${opts.contentType ? `content-type:${opts.contentType}\n` : ""}`;
  const canonicalRequest = [
    opts.method,
    encodePath(opts.key),
    queryParts.join("&"),
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const signature = hmac(signingKey(cfg.s3SecretKey ?? "", dateStamp, region), stringToSign).toString("hex");

  return {
    method: opts.method,
    url: `${endpoint}/${opts.bucket}/${encodePath(opts.key)}?${queryParts.join("&")}&X-Amz-Signature=${signature}`,
    headers: opts.contentType ? { "Content-Type": opts.contentType } : {},
  };
}

// ---------- memory backend (dev, no infra) ----------
const memStore = new Map<string, { bytes: Buffer; contentType: string }>();

export function memPut(key: string, bytes: Buffer, contentType: string): void {
  memStore.set(key, { bytes, contentType });
}

export function memGet(key: string): { bytes: Buffer; contentType: string } | null {
  return memStore.get(key) ?? null;
}

export function uploadBackend(): "memory" | "s3" {
  return config().uploadBackend ?? "memory";
}