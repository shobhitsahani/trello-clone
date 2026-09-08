import { describe, expect, it } from "bun:test";
import { decodeCursor, encodeCursor, parseLimit } from "../src/lib/cursor.js";

describe("cursor pagination", () => {
  it("round-trips the (created_at, id) sort key", () => {
    const at = new Date("2026-01-15T10:30:00.000Z");
    const token = encodeCursor(at, "018f4d2e-7000-7000-8000-000000000000");
    const decoded = decodeCursor(token);
    expect(decoded?.createdAt).toBe("2026-01-15T10:30:00.000Z");
    expect(decoded?.id).toBe("018f4d2e-7000-7000-8000-000000000000");
  });

  it("returns null for tampered cursors (no 500s)", () => {
    expect(decodeCursor("!!!not-base64url!!!")).toBeNull();
    expect(decodeCursor(Buffer.from('{"nonsense":true}').toString("base64url"))).toBeNull();
  });

  it("caps page size", () => {
    expect(parseLimit("500")).toBe(100);
    expect(parseLimit(undefined)).toBe(50);
    expect(parseLimit("10")).toBe(10);
    expect(parseLimit("-3")).toBe(50);
  });
});