import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { membershipStatusEnum, roleEnum, t, now } from "./enums.js";

/** RBAC anchor: (tenant_id, user_id) with role + status. */
export const memberships = pgTable(
  "memberships",
  {
    tenantId: uuid("tenant_id").notNull(),
    userId: uuid("user_id").notNull(),
    role: roleEnum("role").notNull(),
    status: membershipStatusEnum("status").notNull().default("active"),
    invitedAt: t("invited_at").default(now()),
    acceptedAt: t("accepted_at"),
  },
  (table) => [index("memberships_user_idx").on(table.userId)]
);

export const invites = pgTable("invites", {
  tenantId: uuid("tenant_id").notNull(),
  id: uuid("id").notNull(),
  email: text("email").notNull(),
  role: roleEnum("role").notNull().default("member"),
  tokenHash: text("token_hash").notNull(),
  expiresAt: t("expires_at").notNull(),
  acceptedAt: t("accepted_at"),
  invitedById: uuid("invited_by_id").notNull(),
  createdAt: t("created_at").default(now()),
});
