import type { TaskStatus, Priority, Role } from "./utils";

/* ================================================================
   TEAMFLOW mock domain data
   Every entity carries tenant context. Shared by server & client.
   ================================================================ */

const NOW = Date.now();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const hoursAgo = (n: number) => new Date(NOW - n * 3_600_000).toISOString();
const minsAgo = (n: number) => new Date(NOW - n * 60_000).toISOString();

/* ---------- organizations (tenants) ---------- */

export type Org = {
  id: string;
  name: string;
  slug: string;
  hue: number;
  plan: PlanId;
  seats: number;
  region: string;
  createdAt: string;
};

export const ORGS: Org[] = [
  {
    id: "org_nova",
    name: "Nova Labs",
    slug: "nova-labs",
    hue: 38, // amber — the work-light
    plan: "growth",
    seats: 25,
    region: "us-east-1",
    createdAt: daysAgo(310),
  },
  {
    id: "org_ferrum",
    name: "Ferrum Systems",
    slug: "ferrum",
    hue: 188, // cool cyan
    plan: "scale",
    seats: 80,
    region: "eu-west-1",
    createdAt: daysAgo(520),
  },
  {
    id: "org_arc",
    name: "Arc Retail",
    slug: "arc-retail",
    hue: 272, // violet
    plan: "starter",
    seats: 10,
    region: "us-west-2",
    createdAt: daysAgo(88),
  },
];

/* ---------- members ---------- */

export type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status?: "active" | "invited" | "deactivated";
  tint: number;
  title: string;
  lastActive: string;
  mfa?: boolean;
};

export const CURRENT_USER_ID = "u1";

export const MEMBERS: Member[] = [
  {
    id: "u1",
    name: "Priya Nair",
    email: "priya@novalabs.io",
    role: "owner",
    tint: 38,
    title: "CPO",
    lastActive: minsAgo(2),
    mfa: true,
  },
  {
    id: "u2",
    name: "Maya Okafor",
    email: "maya@novalabs.io",
    role: "admin",
    tint: 262,
    title: "Staff Engineer",
    lastActive: minsAgo(9),
    mfa: true,
  },
  {
    id: "u3",
    name: "Jonas Weber",
    email: "jonas@novalabs.io",
    role: "admin",
    tint: 150,
    title: "Eng Lead, Platform",
    lastActive: minsAgo(26),
  },
  {
    id: "u4",
    name: "Leo Fontaine",
    email: "leo@novalabs.io",
    role: "member",
    tint: 200,
    title: "Frontend Engineer",
    lastActive: minsAgo(41),
  },
  {
    id: "u5",
    name: "Sara Khoury",
    email: "sara@novalabs.io",
    role: "member",
    tint: 330,
    title: "Product Designer",
    lastActive: hoursAgo(1),
  },
  {
    id: "u6",
    name: "Tomás Rivera",
    email: "tomas@novalabs.io",
    role: "member",
    tint: 28,
    title: "Backend Engineer",
    lastActive: hoursAgo(2),
  },
  {
    id: "u7",
    name: "Emi Tanaka",
    email: "emi@novalabs.io",
    role: "viewer",
    tint: 92,
    title: "Customer Success",
    lastActive: hoursAgo(5),
  },
  {
    id: "u8",
    name: "Alex Chen",
    email: "alex@novalabs.io",
    role: "member",
    tint: 215,
    title: "Data Engineer",
    lastActive: daysAgo(1),
  },
];

/* ---------- teams ---------- */

export type Team = {
  id: string;
  name: string;
  slug: string;
  description: string;
  memberIds: string[];
};

export const TEAMS: Team[] = [
  {
    id: "t_platform",
    name: "Platform",
    slug: "platform",
    description: "Multi-tenant core, auth, realtime, integrations.",
    memberIds: ["u1", "u2", "u3", "u4", "u6"],
  },
  {
    id: "t_product",
    name: "Product",
    slug: "product",
    description: "The app surface members touch every day.",
    memberIds: ["u1", "u4", "u5", "u7"],
  },
  {
    id: "t_data",
    name: "Data & Analytics",
    slug: "data",
    description: "Usage metering, audit, search, reporting.",
    memberIds: ["u2", "u6", "u8"],
  },
];

/* ---------- projects ---------- */

