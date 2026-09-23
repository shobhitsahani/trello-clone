/**
 * Drizzle schema mirror for TeamFlow's Postgres system of record.
 * Modularized domain schemas.
 */
export * from "./enums.js";
export * from "./auth.js";
export * from "./orgs.js";
export * from "./core.js";
export * from "./tasks.js";
export * from "./chat.js";
export * from "./activity.js";
export * from "./governance.js";

import { tenants, users, refreshTokens } from "./auth.js";
import { memberships, invites } from "./orgs.js";
import { teams, projects } from "./core.js";
import { tasks, comments, attachments } from "./tasks.js";
import { chatMessages, chatReactions } from "./chat.js";
import { activityEvents, notifications } from "./activity.js";
import { webhooks, deliveries, apiKeys, usageMeter, auditLogs, idempotency } from "./governance.js";

export type Tenant = typeof tenants.$inferSelect;
export type User = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Webhook = typeof webhooks.$inferSelect;
export type Delivery = typeof deliveries.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;

export const schema = {
  tenants,
  users,
  refreshTokens,
  memberships,
  teams,
  projects,
  tasks,
  comments,
  attachments,
  chatMessages,
  chatReactions,
  activityEvents,
  notifications,
  invites,
  webhooks,
  deliveries,
  apiKeys,
  usageMeter,
  auditLogs,
  idempotency,
};
