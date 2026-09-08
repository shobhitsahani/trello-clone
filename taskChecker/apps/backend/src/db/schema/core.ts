import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { t, now } from "./enums.js";

export const teams = pgTable("teams", {
  tenantId: uuid("tenant_id").notNull(),
  id: uuid("id").notNull(),
  name: text("name").notNull(),
  createdAt: t("created_at").default(now()),
  deletedAt: t("deleted_at"),
});

export const projects = pgTable("projects", {
  tenantId: uuid("tenant_id").notNull(),
  id: uuid("id").notNull(),
  teamId: uuid("team_id"),
  name: text("name").notNull(),
  key: text("key").notNull(), // unique within tenant: PROJ
  createdAt: t("created_at").default(now()),
  deletedAt: t("deleted_at"),
});
