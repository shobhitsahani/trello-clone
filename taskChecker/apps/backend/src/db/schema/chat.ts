import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { now, t } from "./enums.js";

export const chatMessages = pgTable(
  "chat_messages",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").notNull(),
    authorId: uuid("author_id").notNull(),
    body: text("body").notNull(),
    createdAt: t("created_at").default(now()),
    deletedAt: t("deleted_at"),
  },
  (table) => [index("chat_messages_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("chat_messages_tenant_created_id_idx").on(table.tenantId, table.createdAt, table.id)]
);
