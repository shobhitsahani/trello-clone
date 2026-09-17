"use client";

import { useMemo, memo, startTransition, useState } from "react";
import Link from "next/link";
import { useTenant } from "@/components/store";
import { useToast } from "@/components/overlay";
import { AppShell } from "@/components/app-shell";
import { IconCheck, IconFile, IconClock, IconUser, IconPulse, IconSearch, IconPlus } from "@/components/icons";
import { api, getCurrentTenantId, type Task, type Project } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useSWR } from "@/lib/swr";
import { cx, timeAgo, hueFrom, isOverdue } from "@/lib/utils";
import { AnimatePresence, motion, PageEnter } from "@/components/motion";

const STATUS_COLORS: Record<string, string> = {
  backlog: "var(--muted)",
  todo: "hsl(210 80% 50%)",
  in_progress: "hsl(35 90% 50%)",
  done: "hsl(140 60% 45%)",
};
const PRIORITY_COLORS: Record<string, string> = {
  critical: "hsl(0 75% 55%)",
  high: "hsl(35 90% 50%)",
  medium: "hsl(210 80% 50%)",
  low: "var(--muted)",
  none: "var(--muted)",
};

type TaskWithProject = { task: Task; project: Project | null };

/**
 * rerender-memo: Memoize TaskCard to prevent unnecessary re-renders
 */
const TaskCard = memo(function TaskCard({ item }: { item: TaskWithProject }) {
  const { task, project } = item;
  const hue = project ? hueFrom(project.key || project.id) : 0;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2 }}
    >
      <Link href={`/app/tasks/${task.id}`} className="task-card" style={{ display: "block" }}>
      <div className="task-header">
        <span className="task-key">{task.id.slice(0, 8)}</span>
        <span className="task-status" style={{ background: STATUS_COLORS[task.status] }}>
          {task.status.replace("_", " ")}
        </span>
      </div>
      <h3 className="task-title">{task.title}</h3>
      <div className="task-meta">
        {project ? (
          <span className="task-project" style={{ borderColor: `hsl(${hue} 80% 70%)` }}>
            {project.key}
          </span>
        ) : null}
        {task.dueAt ? (
          <span
            className="task-due"
            style={isOverdue(task.dueAt, task.status) ? { color: "hsl(0 75% 45%)", fontWeight: 700 } : undefined}
            title={isOverdue(task.dueAt, task.status) ? "Overdue — moves back to Backlog automatically" : undefined}
          >
            <IconClock size={12} />
            {new Date(task.dueAt).toLocaleDateString()}
            {isOverdue(task.dueAt, task.status) ? " · OVERDUE" : null}
          </span>
        ) : null}
      </div>
      </Link>
    </motion.div>
  );
});

export default function WorkPage() {
  const { org } = useTenant();
  const toast = useToast();
  const { user } = useAuth();
  const [filter, setFilter] = useState<"all" | "assigned" | "reported">("assigned");
  const [search, setSearch] = useState("");

  const orgId = getCurrentTenantId();
  const projectsQ = useSWR<{ projects: Project[] }>(
    orgId ? `work-projects-${orgId}` : null,
    () => api.projects.list(orgId!),
  );
  const projects = projectsQ.data?.projects ?? [];

  // All my tasks across the tenant's projects — fetched in parallel per project.
  // Key includes the project set so a newly created project revalidates
  // instead of reusing the stale closure; limit 50 halves the fan-out payload.
  const projectIdsKey = projects.map((p) => p.id).join(",");
  const tasksQ = useSWR<TaskWithProject[]>(
    orgId && projects.length > 0 ? `work-tasks-${orgId}-${projectIdsKey}` : null,
    async () => {
      const pages = await Promise.all(projects.map((p) => api.tasks.list(orgId!, p.id, { limit: 50 })));
      return pages.flatMap((page, i) => page.data.map((task) => ({ task, project: projects[i] ?? null })));
    },
  );

  const isLoading = projectsQ.isLoading || tasksQ.isLoading;

  const myTasks = useMemo(() => {
    if (!user) return [];
    return (tasksQ.data ?? []).filter(({ task }) =>
      (filter === "assigned" && task.assigneeId === user.id) ||
      (filter === "reported" && task.reporterId === user.id) ||
      (filter === "all" && (task.assigneeId === user.id || task.reporterId === user.id)),
    );
  }, [tasksQ.data, filter, user]);

  const filteredTasks = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return myTasks;
    return myTasks.filter(({ task }) =>
      task.title.toLowerCase().includes(q) || task.id.toLowerCase().includes(q),
    );
  }, [myTasks, search]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    startTransition(() => {
      setSearch(e.target.value);
    });
  };

  const handleFilterChange = (f: "all" | "assigned" | "reported") => {
    startTransition(() => {
      setFilter(f);
    });
  };

  return (
    <AppShell>
      <PageEnter className="page">
        <motion.header
          className="page-header"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div>
            <h1 className="page-title">Your work</h1>
            <p className="page-subtitle">Tasks assigned to you or created by you in {org?.name ?? "your organization"}</p>
          </div>
          <div className="page-actions">
            <motion.button
              className="btn btn-primary"
              onClick={() => toast({ title: "Create task", msg: "Open a project board to add tasks." })}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
            >
              <IconPlus size={14} /> New task
            </motion.button>
          </div>
        </motion.header>

        <div className="work-toolbar">
          <div className="search-box">
            <IconSearch size={16} />
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder="Search your tasks…"
            />
          </div>
          <div className="filter-tabs" role="tablist">
            {(["all", "assigned", "reported"] as const).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                className={cx("filter-tab", filter === f ? "active" : "")}
                onClick={() => handleFilterChange(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="task-grid">
          {isLoading ? (
            <div className="loading">Loading…</div>
          ) : filteredTasks.length === 0 ? (
            <motion.div
              className="empty-state"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <IconFile size={48} className="dim" />
              <h3>No tasks found</h3>
              <p>{search ? "Try a different search term" : "You're all caught up!"}</p>
            </motion.div>
          ) : (
            <AnimatePresence initial={false} mode="popLayout">
              {filteredTasks.map((item) => (
                <TaskCard key={item.task.id} item={item} />
              ))}
            </AnimatePresence>
          )}
        </div>
      </PageEnter>
    </AppShell>
  );
}

