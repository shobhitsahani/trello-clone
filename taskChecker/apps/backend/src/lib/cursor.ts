/**
 * Cursor pagination — opaque, keyset-based over (created_at, id).
 * Encodes the sort key tuple so pages stay stable while new rows arrive.
 * (docs/design/teamflow.md §3: cursor, capped limit.)
 */
import { uuidv7 } from "./ids.js";

export interface Cursor {
  createdAt: string; // ISO timestamp
  id: string;
}

export function encodeCursor(createdAt: Date | string, id: string): string {
  const cursor: Cursor = {
    createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
    id,
  };
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Cursor;
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseLimit(raw: string | undefined, max = 100, def = 50): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return def;
  return Math.min(n, max);
}

export { uuidv7 };