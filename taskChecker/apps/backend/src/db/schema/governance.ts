import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { t, now } from "./enums.js";

export const webhooks = pgTable("webhooks", {
  tenantId: uuid("tenant_id").notNull(),
  id: uuid("id").notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  secretHash: text("secret_hash").notNull(),
  events: text("events").array().notNull().default(sql`'{}'::text[]`),
  active: boolean("active").notNull().default(true),
  createdAt: t("created_at").default(now()),
}, (table) => [
  index("webhooks_tenant_created_idx").on(table.tenantId, table.createdAt),
]);

export const deliveries = pgTable(
  "deliveries",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").notNull(),
    endpointId: uuid("endpoint_id").notNull(),
    event: text("event").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("pending"), // pending|delivered|failed
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: t("next_attempt_at"),
    lastError: text("last_error"),
    createdAt: t("created_at").default(now()),
  },
  (table) => [index("deliveries_endpoint_idx").on(table.tenantId, table.endpointId, table.status)]
);

export const apiKeys = pgTable("api_keys", {
  tenantId: uuid("tenant_id").notNull(),
  id: uuid("id").notNull(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
  revokedAt: t("revoked_at"),
  lastUsedAt: t("last_used_at"),
  createdAt: t("created_at").default(now()),
}, (table) => [
  index("api_keys_hash_idx").on(table.keyHash),
  index("api_keys_tenant_created_idx").on(table.tenantId, table.createdAt),
]);

export const usageMeter = pgTable("usage_meter", {
  tenantId: uuid("tenant_id").notNull(),
  metric: text("metric").notNull(), // api_calls | storage_bytes | seats | ...
  ts: t("ts").notNull(),
  value: integer("value").notNull().default(1),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").notNull(),
    actorId: uuid("actor_id").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    ip: text("ip"),
    createdAt: t("created_at").default(now()),
  },
  (table) => [index("audit_tenant_ts_idx").on(table.tenantId, table.createdAt),
    index("audit_tenant_created_id_idx").on(table.tenantId, table.createdAt, table.id)]
);

export const idempotency = pgTable("idempotency", {
  tenantId: uuid("tenant_id").notNull(),
  key: text("key").notNull(),
  response: jsonb("response").$type<Record<string, unknown>>().notNull(),
  createdAt: t("created_at").default(now()),
});
