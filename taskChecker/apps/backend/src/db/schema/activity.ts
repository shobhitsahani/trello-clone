import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { t, now } from "./enums.js";

export const activityEvents = pgTable(
  "activity",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").notNull(),
    actorId: uuid("actor_id"),
    entityType: text("entity_type").notNull(), // task | comment | project | team | membership
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(), // created | updated | status_changed | commented | ...
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: t("created_at").default(now()),
  },
  (table) => [index("activity_entity_idx").on(table.tenantId, table.entityType, table.entityId, table.createdAt)]
);

export const notifications = pgTable(
  "notifications",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").notNull(),
    userId: uuid("user_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    readAt: t("read_at"),
    createdAt: t("created_at").default(now()),
    deletedAt: t("deleted_at"),
  },
  (table) => [index("notifications_user_idx").on(table.tenantId, table.userId, table.readAt, table.createdAt)]
);
