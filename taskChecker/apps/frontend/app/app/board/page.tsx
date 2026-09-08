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
import { cx } from "@/lib/utils";

const STATUS_ORDER = ["backlog", "todo", "in_progress", "in_review", "done"] as const;
const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
};
/* Stitch column dots — slate / blue / brand-purple / violet / emerald */
const STATUS_DOTS: Record<string, string> = {
  backlog: "#94a3b8",
  todo: "#2563eb",
  in_progress: "#7c3aed",
  in_review: "#a855f7",
  done: "#10b981",
};
const PRIO_CLASS: Record<string, string> = {
  critical: "st-prio st-prio-critical",
  high: "st-prio st-prio-high",
  medium: "st-prio st-prio-medium",
  low: "st-prio st-prio-low",
  none: "st-prio st-prio-none",
};

/** Stitch task card — key pill + short id, title, priority pill + due. */
function TaskCard({
  task,
  project,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  project: Project | null;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onDragEnd: () => void;
}) {
  return (
    <article
      className="st-card"
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      onDragEnd={onDragEnd}
      role="listitem"
      tabIndex={0}
    >
      <div className="st-card-top">
        <span className="st-key-pill">{project?.key ?? "TASK"}</span>
        <span className="st-card-key">{task.id.slice(0, 8)}</span>
      </div>
      <h3 className="st-card-title">{task.title}</h3>
      <div className="st-card-foot">
        <span className={PRIO_CLASS[task.priority] ?? PRIO_CLASS.none}>
          {task.priority === "none" ? "NO PRIO" : task.priority.toUpperCase()}
        </span>
        {task.dueAt ? (
          <span className="board-card-due">
            <IconClock size={11} />
            {new Date(task.dueAt).toLocaleDateString()}
          </span>
        ) : (
          <span className="board-card-project">
            {project ? `${project.key}-${task.id.slice(0, 4).toUpperCase()}` : task.id.slice(0, 8)}
          </span>
        )}
      </div>
    </article>
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
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
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
    try {
      e.dataTransfer.setData("text/plain", taskId);
    } catch {
      /* noop */
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedTaskId(null);
    setDragOverCol(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, status: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(status);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null);
  }, []);

  // Real optimistic status change: PATCH /v1/tasks/{id}, then revalidate board.
  const handleDrop = useCallback(
    async (e: React.DragEvent, newStatus: string) => {
      e.preventDefault();
      setDragOverCol(null);
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
      <div className="st-board" role="region" aria-label="Kanban board">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div className="st-search" style={{ marginLeft: 0, width: 280 }}>
            <IconSearch size={16} />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter tasks…" aria-label="Filter tasks" />
          </div>
          <select
            value={selectedProjectId}
            onChange={(e) => {
              window.location.assign(`/app/board?project=${e.target.value}`);
            }}
            className="select"
            aria-label="Select project"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.key})
              </option>
            ))}
            {projects.length === 0 ? <option value="">No projects yet</option> : null}
          </select>
          <span className="faint mono" style={{ fontSize: 11 }}>
            {projectTasks.length} tasks · drag cards between columns
          </span>
        </div>

        <div className="st-cols">
          {filteredColumns.map((col) => (
            <section
              key={col.status}
              className="st-col"
              aria-label={`${STATUS_LABELS[col.status]}, ${col.tasks.length} tasks`}
              onDragOver={(e) => handleDragOver(e, col.status)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => void handleDrop(e, col.status)}
            >
              <div className="st-col-head">
                <span className="st-col-dot" style={{ background: STATUS_DOTS[col.status] }} />
                <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--slate-800)" }}>{STATUS_LABELS[col.status]}</h2>
                <span className="st-col-count">{col.tasks.length}</span>
                <button
                  className="st-col-add"
                  title={`Add task to ${STATUS_LABELS[col.status]}`}
                  onClick={() => setShowNewTask(true)}
                  disabled={!selectedProjectId || !user}
                >
                  <IconPlus size={16} />
                </button>
              </div>
              <div className={cx("st-drop", dragOverCol === col.status && "drag-over")} role="list">
                {col.tasks.length === 0 ? (
                  <div className={cx("st-empty", dragOverCol === col.status && "drag-over-target")}>
                    Drop tasks here
                  </div>
                ) : (
                  col.tasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      project={selectedProject}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                    />
                  ))
                )}
                <button
                  className="st-add"
                  onClick={() => setShowNewTask(true)}
                  disabled={!selectedProjectId || !user}
                >
                  <span>+</span> Add Task
                </button>
              </div>
            </section>
          ))}
        </div>

        {showNewTask ? (
          <div className="modal-backdrop" onClick={() => setShowNewTask(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal aria-label="Create task">
              <div className="modal-head">
                <div>
                  <div className="modal-title">New task in {selectedProject?.name}</div>
                  <div className="modal-sub">Added to Backlog — drag it anywhere.</div>
                </div>
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
              <div className="modal-foot">
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
