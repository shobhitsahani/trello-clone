import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { planEnum, t, now } from "./enums.js";

// ---------- global (non-tenant) tables ----------
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: planEnum("plan").notNull().default("free"),
  status: text("status").notNull().default("active"),
  createdAt: t("created_at").default(now()),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: t("created_at").default(now()),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: t("expires_at").notNull(),
  revokedAt: t("revoked_at"),
  createdAt: t("created_at").default(now()),
});
