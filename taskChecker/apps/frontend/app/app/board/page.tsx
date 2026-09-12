"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { useToast } from "@/components/overlay";
import { IconPlus, IconSearch, IconClock } from "@/components/icons";
import { api, getCurrentTenantId, type Task, type Project } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useSWR } from "@/lib/swr";
import { useUpdateTask } from "@/lib/mutations";
import { cx } from "@/lib/utils";

const STATUS_ORDER = ["backlog", "todo", "in_progress", "done"] as const;
const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};
/* Stitch column dots — slate / blue / brand-purple / emerald */
const STATUS_DOTS: Record<string, string> = {
  backlog: "#94a3b8",
  todo: "#2563eb",
  in_progress: "#7c3aed",
  done: "#10b981",
};
const PRIO_CLASS: Record<string, string> = {
  critical: "st-prio st-prio-critical",
  high: "st-prio st-prio-high",
  medium: "st-prio st-prio-medium",
  low: "st-prio st-prio-low",
  none: "st-prio st-prio-none",
};

/** Stitch task card — key pill + short id, title, priority pill + due.
 * Mouse uses native HTML5 drag-and-drop; touch uses the long-press pointer
 * handlers below (HTML5 DnD never fires on touchscreens). */
function TaskCard({
  task,
  project,
  draggable,
  dragging,
  touchActive,
  onDragStart,
  onDragEnd,
  onTouchDragStart,
  onTouchDragMove,
  onTouchDragEnd,
  onTouchDragCancel,
}: {
  task: Task;
  project: Project | null;
  draggable: boolean;
  dragging: boolean;
  touchActive: boolean;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onDragEnd: () => void;
  onTouchDragStart: (e: React.PointerEvent, taskId: string) => void;
  onTouchDragMove: (e: React.PointerEvent) => void;
  onTouchDragEnd: (e: React.PointerEvent) => void;
  onTouchDragCancel: () => void;
}) {
  return (
    <article
      className={cx("st-card", dragging && "dragging")}
      draggable={draggable}
      onDragStart={(e) => onDragStart(e, task.id)}
      onDragEnd={onDragEnd}
      onPointerDown={(e) => onTouchDragStart(e, task.id)}
      onPointerMove={onTouchDragMove}
      onPointerUp={onTouchDragEnd}
      onPointerCancel={onTouchDragCancel}
      onContextMenu={(e) => {
        if (touchActive) e.preventDefault();
      }}
      style={touchActive ? { touchAction: "none", userSelect: "none", WebkitTouchCallout: "none" } : { touchAction: "pan-y" }}
      role="listitem"
      tabIndex={0}
    >
      <div className="st-card-top">
        <span className={PRIO_CLASS[task.priority] ?? PRIO_CLASS.none}>
          {task.priority === "none" ? "NO PRIO" : task.priority.toUpperCase()}
        </span>
        <span className="st-card-key">
          {project ? `${project.key}-${task.id.slice(0, 4).toUpperCase()}` : task.id.slice(0, 8)}
        </span>
      </div>
      <h3 className="st-card-title">{task.title}</h3>
      <div className="st-card-foot">
        {task.dueAt ? (
          <span className="board-card-due">
            <IconClock size={11} />
            {new Date(task.dueAt).toLocaleDateString()}
          </span>
        ) : (
          <span className="board-card-project">{project?.key ?? "TASK"}</span>
        )}
        <span
          className="st-card-dot"
          style={{ background: STATUS_DOTS[task.status] }}
          title={STATUS_LABELS[task.status]}
        />
      </div>
    </article>
  );
}