export type Project = {
  id: string;
  key: string;
  name: string;
  description: string;
  teamId: string;
  status: "active" | "planned" | "paused";
  hue: number;
  leadId: string;
  progress: number;
  updatedAt: string;
};

export const PROJECTS: Project[] = [
  {
    id: "p_orbit",
    key: "NOVA",
    name: "Orbit — tenant isolation core",
    description:
      "Hard tenant boundary: RLS, tenant-scoped queries, invite/RBAC, and the audit trail.",
    teamId: "t_platform",
    status: "active",
    hue: 38,
    leadId: "u2",
    progress: 62,
    updatedAt: minsAgo(6),
  },
  {
    id: "p_helios",
    key: "HEL",
    name: "Helios mobile companion",
    description:
      "Read-only mobile view of boards and my work, with push via webhooks.",
    teamId: "t_product",
    status: "active",
    hue: 330,
    leadId: "u5",
    progress: 38,
    updatedAt: hoursAgo(1),
  },
  {
    id: "p_meridian",
    key: "MER",
    name: "Meridian data plane",
    description:
      "Usage metering, full-text search over tasks and comments, quarterly audit archive.",
    teamId: "t_data",
    status: "active",
    hue: 215,
    leadId: "u8",
    progress: 81,
    updatedAt: hoursAgo(3),
  },
  {
    id: "p_arc",
    key: "ARC",
    name: "Arc console refresh",
    description:
      "New member surface: command palette, notification center, and the flow rail.",
    teamId: "t_product",
    status: "planned",
    hue: 200,
    leadId: "u1",
    progress: 12,
    updatedAt: daysAgo(2),
  },
  {
    id: "p_relay",
    key: "REL",
    name: "Relay webhooks + API",
    description:
      "Outbound webhooks, API keys, signed delivery, and the public REST surface.",
    teamId: "t_platform",
    status: "active",
    hue: 150,
    leadId: "u6",
    progress: 54,
    updatedAt: hoursAgo(5),
  },
];
/* ---------- tasks ---------- */

export type Task = {
  id: string;
  key: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  projectId: string;
  assigneeId?: string;
  reporterId?: string;
  creatorId: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  due?: string;
  dueAt?: string;
  deletedAt?: string;
  comments: number;
  estimate?: number;
};

const T = (
  id: string,
  key: string,
  title: string,
  status: TaskStatus,
  priority: Priority,
  projectId: string,
  extra: Partial<Task> = {}
): Task =>
  ({
    id,
    key,
    title,
    status,
    priority,
    projectId,
    creatorId: extra.creatorId ?? "u1",
    labels: extra.labels ?? [],
    createdAt: extra.createdAt ?? daysAgo(6),
    updatedAt: extra.updatedAt ?? hoursAgo(20),
    comments: extra.comments ?? 0,
    description:
      extra.description ??
      "No description yet. Press the field to write acceptance notes, links, or context for the assignee.",
    ...extra,
  }) as Task;

