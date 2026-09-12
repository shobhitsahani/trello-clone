/** Deadline predicate — pure logic, no database needed. */
import { describe, expect, it } from "bun:test";
import { isOverdueDue } from "../src/worker/deadlines.js";

const NOW = new Date("2026-09-12T12:00:00.000Z").getTime();

describe("isOverdueDue", () => {
  it("flags open tasks past their deadline", () => {
    expect(isOverdueDue("2026-09-12T11:59:00.000Z", "todo", NOW)).toBe(true);
    expect(isOverdueDue("2026-09-12T11:59:00.000Z", "in_progress", NOW)).toBe(true);
  });

  it("ignores done and backlog tasks even when past due", () => {
    expect(isOverdueDue("2026-09-12T11:59:00.000Z", "done", NOW)).toBe(false);
    expect(isOverdueDue("2026-09-12T11:59:00.000Z", "backlog", NOW)).toBe(false);
  });

  it("ignores future deadlines and missing data", () => {
    expect(isOverdueDue("2026-09-12T12:01:00.000Z", "todo", NOW)).toBe(false);
    expect(isOverdueDue(null, "todo", NOW)).toBe(false);
    expect(isOverdueDue("2026-09-12T11:59:00.000Z", undefined, NOW)).toBe(false);
    expect(isOverdueDue("not-a-date", "todo", NOW)).toBe(false);
  });
});
