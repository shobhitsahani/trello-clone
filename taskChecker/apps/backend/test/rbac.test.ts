import { describe, expect, it } from "bun:test";
import { Rbac, requireRole, roleAtLeast } from "../src/lib/rbac.js";
import { ApiError } from "../src/lib/errors.js";

describe("rbac", () => {
  it("orders roles owner > admin > member > viewer", () => {
    expect(roleAtLeast("owner", Rbac.admin)).toBe(true);
    expect(roleAtLeast("admin", Rbac.admin)).toBe(true);
    expect(roleAtLeast("member", Rbac.admin)).toBe(false);
    expect(roleAtLeast("viewer", Rbac.write)).toBe(false);
    expect(roleAtLeast("viewer", Rbac.read)).toBe(true);
  });

  it("throws 403 with the required floor named", () => {
    try {
      requireRole("member", Rbac.admin);
      throw new Error("should not reach");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      if (err instanceof ApiError) {
        expect(err.status).toBe(403);
        expect(err.message).toContain("admin");
      }
    }
  });

  it("never lets undefined roles through", () => {
    expect(roleAtLeast(undefined, Rbac.read)).toBe(false);
  });
});