/**
 * UUIDv7 — time-sortable 128-bit IDs, generated anywhere with zero coordination.
 *
 * Layout (RFC 9562): 48-bit ms-epoch prefix | version 7 | random | variant 8b
 * Rationale (see docs/design/teamflow.md §5): sortable without a sort column,
 * no central sequence (no write serialization), no enumeration.
 */
import { createHash } from "node:crypto";

export function uuidv7(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const ts = BigInt(Date.now()); // ms since epoch

  // 48-bit timestamp, big-endian: ms-epoch fits (~10889 years from epoch).
  for (let i = 0; i < 6; i++) {
    bytes[5 - i] = Number((ts >> BigInt(8 * i)) & 0xffn);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10xx

  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Returns the ms timestamp embedded in an RFC 9562 UUIDv7. */
export function uuidv7Timestamp(uuid: string): number {
  const hex = uuid.replace(/-/g, "");
  return Number.parseInt(hex.slice(0, 12), 16);
}

export function isUuidv7(uuid: string): boolean {
  return UUID_RE.test(uuid);
}

/** Random 32-byte token (refresh tokens, invite tokens) — encode base64url. */
export function randomToken(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Buffer.from(buf).toString("base64url");
}

/**
 * Deterministic, uuid7-shaped id derived ONLY from the seed — same seed ⇒ same
 * id, which is what makes consumer writes idempotent under at-least-once
 * redelivery (re-running the job updates the same row instead of duplicating).
 */
export function deterministicUuid(seed: string): string {
  const h = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-7${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20)}`;
}