export const TASKS: Task[] = [
  T("t01", "NOVA-112", "Enforce tenant_id on every task query", "in_progress", "critical", "p_orbit", {
    assigneeId: "u3",
    comments: 6,
    estimate: 8,
    updatedAt: minsAgo(12),
    createdAt: daysAgo(9),
    labels: ["security", "p0"],
    description:
      "All read paths must resolve org context from the authenticated member, never trust client-scoped ids. Add integration tests asserting cross-tenant 404s.",
  }),
  T("t02", "NOVA-111", "Postgres RLS policy for comments table", "in_review", "high", "p_orbit", {
    assigneeId: "u2",
    comments: 4,
    estimate: 5,
    updatedAt: hoursAgo(2),
    labels: ["security"],
    description:
      "Write a tenant-policy that joins comments→tasks→projects→orgs so a bare `SELECT` can never leak rows. Verify with planner and a tenant-switched session.",
  }),
  T("t03", "NOVA-109", "Invite flow: role-aware acceptance", "in_progress", "high", "p_orbit", {
    assigneeId: "u4",
    comments: 2,
    estimate: 6,
    updatedAt: hoursAgo(1),
    labels: ["rbac", "auth"],
    description:
      "Email token → org join. Acceptance should carry the invited role and a one-time idempotency guard.",
  }),
  T("t04", "NOVA-104", "Audit trail for admin mutations", "done", "medium", "p_orbit", {
    assigneeId: "u2",
    comments: 1,
    estimate: 6,
    updatedAt: daysAgo(1),
    labels: ["audit"],
  }),
  T("t05", "NOVA-101", "Soft-delete restore flow", "backlog", "medium", "p_orbit", {
    assigneeId: "u6",
    estimate: 4,
    createdAt: daysAgo(12),
    labels: ["core"],
    description:
      "Deleted tasks/attachments keep tenant-bound tombstones for 30 days. Restore must replay the audit entry.",
  }),
  T("t06", "NOVA-098", "Reader role: hide mutations everywhere", "todo", "high", "p_orbit", {
    assigneeId: "u5",
    estimate: 3,
    updatedAt: hoursAgo(6),
    labels: ["rbac"],
  }),
  T("t07", "NOVA-095", "Rate limit headers per API key", "done", "medium", "p_arc", {
    assigneeId: "u6",
    estimate: 3,
    updatedAt: daysAgo(2),
    labels: ["api"],
  }),
  T("t08", "NOVA-116", "Webhook delivery with backoff + replay", "in_progress", "high", "p_relay", {
    assigneeId: "u6",
    comments: 3,
    estimate: 8,
    updatedAt: minsAgo(32),
    labels: ["integrations"],
    description:
      "Deliver on task/comment events with exponential backoff, HMAC signatures, and a 7-day replay window.",
  }),
  T("t09", "NOVA-115", "API key create + reveal once", "done", "medium", "p_relay", {
    assigneeId: "u3",
    estimate: 4,
    updatedAt: hoursAgo(7),
    labels: ["api"],
  }),
  T("t10", "NOVA-113", "Cursor-based WS catch-up after reconnect", "in_progress", "critical", "p_orbit", {
    assigneeId: "u3",
    comments: 5,
    estimate: 6,
    updatedAt: minsAgo(4),
    labels: ["realtime"],
    description:
      "Client reconnects with last-seen cursor; server replays missed task/comment events before re-subscribing.",
  }),
  T("t11", "NOVA-108", "Full-text search over comments", "in_review", "medium", "p_meridian", {
    assigneeId: "u8",
    comments: 2,
    estimate: 5,
    updatedAt: hoursAgo(3),
    labels: ["search"],
  }),
  T("t12", "NOVA-103", "Usage meter for API calls per tenant", "done", "medium", "p_meridian", {
    assigneeId: "u8",
    estimate: 4,
    updatedAt: daysAgo(3),
    labels: ["metering"],
  }),
  T("t13", "NOVA-106", "Notification fan-out via Redis pub/sub", "in_review", "high", "p_orbit", {
    assigneeId: "u2",
    comments: 3,
    estimate: 5,
    updatedAt: hoursAgo(2),
    labels: ["realtime", "redis"],
  }),
  T("t14", "NOVA-100", "Activity feed with per-org scoping", "done", "high", "p_arc", {
    assigneeId: "u5",
    estimate: 5,
    updatedAt: daysAgo(4),
    labels: ["activity"],
  }),
  T("t15", "HEL-021", "Boards surfaced in mobile read-only", "backlog", "low", "p_helios", {
    assigneeId: "u4",
    estimate: 13,
    createdAt: daysAgo(14),
    updatedAt: daysAgo(1),
    labels: ["mobile"],
  }),
  T("t16", "HEL-019", "Deep-link from push notification to task", "todo", "medium", "p_helios", {
    assigneeId: "u5",
    estimate: 3,
    updatedAt: hoursAgo(9),
    labels: ["mobile"],
  }),
  T("t17", "HEL-015", "Comments sync over WS on Helios", "in_progress", "high", "p_helios", {
    assigneeId: "u4",
    comments: 1,
    estimate: 5,
    updatedAt: hoursAgo(3),
    labels: ["realtime", "mobile"],
  }),
  T("t18", "MER-034", "Quarterly audit archive job", "todo", "medium", "p_meridian", {
    assigneeId: "u8",
    estimate: 3,
    updatedAt: hoursAgo(11),
    labels: ["audit", "jobs"],
  }),
  T("t19", "MER-030", "Search typo tolerance (trigram)", "backlog", "low", "p_meridian", {
    assigneeId: "u8",
    estimate: 8,
    createdAt: daysAgo(11),
    labels: ["search"],
  }),
  T("t20", "ARC-042", "Flow rail on dashboard", "done", "medium", "p_arc", {
    assigneeId: "u5",
    estimate: 4,
    updatedAt: daysAgo(3),
    labels: ["ui"],
  }),
  T("t21", "ARC-040", "Command palette (⌘K)", "in_progress", "high", "p_arc", {
    assigneeId: "u4",
    comments: 2,
    estimate: 6,
    updatedAt: hoursAgo(2),
    labels: ["ui"],
  }),
  T("t22", "ARC-038", "Notification center with bulk-mark-read", "in_review", "medium", "p_arc", {
    assigneeId: "u5",
    estimate: 4,
    updatedAt: hoursAgo(1),
    labels: ["ui"],
  }),
  T("t23", "NOVA-120", "SSO (OIDC) for Growth plan", "backlog", "high", "p_orbit", {
    assigneeId: "u3",
    estimate: 8,
    createdAt: daysAgo(4),
    updatedAt: daysAgo(2),
    labels: ["auth", "billing"],
  }),
  T("t24", "NOVA-117", "Tenant-switch audit smoke test", "todo", "critical", "p_orbit", {
    assigneeId: "u2",
    estimate: 2,
    updatedAt: hoursAgo(4),
    labels: ["security", "testing"],
  }),
  T("t25", "REL-011", "Sign webhook payloads (HMAC-SHA256)", "done", "high", "p_relay", {
    assigneeId: "u6",
    estimate: 2,
    updatedAt: daysAgo(1),
    labels: ["integrations"],
  }),
  T("t26", "REL-009", "Delivery log with body capture", "in_progress", "medium", "p_relay", {
    assigneeId: "u3",
    estimate: 4,
    updatedAt: hoursAgo(8),
    labels: ["integrations"],
  }),
  T("t27", "MER-028", "Export usage to CSV per tenant", "done", "low", "p_meridian", {
    assigneeId: "u8",
    estimate: 2,
    updatedAt: daysAgo(5),
    labels: ["metering"],
  }),
  T("t28", "HEL-012", "Offline badge for viewers", "backlog", "low", "p_helios", {
    assigneeId: "u7",
    estimate: 2,
    createdAt: daysAgo(9),
    updatedAt: daysAgo(6),
  }),
];

