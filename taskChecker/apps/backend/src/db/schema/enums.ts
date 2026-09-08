import { sql } from "drizzle-orm";
import { customType, pgEnum, timestamp } from "drizzle-orm/pg-core";

// ---------- types & enums ----------
export const planEnum = pgEnum("teamflow_plan", ["free", "pro", "business"]);
export const roleEnum = pgEnum("membership_role", ["owner", "admin", "member", "viewer"]);
export const membershipStatusEnum = pgEnum("membership_status", ["invited", "active", "deactivated"]);
export const taskStatusEnum = pgEnum("task_status", ["backlog", "todo", "in_progress", "in_review", "done"]);
export const taskPriorityEnum = pgEnum("task_priority", ["critical", "high", "medium", "low", "none"]);

// postgres-js driver returns tsvector as string; DB COLUMN is tsvector.
export const tsvector = (name: string) =>
  customType<{ data: string; driverData: string }>({
    dataType() {
      return "tsvector";
    },
    toDriver(value: string) {
      return value;
    },
    fromDriver(value: string) {
      return value;
    },
  })(name);

export const now = () => sql`now()`;
export const t = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
