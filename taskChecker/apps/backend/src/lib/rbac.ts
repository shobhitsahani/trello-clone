/** RBAC — org-level roles ordered by weight; every admin/mutating surface
 * checks against these. (Project-scoped roles are a later rung; the seams are
 * role enum + one function.) */
import { ApiError, forbidden } from "./errors.js";
import { roleEnum } from "../db/schema.js";

export type Role = (typeof roleEnum.enumValues)[number]; // owner|admin|member|viewer

export const ROLE_WEIGHT: Record<Role, number> = { owner: 100, admin: 70, member: 30, viewer: 1 };

export function roleAtLeast(role: Role | undefined, min: Role): boolean {
  if (!role) return false;
  return ROLE_WEIGHT[role] >= ROLE_WEIGHT[min];
}

/** Throws 403 unless the caller's role meets the floor. */
export function requireRole(role: Role | undefined | null, min: Role): void {
  if (!roleAtLeast(role ?? undefined, min)) {
    throw new ApiError(403, "forbidden", `Requires the ${min} role or higher.`);
  }
}

export function assertRole(role: Role | undefined, min: Role) {
  requireRole(role, min);
}

/** Writes need member+; admin surfaces need admin+; owners can do everything. */
export const Rbac = {
  read: "viewer" as Role,
  write: "member" as Role,
  admin: "admin" as Role,
  owner: "owner" as Role,
};

// re-export for call-sites convenience
export { forbidden };