/* ---------- comments ---------- */

export type CommentT = {
  id: string;
  taskId?: string;
  taskKey: string;
  authorId: string;
  body: string;
  createdAt: string;
};

export const COMMENTS: CommentT[] = [
  {
    id: "c1",
    taskKey: "NOVA-112",
    authorId: "u3",
    body: "The route handler now resolves org from the session before any datastore call. I left a failing test for the cross-tenant case — neighbors return 404.",
    createdAt: hoursAgo(6),
  },
  {
    id: "c2",
    taskKey: "NOVA-112",
    authorId: "u2",
    body: "Confirmed the 404 path covers deleted orgs too, so we never leak existence. Also added RETURNING tenant_id on the write path.",
    createdAt: hoursAgo(3),
  },
  {
    id: "c3",
    taskKey: "NOVA-112",
    authorId: "u6",
    body: "p99 read latency is +3ms with the extra RLS join. Still under the 250ms budget. Flagging for the perf review.",
    createdAt: minsAgo(18),
  },
  {
    id: "c4",
    taskKey: "NOVA-113",
    authorId: "u3",
    body: "Catch-up replays events since cursor [last_seen, now], cap 500. Anything older falls back to a full fetch.",
    createdAt: hoursAgo(2),
  },
  {
    id: "c5",
    taskKey: "NOVA-113",
    authorId: "u1",
    body: "Can we also surface the reconnect latency in the scope strip? Nice signal for support tickets.",
    createdAt: minsAgo(8),
  },
  {
    id: "c6",
    taskKey: "ARC-040",
    authorId: "u4",
    body: "Filtering is now deferred — input stays crisp on slow machines. Keyboard only: ↑↓ to move, Enter to jump.",
    createdAt: hoursAgo(5),
  },
  {
    id: "c7",
    taskKey: "ARC-042",
    authorId: "u5",
    body: "The rail keeps the amber only on the active lane — everything else stays quiet, so the light reads as motion.",
    createdAt: daysAgo(1),
  },
  {
    id: "c8",
    taskKey: "NOVA-098",
    authorId: "u7",
    body: "As a viewer I never see mutate controls now, and the empty state explains what I *can* do. Nice.",
    createdAt: hoursAgo(7),
  },
];
/* ---------- activity feed ---------- */