function BoardPage() {
  const toast = useToast();
  const { user, memberships } = useAuth();
  const orgId = getCurrentTenantId();
  const searchParams = useSearchParams();
  const updateTask = useUpdateTask();
  // Viewers are read-only server-side (PATCH requires member+), so don't let
  // them start a drag at all — otherwise every drop just snaps back with a
  // "Move failed" toast and looks like broken drag-and-drop.
  const myRole = memberships.find((m) => m.tenant_id === orgId)?.role;
  const canWrite = myRole === "owner" || myRole === "admin" || myRole === "member";

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
  // Touch drag state (HTML5 DnD never fires on touchscreens). Long-press a
  // card to arm the drag, then move to the target column and release.
  const [touchDrag, setTouchDrag] = useState<{ taskId: string; active: boolean; x: number; y: number } | null>(null);
  const touchTimer = useRef<number | null>(null);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const TOUCH_HOLD_MS = 280;
  const TOUCH_MOVE_TOLERANCE = 12;

  useEffect(() => {
    return () => {
      if (touchTimer.current !== null) window.clearTimeout(touchTimer.current);
    };
  }, []);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectKey, setNewProjectKey] = useState("");

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

  // Shared persist path for mouse drops and touch drops: optimistic move,
  // PATCH as source of truth, revalidate to reconcile, rollback on failure.
  const performDrop = useCallback(
    async (taskId: string, newStatus: string) => {
      const target = projectTasks.find((t) => t.id === taskId);
      if (!target || target.status === newStatus) return;
      // Move the card instantly so the drop feels immediate; PATCH below is the
      // source of truth and the final revalidate reconciles with it.
      await tasksQ.mutate(
        (current) => ({
          ...(current ?? { data: [], nextCursor: null, hasMore: false }),
          data: (current?.data ?? []).map((t) =>
            t.id === taskId ? { ...t, status: newStatus as Task["status"] } : t,
          ),
        }),
        { revalidate: false },
      );
      try {
        await updateTask(taskId, { status: newStatus as Task["status"] }, selectedProjectId);
        toast({ title: "Task moved", msg: `Moved to ${STATUS_LABELS[newStatus]}` });
        await tasksQ.mutate();
      } catch (err) {
        // Persist failed: re-fetch the server state so the card rolls back.
        await tasksQ.mutate();
        toast({ title: "Move failed", msg: err instanceof Error ? err.message : "Try again." });
      }
    },
    [projectTasks, updateTask, selectedProjectId, toast, tasksQ],
  );

  // Optimistic status change: update the local board immediately, then persist
  // with PATCH and revalidate the board from the server.
  const handleDrop = useCallback(
    async (e: React.DragEvent, newStatus: string) => {
      e.preventDefault();
      setDragOverCol(null);
      const taskId = draggedTaskId;
      setDraggedTaskId(null);
      if (!taskId) return;
      await performDrop(taskId, newStatus);
    },
    [draggedTaskId, performDrop],
  );

  // Which column is under the finger? Columns carry data-status, so a touch
  // drop resolves the same way a mouse drop does.
  const statusFromPoint = useCallback((x: number, y: number): string | null => {
    if (typeof document === "undefined") return null;
    const el = document.elementFromPoint(x, y);
    const col = el?.closest?.("[data-status]");
    return col?.getAttribute("data-status") ?? null;
  }, []);

  const cancelTouchDrag = useCallback(() => {
    if (touchTimer.current !== null) {
      window.clearTimeout(touchTimer.current);
      touchTimer.current = null;
    }
    touchOrigin.current = null;
    setTouchDrag(null);
    setDragOverCol(null);
  }, []);

  // Touch drag lifecycle: press-and-hold arms the drag (moving early cancels,
  // so normal scrolling still works), then the finger drives a ghost preview
  // until release drops the card into whichever column is underneath.
  const handleTouchDragStart = useCallback(
    (e: React.PointerEvent, taskId: string) => {
      if (e.pointerType === "mouse" || !canWrite) return;
      if (e.buttons !== undefined && e.buttons !== 1) return;
      touchOrigin.current = { x: e.clientX, y: e.clientY };
      setTouchDrag({ taskId, active: false, x: e.clientX, y: e.clientY });
      if (touchTimer.current !== null) window.clearTimeout(touchTimer.current);
      touchTimer.current = window.setTimeout(() => {
        touchTimer.current = null;
        setTouchDrag((t) => (t && t.taskId === taskId ? { ...t, active: true } : t));
        setDraggedTaskId(taskId);
        setDragOverCol(null);
      }, TOUCH_HOLD_MS);
    },
    [canWrite],
  );

  const handleTouchDragMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" || !touchDrag) return;
      if (!touchDrag.active) {
        // Still arming: a real scroll gesture cancels the pending drag.
        const origin = touchOrigin.current;
        if (
          origin &&
          Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > TOUCH_MOVE_TOLERANCE
        ) {
          if (touchTimer.current !== null) {
            window.clearTimeout(touchTimer.current);
            touchTimer.current = null;
          }
          touchOrigin.current = null;
          setTouchDrag(null);
          return;
        }
        setTouchDrag({ ...touchDrag, x: e.clientX, y: e.clientY });
        return;
      }
      setTouchDrag({ ...touchDrag, x: e.clientX, y: e.clientY });
      // Highlight the column under the finger while the drag is live. The
      // status read here can lag a frame; the drop itself re-reads from the
      // release coordinates, so this is display-only.
      const status = statusFromPoint(e.clientX, e.clientY);
      setDragOverCol((prev) => (prev === status ? prev : status));
    },
    [touchDrag, statusFromPoint],
  );

  const handleTouchDragEnd = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") return;
      if (touchTimer.current !== null) {
        window.clearTimeout(touchTimer.current);
        touchTimer.current = null;
      }
      touchOrigin.current = null;
      const wasActive = touchDrag?.active ?? false;
      const taskId = touchDrag?.taskId;
      setTouchDrag(null);
      setDragOverCol(null);
      setDraggedTaskId(null);
      // Tap (never armed) or armed-but-released outside any column: no-op.
      if (!wasActive || !taskId) return;
      const status = statusFromPoint(e.clientX, e.clientY);
      if (!status) return;
      void performDrop(taskId, status);
    },
    [touchDrag, statusFromPoint, performDrop],
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

  const handleCreateProject = useCallback(async () => {
    if (!newProjectName.trim() || !newProjectKey.trim() || !orgId) return;
    try {
      await api.projects.create({ name: newProjectName.trim(), key: newProjectKey.trim().toUpperCase() });
      setNewProjectName("");
      setNewProjectKey("");
      setShowNewProject(false);
      await projectsQ.mutate();
      toast({ title: "Project created", msg: "Now add your first task." });
    } catch (err) {
      toast({ title: "Create failed", msg: err instanceof Error ? err.message : "Try again." });
    }
  }, [newProjectName, newProjectKey, orgId, projectsQ, toast]);

  // Fresh workspace: no project exists yet, so every Add Task entry point is
  // disabled. Offer project creation inline instead of a dead board.
  if (!projectsQ.isLoading && projects.length === 0) {
    return (
      <AppShell>
        <div className="page">
          <div className="empty-state">
            <h3>No projects yet</h3>
            <p>Create your first project to start adding tasks.</p>
            <button className="btn btn-primary" onClick={() => setShowNewProject(true)}>
              <IconPlus size={14} /> New project
            </button>
          </div>
        </div>

        {showNewProject ? (
          <div className="modal-backdrop" onClick={() => setShowNewProject(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal aria-label="Create project">
              <div className="modal-head">
                <div>
                  <div className="modal-title">New project</div>
                  <div className="modal-sub">Tasks live inside a project — pick a short key for its cards.</div>
                </div>
              </div>
              <div className="modal-body">
                <div className="form-field">
                  <label htmlFor="project-name">Name</label>
                  <input
                    id="project-name"
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Launch"
                    autoFocus
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="project-key">Key (short code)</label>
                  <input
                    id="project-key"
                    type="text"
                    value={newProjectKey}
                    onChange={(e) => setNewProjectKey(e.target.value)}
                    placeholder="LAU"
                    maxLength={10}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleCreateProject();
                    }}
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button className="btn btn-ghost" onClick={() => setShowNewProject(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={() => void handleCreateProject()} disabled={!newProjectName.trim() || !newProjectKey.trim()}>
                  <IconPlus size={14} /> Create project
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </AppShell>
    );
  }

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
          {!canWrite ? (
            <span className="faint" style={{ fontSize: 11 }}>
              View-only role — ask an admin to move tasks
            </span>
          ) : null}
        </div>

        <div className="st-cols">
          {filteredColumns.map((col) => (
            <section
              key={col.status}
              data-status={col.status}
              className={cx("st-col", col.status === "in_progress" && "is-lit")}
              aria-label={`${STATUS_LABELS[col.status]}, ${col.tasks.length} tasks`}
              onDragOver={(e) => handleDragOver(e, col.status)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => void handleDrop(e, col.status)}
            >
              <div className="st-col-head">
                <span className="st-col-dot" style={{ background: STATUS_DOTS[col.status] }} />
                <h2 className="bcol-name">{STATUS_LABELS[col.status]}</h2>
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
                      draggable={canWrite}
                      dragging={draggedTaskId === task.id || (touchDrag?.active === true && touchDrag.taskId === task.id)}
                      touchActive={touchDrag?.active === true && touchDrag.taskId === task.id}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onTouchDragStart={handleTouchDragStart}
                      onTouchDragMove={handleTouchDragMove}
                      onTouchDragEnd={handleTouchDragEnd}
                      onTouchDragCancel={cancelTouchDrag}
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

        {touchDrag?.active
          ? (() => {
              const ghostTask = projectTasks.find((t) => t.id === touchDrag.taskId);
              if (!ghostTask) return null;
              return (
                <div
                  aria-hidden
                  style={{
                    position: "fixed",
                    left: touchDrag.x,
                    top: touchDrag.y,
                    transform: "translate(-50%, -115%)",
                    zIndex: 200,
                    pointerEvents: "none",
                    minWidth: 180,
                    maxWidth: 260,
                    background: "var(--card-bg, #fff)",
                    border: "1px solid var(--border-strong, #ddd6fe)",
                    borderRadius: 8,
                    padding: "8px 12px",
                    boxShadow: "0 12px 24px -4px rgb(15 23 42 / 0.25)",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {ghostTask.title}
                </div>
              );
            })()
          : null}

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
