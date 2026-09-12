import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { t, now } from "./enums.js";

export const teams = pgTable("teams", {
  tenantId: uuid("tenant_id").notNull(),
  id: uuid("id").notNull(),
  name: text("name").notNull(),
  createdAt: t("created_at").default(now()),
  deletedAt: t("deleted_at"),
}, (table) => [
  index("teams_tenant_created_idx").on(table.tenantId, table.createdAt),
]);

export const projects = pgTable("projects", {
  tenantId: uuid("tenant_id").notNull(),
  id: uuid("id").notNull(),
  teamId: uuid("team_id"),
  name: text("name").notNull(),
  key: text("key").notNull(), // unique within tenant: PROJ
  createdAt: t("created_at").default(now()),
  deletedAt: t("deleted_at"),
}, (table) => [
  index("projects_tenant_created_idx").on(table.tenantId, table.createdAt),
]);