export type ActivityItem = {
  id: string;
  tenantId?: string;
  actorId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  targetTitle?: string;
  targetHref?: string;
  detail?: string;
  meta?: Record<string, unknown>;
  kind?: "task" | "member" | "project" | "system" | "integration";
  createdAt: string;
};

export const ACTIVITY: ActivityItem[] = [
  {
    id: "a1",
    actorId: "u3",
    action: "moved",
    targetTitle: "NOVA-112 — Enforce tenant_id on every task query",
    targetHref: "/app/tasks/NOVA-112",
    detail: "Ready → In progress",
    kind: "task",
    createdAt: minsAgo(12),
  },
  {
    id: "a2",
    actorId: "u1",
    action: "commented on",
    targetTitle: "NOVA-113 — Cursor-based WS catch-up",
    targetHref: "/app/tasks/NOVA-113",
    kind: "task",
    createdAt: minsAgo(9),
  },
  {
    id: "a3",
    actorId: "u6",
    action: "delivered relay webhook",
    targetTitle: "github → NOVA-116 release notes",
    targetHref: "/app/settings/integrations",
    detail: "200 OK",
    kind: "integration",
    createdAt: minsAgo(16),
  },
  {
    id: "a4",
    actorId: "u2",
    action: "approved",
    targetTitle: "NOVA-111 — RLS policy for comments",
    targetHref: "/app/tasks/NOVA-111",
    detail: "In review → ready to ship",
    kind: "task",
    createdAt: hoursAgo(2),
  },
  {
    id: "a5",
    actorId: "u5",
    action: "created",
    targetTitle: "ARC-044 — Notifications empty state polish",
    targetHref: "/app/tasks/ARC-044",
    kind: "task",
    createdAt: hoursAgo(3),
  },
  {
    id: "a6",
    actorId: "u1",
    action: "invited",
    targetTitle: "hanna@novalabs.io",
    targetHref: "/app/settings/members",
    detail: "as Member",
    kind: "member",
    createdAt: hoursAgo(4),
  },
  {
    id: "a7",
    actorId: "u8",
    action: "archived audit rows older than 12 mo",
    targetTitle: "Meridian data plane",
    targetHref: "/app/projects/p_meridian",
    detail: "184k rows",
    kind: "system",
    createdAt: hoursAgo(7),
  },
  {
    id: "a8",
    actorId: "u6",
    action: "created",
    targetTitle: "REL-009 — Delivery log with body capture",
    targetHref: "/app/tasks/REL-009",
    kind: "task",
    createdAt: hoursAgo(8),
  },
  {
    id: "a9",
    actorId: "u3",
    action: "merged",
    targetTitle: "NOVA-095 — Rate limit headers per API key",
    targetHref: "/app/tasks/NOVA-095",
    detail: "main",
    kind: "task",
    createdAt: daysAgo(2),
  },
];

/* ---------- notifications ---------- */

export type NotificationT = {
  id: string;
  kind: "mention" | "assign" | "status" | "comment" | "invite" | "system" | "webhook";
  title: string;
  msg: string;
  href: string;
  read: boolean;
  createdAt: string;
};

export const NOTIFICATIONS: NotificationT[] = [
  {
    id: "n1",
    kind: "mention",
    title: "Mentioned in NOVA-113",
    msg: "Jonas asked for the reconnect latency metric in the scope strip.",
    href: "/app/tasks/NOVA-113",
    read: false,
    createdAt: minsAgo(8),
  },
  {
    id: "n2",
    kind: "status",
    title: "NOVA-112 changed to In progress",
    msg: "Jonas Weber moved the task you follow.",
    href: "/app/tasks/NOVA-112",
    read: false,
    createdAt: minsAgo(12),
  },
  {
    id: "n3",
    kind: "comment",
    title: "New comment on ARC-040",
    msg: "Leo Fontaine posted: “Filtering is now deferred…”",
    href: "/app/tasks/ARC-040",
    read: false,
    createdAt: hoursAgo(2),
  },
  {
    id: "n4",
    kind: "assign",
    title: "Assigned ARC-042 — Flow rail on dashboard",
    msg: "Sara assigned this to you.",
    href: "/app/tasks/ARC-042",
    read: true,
    createdAt: hoursAgo(5),
  },
  {
    id: "n5",
    kind: "webhook",
    title: "Ghost deliveries surfacing",
    msg: "Relay webhook gitlab-events failed 3× in the last hour.",
    href: "/app/settings/integrations",
    read: true,
    createdAt: hoursAgo(8),
  },
  {
    id: "n6",
    kind: "system",
    title: "Usage at 68%",
    msg: "API calls this hour: 6,842 of 10,000 across the tenant.",
    href: "/app/settings/usage",
    read: false,
    createdAt: hoursAgo(11),
  },
];
/* ---------- audit log ---------- */

