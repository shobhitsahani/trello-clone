import type { Task, Project, User, ActiveTenant } from "./api";

export const DEMO_ORG_ID = "demo-org-1";

export const DEMO_USER: User = {
  id: "demo-user-1",
  email: "demo@teamflow.dev",
  name: "Demo User",
};

export const DEMO_MEMBERSHIPS: ActiveTenant[] = [
  {
    tenant_id: DEMO_ORG_ID,
    tenant_name: "TeamFlow Workspace",
    tenant_slug: "teamflow-demo",
    plan: "pro",
    role: "owner",
    status: "active",
  },
];

const DEMO_PROJECTS: Project[] = [
  {
    tenantId: DEMO_ORG_ID,
    id: "demo-proj-1",
    teamId: null,
    name: "Trello Core Sprint",
    key: "TRL",
    createdAt: new Date().toISOString(),
    deletedAt: null,
  },
];

const INITIAL_TASKS: Task[] = [
  {
    id: "task-1",
    tenantId: DEMO_ORG_ID,
    projectId: "demo-proj-1",
    title: "Design modern Trello board layout with smooth drag & drop",
    description: "Implement responsive columns, card labels, and subtle micro-animations.",
    status: "in_progress",
    priority: "high",
    assigneeId: null,
    reporterId: null,
    dueAt: new Date(Date.now() + 86400000 * 2).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: "task-2",
    tenantId: DEMO_ORG_ID,
    projectId: "demo-proj-1",
    title: "Configure realtime WebSocket collaboration channels",
    description: "Broadcast column updates and card shifts across active team members.",
    status: "todo",
    priority: "critical",
    assigneeId: null,
    reporterId: null,
    dueAt: new Date(Date.now() + 86400000 * 4).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: "task-3",
    tenantId: DEMO_ORG_ID,
    projectId: "demo-proj-1",
    title: "Setup tenant authorization and audit log timeline",
    description: "Review member roles and permission guards.",
    status: "done",
    priority: "medium",
    assigneeId: null,
    reporterId: null,
    dueAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: "task-4",
    tenantId: DEMO_ORG_ID,
    projectId: "demo-proj-1",
    title: "Polish mobile touch gestures and long-press card drag",
    description: "Ensure touch devices can smoothly drag cards between lists.",
    status: "backlog",
    priority: "low",
    assigneeId: null,
    reporterId: null,
    dueAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
];

const TASKS_STORAGE_KEY = "tf.demo.tasks";
const PROJECTS_STORAGE_KEY = "tf.demo.projects";

export function getDemoTasks(): Task[] {
  if (typeof window === "undefined") return INITIAL_TASKS;
  try {
    const raw = localStorage.getItem(TASKS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(INITIAL_TASKS));
      return INITIAL_TASKS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_TASKS;
  }
}

export function saveDemoTasks(tasks: Task[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    /* ignore */
  }
}

export function getDemoProjects(): Project[] {
  if (typeof window === "undefined") return DEMO_PROJECTS;
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(DEMO_PROJECTS));
      return DEMO_PROJECTS;
    }
    return JSON.parse(raw);
  } catch {
    return DEMO_PROJECTS;
  }
}

export function saveDemoProjects(projects: Project[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  } catch {
    /* ignore */
  }
}

export function enableDemoSession(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("tf_access_token", "demo-token");
  localStorage.setItem("tf_refresh_token", "demo-refresh");
  localStorage.setItem("tf_tenant_id", DEMO_ORG_ID);
  localStorage.setItem("tf_is_demo", "1");
}

export function isDemoSession(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("tf_is_demo") === "1";
}
