import { describe, expect, it } from "bun:test";
import { deterministicUuid, isUuidv7, uuidv7, uuidv7Timestamp } from "../src/lib/ids.js";

describe("uuidv7", () => {
  it("generates RFC-9562-shaped ids with version 7", () => {
    const id = uuidv7();
    expect(isUuidv7(id)).toBe(true);
    expect(id[14]).toBe("7");
  });

  it("embeds a current ms timestamp (k-sorted)", () => {
    const before = Date.now();
    const id = uuidv7();
    const after = Date.now();
    const ts = uuidv7Timestamp(id);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("sorts lexicographically for later ids generated after a tick", async () => {
    const a = uuidv7();
    await Bun.sleep(3); // ensure the ms clock advances
    const b = uuidv7();
    expect(b > a).toBe(true);
  });

  it("is unique across a burst (no coordination needed)", () => {
    const ids = new Set(Array.from({ length: 5_000 }, () => uuidv7()));
    expect(ids.size).toBe(5_000);
  });
});

describe("deterministicUuid", () => {
  it("is stable for the same seed (idempotent redelivery)", () => {
    expect(deterministicUuid("evt-1:user-9")).toBe(deterministicUuid("evt-1:user-9"));
  });

  it("differs across seeds", () => {
    expect(deterministicUuid("evt-1:user-9")).not.toBe(deterministicUuid("evt-1:user-10"));
  });
});