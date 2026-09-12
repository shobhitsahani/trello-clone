import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { taskPriorityEnum, taskStatusEnum, tsvector, t, now } from "./enums.js";

export const tasks = pgTable(
  "tasks",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").notNull(),
    projectId: uuid("project_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: taskStatusEnum("status").notNull().default("backlog"),
    priority: taskPriorityEnum("priority").notNull().default("none"),
    assigneeId: uuid("assignee_id"),
    reporterId: uuid("reporter_id"),
    dueAt: t("due_at"),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'B')`
    ),
    createdAt: t("created_at").default(now()),
    updatedAt: t("updated_at").default(now()).$onUpdate(() => new Date()),
    deletedAt: t("deleted_at"),
  },
  (table) => [
    index("tasks_project_status_idx").on(table.tenantId, table.projectId, table.status, table.createdAt),
    index("tasks_assignee_status_idx").on(table.tenantId, table.assigneeId, table.status),
    index("tasks_updated_idx").on(table.tenantId, table.updatedAt),
    index("tasks_tenant_created_id_idx").on(table.tenantId, table.createdAt, table.id),
  ]
);

export const comments = pgTable(
  "comments",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").notNull(),
    taskId: uuid("task_id").notNull(),
    authorId: uuid("author_id").notNull(),
    body: text("body").notNull(),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(body, '')), 'A')`
    ),
    createdAt: t("created_at").default(now()),
    deletedAt: t("deleted_at"),
  },
  (table) => [index("comments_task_idx").on(table.tenantId, table.taskId, table.createdAt),
    index("comments_tenant_task_created_id_idx").on(table.tenantId, table.taskId, table.createdAt, table.id)]
);

export const attachments = pgTable(
  "attachments",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").notNull(),
    taskId: uuid("task_id"),
    uploaderId: uuid("uploader_id").notNull(),
    fileName: text("file_name").notNull(),
    objectKey: text("object_key").notNull(),
    size: integer("size").notNull(),
    contentType: text("content_type").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: t("created_at").default(now()),
    deletedAt: t("deleted_at"),
  },
  (table) => [index("attachments_task_idx").on(table.tenantId, table.taskId)]
);
