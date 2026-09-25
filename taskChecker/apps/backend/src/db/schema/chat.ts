import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { now, t } from "./enums.js";

export interface ChatAttachment {
  url: string;
  name: string;
  mime: string;
  size: number;
}

export const chatMessages = pgTable(
  "chat_messages",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").notNull(),
    authorId: uuid("author_id").notNull(),
    body: text("body").notNull(),
    /** Inline image/file attachments: [{ url, name, mime, size }]. Data-URLs or /v1 download URLs. */
    attachments: jsonb("attachments").$type<ChatAttachment[]>().notNull().default([]),
    /** Resolved @mention user ids (in addition to body text parsing). */
    mentions: jsonb("mentions").$type<string[]>().notNull().default([]),
    /** Sender's IANA timezone, e.g. "Asia/Kolkata" — for the local-time badge. */
    clientTz: text("client_tz"),
    /** Sender's wall-clock ISO string at send time (local time report). */
    clientLocalTime: text("client_local_time"),
    createdAt: t("created_at").default(now()),
    deletedAt: t("deleted_at"),
  },
  (table) => [index("chat_messages_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("chat_messages_tenant_created_id_idx").on(table.tenantId, table.createdAt, table.id)]
);

export const chatReactions = pgTable(
  "chat_reactions",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").notNull(),
    messageId: uuid("message_id").notNull(),
    userId: uuid("user_id").notNull(),
    emoji: text("emoji").notNull(),
    createdAt: t("created_at").default(now()),
  },
  (table) => [index("chat_reactions_message_idx").on(table.tenantId, table.messageId, table.createdAt)]
);