export type AuditEntry = {
  id: string;
  tenantId?: string;
  actorId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  resource?: string;
  detail?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  createdAt: string;
};

export const AUDIT: AuditEntry[] = [
  {
    id: "au1",
    actorId: "u1",
    action: "members.invite",
    resource: "hanna@novalabs.io",
    detail: "role=member",
    ip: "203.0.113.42",
    createdAt: hoursAgo(4),
  },
  {
    id: "au2",
    actorId: "u2",
    action: "task.soft_delete",
    resource: "NOVA-099",
    detail: "restore window 30d",
    ip: "198.51.100.7",
    createdAt: hoursAgo(9),
  },
  {
    id: "au3",
    actorId: "u1",
    action: "apikeys.create",
    resource: "ci-deploy",
    detail: "scopes=read:tasks,write:comments",
    ip: "203.0.113.42",
    createdAt: hoursAgo(12),
  },
  {
    id: "au4",
    actorId: "u6",
    action: "webhooks.create",
    resource: "gitlab-events",
    detail: "events=task.updated,comment.created",
    ip: "198.51.100.22",
    createdAt: daysAgo(1),
  },
  {
    id: "au5",
    actorId: "u2",
    action: "roles.change",
    resource: "u7",
    detail: "member → viewer",
    ip: "192.0.2.9",
    createdAt: daysAgo(1),
  },
  {
    id: "au6",
    actorId: "u1",
    action: "org.update",
    resource: "nova-labs",
    detail: "plan=growth, seats=25",
    ip: "203.0.113.42",
    createdAt: daysAgo(2),
  },
  {
    id: "au7",
    actorId: "u3",
    action: "task.migrate",
    resource: "NOVA-101",
    detail: "tenant-scoped query cleanup",
    ip: "192.0.2.14",
    createdAt: daysAgo(2),
  },
  {
    id: "au8",
    actorId: "u8",
    action: "audit.archive",
    resource: "audit_log",
    detail: "rows > 12mo → cold storage",
    ip: "192.0.2.31",
    createdAt: hoursAgo(7),
  },
  {
    id: "au9",
    actorId: "u5",
    action: "project.update",
    resource: "p_arc",
    detail: "status planned → active",
    ip: "203.0.113.99",
    createdAt: hoursAgo(26),
  },
  {
    id: "au10",
    actorId: "u2",
    action: "attachment.delete",
    resource: "n2f8…9c3a.png",
    detail: "org-owned blob, 2.1MB",
    ip: "198.51.100.7",
    createdAt: daysAgo(3),
  },
];
/* ---------- webhooks & api keys ---------- */

export type Webhook = {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  deliveries: number;
  failures: number;
  createdAt: string;
};

export const WEBHOOKS: Webhook[] = [
  {
    id: "wh1",
    name: "GitHub status",
    url: "https://github.novalabs.internal/hooks/teamflow",
    events: ["task.created", "task.updated", "task.status_changed"],
    active: true,
    deliveries: 1248,
    failures: 3,
    createdAt: daysAgo(60),
  },
  {
    id: "wh2",
    name: "Slack release channel",
    url: "https://hooks.slack.com/services/T00/B00/xyz",
    events: ["task.status_changed", "project.completed"],
    active: true,
    deliveries: 402,
    failures: 0,
    createdAt: daysAgo(112),
  },
  {
    id: "wh3",
    name: "gitlab-events",
    url: "https://gitlab.novalabs.internal/services/tf",
    events: ["comment.created", "task.updated"],
    active: false,
    deliveries: 89,
    failures: 7,
    createdAt: daysAgo(12),
  },
];

export const WEBHOOK_EVENTS = [
  "task.created",
  "task.updated",
  "task.status_changed",
  "task.deleted",
  "comment.created",
  "project.updated",
  "member.joined",
  "member.role_changed",
] as const;

