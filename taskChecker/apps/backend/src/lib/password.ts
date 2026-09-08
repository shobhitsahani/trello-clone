import { createHash, scryptSync, randomBytes, timingSafeEqual, createHmac, createHash as _ch } from "node:crypto";

/**
 * Password hashing — Node's built-in scrypt (no native deps).
 * Format: scrypt$N$r$p$saltB64$hashB64
 */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, n, r, p, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(actual, expected);
}

/** Hash a secret (API key, invite/refresh token) for at-rest storage — the DB
 * never holds the plaintext (docs/design §6: hash-at-rest). */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** HMAC-SHA256 signature for webhook payloads (X-TeamFlow-Signature). */
export function signPayload(secret: string, body: string, timestamp: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// ---------- secret encryption (webhook signing secrets) ----------
// Webhook deliveries must HMAC-sign payloads, so the endpoint secret must be
// recoverable — but never stored in plaintext. AES-256-GCM with a key derived
// from the server secret; the plaintext is returned exactly once at creation.
import { createCipheriv, createDecipheriv } from "node:crypto";
import { config } from "../config.js";

function encryptionKey(): Buffer {
  return createHash("sha256").update(config().jwtSecret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${enc.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}

export function decryptSecret(stored: string): string {
  const [version, ivB64, dataB64, tagB64] = stored.split(".");
  if (version !== "v1" || !ivB64 || !dataB64 || !tagB64) throw new Error("Unsupported ciphertext version");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]).toString("utf8");
}

export { _ch as digest };