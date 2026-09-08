"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { useToast } from "@/components/overlay";
import { IconPlus, IconSearch, IconClock } from "@/components/icons";
import { api, getCurrentTenantId, type Task, type Project } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useSWR } from "@/lib/swr";
import { useUpdateTask } from "@/lib/mutations";
import { hueFrom } from "@/lib/utils";

const STATUS_ORDER = ["backlog", "todo", "in_progress", "in_review", "done"] as const;
const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
};
const STATUS_COLORS: Record<string, string> = {
  backlog: "var(--muted)",
  todo: "hsl(210 80% 50%)",
  in_progress: "hsl(35 90% 50%)",
  in_review: "hsl(280 70% 55%)",
  done: "hsl(140 60% 45%)",
};
const PRIORITY_COLORS: Record<string, string> = {
  critical: "hsl(0 75% 55%)",
  high: "hsl(35 90% 50%)",
  medium: "hsl(210 80% 50%)",
  low: "var(--muted)",
  none: "var(--muted)",
};

/** TaskCard — draggable card; re-renders only when its task changes. */
function TaskCard({
  task,
  project,
  onDragStart,
}: {
  task: Task;
  project: Project | null;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
}) {
  const hue = project ? hueFrom(project.key || project.id) : 0;
  return (
    <div className="board-card" draggable onDragStart={(e) => onDragStart(e, task.id)} role="listitem">
      <div className="board-card-header">
        <span className="board-card-key">{task.id.slice(0, 8)}</span>
        <span className="board-card-priority" style={{ color: PRIORITY_COLORS[task.priority] }}>
          {task.priority === "none" ? "" : task.priority.charAt(0).toUpperCase()}
        </span>
      </div>
      <h4 className="board-card-title">{task.title}</h4>
      <div className="board-card-meta">
        {project ? (
          <span className="board-card-project" style={{ borderColor: `hsl(${hue} 80% 70%)` }}>
            {project.key}
          </span>
        ) : null}
        {task.dueAt ? (
          <span className="board-card-due">
            <IconClock size={11} />
            {new Date(task.dueAt).toLocaleDateString()}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function BoardPage() {
  const toast = useToast();
  const { user } = useAuth();
  const orgId = getCurrentTenantId();
  const searchParams = useSearchParams();
  const updateTask = useUpdateTask();

  const projectsQ = useSWR<{ projects: Project[] }>(
    orgId ? `board-projects-${orgId}` : null,
    () => api.projects.list(orgId!),
  );
  const projects = projectsQ.data?.projects ?? [];

  const selectedProjectId =
    searchParams.get("project") && projects.some((p) => p.id === searchParams.get("project"))
      ? (searchParams.get("project") as string)
      : (projects[0]?.id ?? "");
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  const tasksQ = useSWR<{ data: Task[]; nextCursor: string | null; hasMore: boolean }>(
    orgId && selectedProjectId ? `board-tasks-${orgId}-${selectedProjectId}` : null,
    () => api.tasks.list(orgId!, selectedProjectId, { limit: 100 }),
  );
  const projectTasks = tasksQ.data?.data ?? [];

  const [search, setSearch] = useState("");
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const columns = useMemo(
    () =>
      STATUS_ORDER.map((status) => ({
        status,
        tasks: projectTasks.filter((t) => t.status === status),
      })),
    [projectTasks],
  );

  const filteredColumns = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return columns;
    return columns.map((col) => ({
      ...col,
      tasks: col.tasks.filter((t) => t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)),
    }));
  }, [columns, search]);

  const handleDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  // Real optimistic status change: PATCH /v1/tasks/{id}, then revalidate board.
  const handleDrop = useCallback(
    async (e: React.DragEvent, newStatus: string) => {
      e.preventDefault();
      const taskId = draggedTaskId;
      setDraggedTaskId(null);
      if (!taskId) return;
      const target = projectTasks.find((t) => t.id === taskId);
      if (!target || target.status === newStatus) return;
      try {
        await updateTask(taskId, { status: newStatus as Task["status"] }, selectedProjectId);
        toast({ title: "Task moved", msg: `Moved to ${STATUS_LABELS[newStatus]}` });
        await tasksQ.mutate();
      } catch (err) {
        toast({ title: "Move failed", msg: err instanceof Error ? err.message : "Try again." });
      }
    },
    [draggedTaskId, projectTasks, updateTask, selectedProjectId, toast, tasksQ],
  );

  const handleCreateTask = useCallback(async () => {
    if (!newTitle.trim() || !orgId || !selectedProjectId) return;
    try {
      await api.tasks.create({ projectId: selectedProjectId, title: newTitle.trim() });
      setNewTitle("");
      setShowNewTask(false);
      await tasksQ.mutate();
      toast({ title: "Task created", msg: "Added to the board." });
    } catch (err) {
      toast({ title: "Create failed", msg: err instanceof Error ? err.message : "Try again." });
    }
  }, [newTitle, orgId, selectedProjectId, tasksQ, toast]);

  return (
    <AppShell>
      <div className="page board-page">
        <header className="page-header">
          <div>
            <h1 className="page-title">Board</h1>
            <p className="page-subtitle">Kanban view for {selectedProject?.name ?? "no project"}</p>
          </div>
          <div className="page-actions">
            <select
              value={selectedProjectId}
              onChange={(e) => {
                window.location.assign(`/app/board?project=${e.target.value}`);
              }}
              className="select"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.key})
                </option>
              ))}
              {projects.length === 0 ? <option value="">No projects yet</option> : null}
            </select>
            <button className="btn btn-primary" onClick={() => setShowNewTask(true)} disabled={!selectedProjectId || !user}>
              <IconPlus size={14} /> New task
            </button>
          </div>
        </header>

        <div className="board-toolbar">
          <div className="search-box">
            <IconSearch size={16} />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter tasks…" />
          </div>
        </div>

        <div className="board-grid" role="region" aria-label="Kanban board">
          {filteredColumns.map((col) => (
            <div
              key={col.status}
              className="board-column"
              onDragOver={handleDragOver}
              onDrop={(e) => void handleDrop(e, col.status)}
              role="list"
              aria-label={STATUS_LABELS[col.status]}
            >
              <div className="board-column-head">
                <span className="board-column-dot" style={{ background: STATUS_COLORS[col.status] }} />
                <span className="board-column-title">{STATUS_LABELS[col.status]}</span>
                <span className="board-column-count">{col.tasks.length}</span>
              </div>
              {col.tasks.map((task) => (
                <TaskCard key={task.id} task={task} project={selectedProject} onDragStart={handleDragStart} />
              ))}
            </div>
          ))}
        </div>

        {showNewTask ? (
          <div className="modal-backdrop" onClick={() => setShowNewTask(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal aria-label="Create task">
              <div className="modal-header">
                <h3>New task in {selectedProject?.name}</h3>
              </div>
              <div className="modal-body">
                <div className="form-field">
                  <label htmlFor="task-title">Title</label>
                  <input
                    id="task-title"
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="What needs doing?"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleCreateTask();
                    }}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setShowNewTask(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={() => void handleCreateTask()} disabled={!newTitle.trim()}>
                  <IconPlus size={14} /> Create task
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function BoardPageWrapper() {
  return (
    <Suspense fallback={<div className="loading">Loading…</div>}>
      <BoardPage />
    </Suspense>
  );
}