export type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  scopes: string[];
  createdAt: string;
  lastUsed?: string;
  status: "active" | "revoked";
};

export const API_KEYS: ApiKey[] = [
  {
    id: "k1",
    name: "ci-deploy",
    prefix: "tfk_nova_1f8a",
    last4: "7c21",
    scopes: ["read:tasks", "write:comments"],
    createdAt: daysAgo(2),
    lastUsed: minsAgo(23),
    status: "active",
  },
  {
    id: "k2",
    name: "slack-bridge",
    prefix: "tfk_nova_29c4",
    last4: "04d9",
    scopes: ["read:tasks"],
    createdAt: daysAgo(118),
    lastUsed: hoursAgo(1),
    status: "active",
  },
  {
    id: "k3",
    name: "backup-script",
    prefix: "tfk_nova_3be2",
    last4: "80fa",
    scopes: ["read:audit", "read:tasks"],
    createdAt: daysAgo(240),
    status: "revoked",
  },
];

export const API_SCOPES = [
  "read:tasks",
  "write:tasks",
  "read:comments",
  "write:comments",
  "read:audit",
  "admin:members",
] as const;

/* ---------- plans & usage ---------- */

export type PlanId = "starter" | "growth" | "scale";

export const PLANS: {
  id: PlanId;
  name: string;
  price: number;
  blurb: string;
  features: string[];
}[] = [
  {
    id: "starter",
    name: "Starter",
    price: 0,
    blurb: "For small teams finding their flow.",
    features: [
      "Up to 10 seats",
      "2 active projects",
      "100 API calls / hr",
      "1 GB attachments",
      "Email notifications",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: 29,
    blurb: "For product teams shipping every week.",
    features: [
      "Up to 25 seats",
      "Unlimited projects",
      "10k API calls / hr",
      "100 GB attachments",
      "Webhooks + API keys",
      "Full-text search",
    ],
  },
  {
    id: "scale",
    name: "Scale",
    price: 99,
    blurb: "For orgs where the tenant is a product.",
    features: [
      "Unlimited seats",
      "SSO (OIDC / SAML)",
      "500k API calls / hr",
      "Audit export + archive",
      "Priority delivery",
      "Dedicated support",
    ],
  },
];

export const USAGE = {
  members: { used: 12, limit: 25, unit: "seats" },
  projects: { used: 5, limit: null, unit: "projects" },
  apiCalls: { used: 6842, limit: 10000, unit: "calls / hr" },
  storage: { used: 37.2, limit: 100, unit: "GB" },
  webhooks: { used: 4, limit: 10, unit: "endpoints" },
  searchOps: { used: 142, limit: 1000, unit: "ops / day" },
} as const;

/* ---------- invites ---------- */

export type Invite = {
  id: string;
  email: string;
  role: Role;
  sentAt: string;
};

export const INVITES: Invite[] = [
  { id: "i1", email: "hanna@novalabs.io", role: "member", sentAt: hoursAgo(4) },
  { id: "i2", email: "diego@ferrumnet.internal", role: "viewer", sentAt: daysAgo(1) },
];

/* ---------- lookup helpers ---------- */

export const memberById = new Map<string, Member>();
for (const m of MEMBERS) memberById.set(m.id, m);

export const projectById = new Map<string, Project>();
for (const p of PROJECTS) projectById.set(p.id, p);

export const taskByKey = new Map<string, Task>();
for (const t of TASKS) taskByKey.set(t.key, t);

export const orgById = new Map<string, Org>();
for (const o of ORGS) orgById.set(o.id, o);

export const teamById = new Map<string, Team>();
for (const t of TEAMS) teamById.set(t.id, t);

export const currentMember = memberById.get(CURRENT_USER_ID) ?? MEMBERS[0];
export const currentOrg = ORGS[0];

// Type aliases for compatibility with page imports
export type ActivityEvent = ActivityItem;
export type AuditLog = AuditEntry;
export type Comment = CommentT;

// Export status types for use in components
export const STATUSES = ["backlog", "todo", "in_progress", "in_review", "done"] as const;

export function tasksForProject(projectId: string): Task[] {
  return TASKS.filter((t) => t.projectId === projectId);
}

export function commentsForTask(taskKey: string): CommentT[] {
  return COMMENTS.filter((c) => c.taskKey === taskKey);
}