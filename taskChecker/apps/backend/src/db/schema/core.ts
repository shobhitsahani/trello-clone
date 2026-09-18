import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { t, now, taskStatusEnum } from "./enums.js";

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

/** Per-project board list display names: optional label per (project, status).
 * Absent rows fall back to built-in defaults. Renames are cosmetic — task
 * placement still uses the task_status enum. */
export const projectListLabels = pgTable("project_list_labels", {
  tenantId: uuid("tenant_id").notNull(),
  projectId: uuid("project_id").notNull(),
  status: taskStatusEnum("status").notNull(),
  label: text("label").notNull(),
  updatedAt: t("updated_at").default(now()),
}, (table) => [
  index("project_list_labels_project_idx").on(table.tenantId, table.projectId),
]);
