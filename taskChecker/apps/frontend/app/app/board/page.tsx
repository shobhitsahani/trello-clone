"use client";

import { Suspense, memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { IconPlus, IconSearch, IconClock, IconEdit, IconTrash, IconX, IconDoneAll, IconStar } from "@/components/icons";
import { api, getCurrentTenantId, type Task, type Project } from "@/lib/api";
import { Modal, useToast } from "@/components/overlay";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useSWR } from "@/lib/swr";
import { useUpdateTask } from "@/lib/mutations";
import { cx, isOverdue } from "@/lib/utils";
import { AnimatePresence, motion } from "@/components/motion";

const STATUS_ORDER = ["backlog", "todo", "in_progress", "done"] as const;
const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};
/* Trello label bars — priority as a color bar, like Trello card labels */
const PRIO_LABEL: Record<string, string> = {
  critical: "#c9372c",
  high: "#e56910",
  medium: "#0c66e4",
  low: "#22a06b",
};

/** Stitch task card — key pill + short id, title, priority pill + due.
 * Mouse uses native HTML5 drag-and-drop; touch uses the long-press pointer
 * handlers below (HTML5 DnD never fires on touchscreens). Memoized so board
 * filter keystrokes don't re-render every card. */
const TaskCard = memo(function TaskCard({
  task,
  project,
  draggable,
  dragging,
  touchActive,
  canWrite,
  onDragStart,
  onDragEnd,
  onTouchDragStart,
  onTouchDragMove,
  onTouchDragEnd,
  onTouchDragCancel,
  onEdit,
  onDelete,
  onDone,
  onSetDue,
}: {
  task: Task;
  project: Project | null;
  draggable: boolean;
  dragging: boolean;
  touchActive: boolean;
  canWrite: boolean;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onDragEnd: () => void;
  onTouchDragStart: (e: React.PointerEvent, taskId: string) => void;
  onTouchDragMove: (e: React.PointerEvent) => void;
  onTouchDragEnd: (e: React.PointerEvent) => void;
  onTouchDragCancel: () => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onDone: (task: Task) => void;
  onSetDue: (taskId: string, dueAt: string | null) => void;
}) {
  // Inline deadline editor — local to the card so opening it doesn't
  // re-render the whole column. All pointer events are stopped: the card
  // itself starts touch/HTML5 drags on pointerdown.
  const [editingDue, setEditingDue] = useState(false);
  const [customDueDays, setCustomDueDays] = useState("");
  const overdue = isOverdue(task.dueAt, task.status);

  const openDueEditor = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    setEditingDue(true);
  };
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  // Deadline presets + calendar. N days from now (same time of day), or an
  // absolute date picked from the calendar (keeps the current time of day).
  const saveDueInDays = (days: number) => {
    onSetDue(task.id, new Date(Date.now() + days * 86_400_000).toISOString());
    setEditingDue(false);
  };
  const saveDueAt = (date: Date | undefined) => {
    if (!date) return;
    const now = new Date();
    date.setHours(now.getHours(), now.getMinutes(), 0, 0);
    onSetDue(task.id, date.toISOString());
    setEditingDue(false);
  };
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{
        opacity: dragging ? 0.45 : 1,
        y: 0,
        scale: dragging ? 0.98 : 1,
      }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      whileHover={draggable && !dragging ? { y: -2 } : undefined}
    >
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
      {task.priority !== "none" ? (
        <div className="trello-labels">
          <span
            className="trello-label"
            style={{ background: PRIO_LABEL[task.priority] ?? "#8590a2" }}
            title={`Priority: ${task.priority}`}
          />
        </div>
      ) : null}
      <h3 className="st-card-title">
        <Link
          href={`/app/tasks/${task.id}`}
          draggable={false}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{ color: "inherit", textDecoration: "none" }}
        >
          {task.title}
        </Link>
      </h3>
      <div className="trello-badges">
        {editingDue ? (
          <span className="board-card-due-edit board-card-due-edit--heroui" onPointerDown={stop} onClick={stop} role="group" aria-label="Set deadline">
            {[
              { days: 1, label: "1d" },
              { days: 3, label: "3d" },
              { days: 7, label: "7d" },
            ].map((o) => (
              <Button
                key={o.days}
                size="sm"
                variant="secondary"
                onClick={() => saveDueInDays(o.days)}
                aria-label={`Deadline in ${o.days} day${o.days === 1 ? "" : "s"}`}
                className="board-due-chip"
              >
                {o.label}
              </Button>
            ))}
            <span className="due-custom-heroui due-custom-heroui--compact">
              <Input
                type="number"
                min={1}
                max={365}
                value={customDueDays}
                onChange={(e) => setCustomDueDays(e.target.value)}
                onPointerDown={stop}
                onClick={stop}
                placeholder="N"
                aria-label="Custom deadline in days"
                className="due-custom-input due-custom-input--sm"
              />
              <span className="due-custom-suffix">days</span>
              <Button
                size="sm"
                variant="default"
                onClick={() => {
                  const n = Math.floor(Number(customDueDays));
                  if (Number.isFinite(n) && n >= 1 && n <= 365) saveDueInDays(n);
                }}
                aria-label="Save custom deadline"
                className="board-due-apply"
              >
                <IconClock size={14} />
              </Button>
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onSetDue(task.id, null);
                setEditingDue(false);
              }}
              aria-label="Clear deadline"
              className="board-due-clear"
            >
              <IconX size={14} />
            </Button>
            <span onPointerDown={stop} onClick={stop}>
              <DatePicker
                onSelect={saveDueAt}
                placeholder="Pick date"
                className="h-7 px-2 text-[0.8rem]"
              />
            </span>
          </span>
        ) : task.dueAt ? (
          <button
            type="button"
            className={cx(
              "trello-due",
              overdue && "is-overdue",
              task.status === "done" && "is-done"
            )}
            title={overdue ? "Overdue — moves back to Backlog automatically. Click to change." : `Due ${new Date(task.dueAt).toLocaleString()}${canWrite ? ". Click to change." : ""}`}
            onClick={canWrite ? openDueEditor : undefined}
            onPointerDown={stop}
            disabled={!canWrite}
          >
            {task.status === "done" ? <IconDoneAll size={12} /> : <IconClock size={12} />}
            {new Date(task.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            {overdue ? " · Overdue" : null}
          </button>
        ) : canWrite ? (
          <button
            type="button"
            className="trello-due is-empty"
            title="Set a deadline — if it passes, the task moves back to Backlog"
            onClick={openDueEditor}
            onPointerDown={stop}
          >
            <IconClock size={12} />
          </button>
        ) : null}
        <span className="trello-key">
          {project ? `${project.key}-${task.id.slice(0, 4).toUpperCase()}` : task.id.slice(0, 8)}
        </span>
      </div>
      {canWrite ? (
        <div className="trello-card-actions">
          {task.status !== "done" ? (
            <span
              className="st-card-done"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              title="Mark as done"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <Checkbox
                checked={false}
                onCheckedChange={(checked) => {
                  if (checked === true) onDone(task);
                }}
                aria-label={`Mark ${task.title} as done`}
              />
              <Button
                type="button"
                variant="ghost"
                size="xs"
                aria-label={`Mark ${task.title} as done`}
                onClick={() => onDone(task)}
              >
                <IconDoneAll size={12} /> Done
              </Button>
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Edit ${task.title}`}
            title="Edit"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(task);
            }}
          >
            <IconEdit size={13} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Delete ${task.title}`}
            title="Delete"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task);
            }}
          >
            <IconTrash size={13} />
          </Button>
        </div>
      ) : null}
    </article>
    </motion.div>
  );
});

function BoardPage() {
  const toast = useToast();
  const router = useRouter();
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
  // Defer the expensive 100-card filter so keystrokes stay responsive.
  const deferredSearch = useDeferredValue(search);
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
  const [newTaskStatus, setNewTaskStatus] = useState<Task["status"]>("backlog");
  const [newTitle, setNewTitle] = useState("");
  const [composerFor, setComposerFor] = useState<Task["status"] | null>(null);
  const [composerText, setComposerText] = useState("");
  // Trello-style starred board — persisted per project.
  const [starred, setStarred] = useState(false);
  useEffect(() => {
    try {
      setStarred(window.localStorage.getItem(`tf.board.star.${selectedProjectId}`) === "1");
    } catch {
      setStarred(false);
    }
  }, [selectedProjectId]);
  const toggleStarred = useCallback(() => {
    setStarred((v) => {
      try {
        window.localStorage.setItem(`tf.board.star.${selectedProjectId}`, v ? "0" : "1");
      } catch {
        // storage unavailable — session-only star
      }
      return !v;
    });
  }, [selectedProjectId]);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectKey, setNewProjectKey] = useState("");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<Task["status"]>("backlog");
  const [editPriority, setEditPriority] = useState<Task["priority"]>("none");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);

  const columns = useMemo(
    () =>
      STATUS_ORDER.map((status) => ({
        status,
        tasks: projectTasks.filter((t) => t.status === status),
      })),
    [projectTasks],
  );

  const filteredColumns = useMemo(() => {
    const q = deferredSearch.toLowerCase();
    if (!q) return columns;
    return columns.map((col) => ({
      ...col,
      tasks: col.tasks.filter((t) => t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)),
    }));
  }, [columns, deferredSearch]);

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

  // Deadline set/clear from the card: same optimistic pattern as drops —
  // instant UI, PATCH as source of truth, revalidate + rollback on failure.
  const handleSetDue = useCallback(
    async (taskId: string, dueAt: string | null) => {
      if (!canWrite) return;
      await tasksQ.mutate(
        (current) => ({
          ...(current ?? { data: [], nextCursor: null, hasMore: false }),
          data: (current?.data ?? []).map((t) => (t.id === taskId ? { ...t, dueAt } : t)),
        }),
        { revalidate: false },
      );
      try {
        await updateTask(taskId, { dueAt }, selectedProjectId);
        toast({
          title: dueAt ? "Deadline set" : "Deadline cleared",
          msg: dueAt
            ? `Due ${new Date(dueAt).toLocaleDateString()} — misses move back to Backlog.`
            : "No automatic move will happen.",
        });
        await tasksQ.mutate();
      } catch (err) {
        await tasksQ.mutate();
        toast({ title: "Deadline failed", msg: err instanceof Error ? err.message : "Try again." });
      }
    },
    [canWrite, tasksQ, updateTask, selectedProjectId, toast],
  );

  // One-tap done from the card: same optimistic persist path as a drop into
  // the Done column — instant UI, PATCH as source of truth, rollback.
  const handleDone = useCallback(
    async (task: Task) => {
      if (!canWrite || task.status === "done") return;
      await performDrop(task.id, "done");
    },
    [canWrite, performDrop],
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

  const openNewTask = useCallback((status: Task["status"] = "backlog") => {
    setNewTaskStatus(status);
    setShowNewTask(true);
  }, []);

  // Trello-style inline quick-add: Enter creates the card in place and the
  // composer stays open for rapid entry (Esc closes, errors restore text).
  const handleQuickAdd = useCallback(async () => {
    const title = composerText.trim();
    if (!title || !orgId || !selectedProjectId || !composerFor) return;
    setComposerText("");
    try {
      await api.tasks.create({ projectId: selectedProjectId, title, status: composerFor });
      await tasksQ.mutate();
    } catch (err) {
      setComposerText(title);
      toast({ title: "Create failed", msg: err instanceof Error ? err.message : "Try again." });
    }
  }, [composerText, composerFor, orgId, selectedProjectId, tasksQ, toast]);

  const handleCreateTask = useCallback(async () => {
    if (!newTitle.trim() || !orgId || !selectedProjectId) return;
    try {
      await api.tasks.create({ projectId: selectedProjectId, title: newTitle.trim(), status: newTaskStatus });
      setNewTitle("");
      setShowNewTask(false);
      await tasksQ.mutate();
      toast({ title: "Task created", msg: `Added to ${STATUS_LABELS[newTaskStatus]}.` });
    } catch (err) {
      toast({ title: "Create failed", msg: err instanceof Error ? err.message : "Try again." });
    }
  }, [newTitle, orgId, selectedProjectId, newTaskStatus, tasksQ, toast]);

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

  const openEditTask = useCallback((task: Task) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDescription(task.description ?? "");
    setEditStatus(task.status);
    setEditPriority(task.priority);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingTask || !editTitle.trim()) return;
    setSavingEdit(true);
    try {
      const patch: Partial<Task> = {};
      if (editTitle.trim() !== editingTask.title) patch.title = editTitle.trim();
      if (editDescription !== (editingTask.description ?? "")) patch.description = editDescription;
      if (editStatus !== editingTask.status) patch.status = editStatus;
      if (editPriority !== editingTask.priority) patch.priority = editPriority;
      if (Object.keys(patch).length > 0) {
        await updateTask(editingTask.id, patch, selectedProjectId);
        await tasksQ.mutate();
      }
      setEditingTask(null);
      toast({ title: "Task updated", msg: "Changes saved." });
    } catch (err) {
      toast({ title: "Update failed", msg: err instanceof Error ? err.message : "Try again." });
    } finally {
      setSavingEdit(false);
    }
  }, [editingTask, editTitle, editDescription, editStatus, editPriority, updateTask, selectedProjectId, tasksQ, toast]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingTask) return;
    setDeleting(true);
    try {
      await api.tasks.delete(deletingTask.id);
      setDeletingTask(null);
      await tasksQ.mutate();
      toast({ title: "Task deleted", msg: "Task moved to trash." });
    } catch (err) {
      toast({ title: "Delete failed", msg: err instanceof Error ? err.message : "Try again." });
    } finally {
      setDeleting(false);
    }
  }, [deletingTask, tasksQ, toast]);

  // Fresh workspace: no project exists yet, so every Add Task entry point is
  // disabled. Offer project creation inline instead of a dead board.
  if (!projectsQ.isLoading && projects.length === 0) {
    return (
      <AppShell>
        <motion.div
          className="page"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="empty-state">
            <h3>No projects yet</h3>
            <p>Create your first project to start adding tasks.</p>
            <Button onClick={() => setShowNewProject(true)}>
              <IconPlus size={14} /> New project
            </Button>
          </div>
        </motion.div>

        <Modal
          open={showNewProject}
          onClose={() => setShowNewProject(false)}
          title="New project"
          sub="Tasks live inside a project — pick a short key for its cards."
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowNewProject(false)}>
                Cancel
              </Button>
              <Button onClick={() => void handleCreateProject()} disabled={!newProjectName.trim() || !newProjectKey.trim()}>
                <IconPlus size={14} /> Create project
              </Button>
            </>
          }
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="project-name">Name</FieldLabel>
              <Input
                id="project-name"
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Launch"
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="project-key">Key (short code)</FieldLabel>
              <Input
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
            </Field>
          </FieldGroup>
        </Modal>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="st-board" role="region" aria-label="Kanban board">
        <motion.div
          className="st-board-bar"
          style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="trello-board-title">{selectedProject?.name ?? "Board"}</h1>
          <button
            type="button"
            className={cx("trello-star", starred && "is-on")}
            onClick={toggleStarred}
            aria-pressed={starred}
            aria-label={starred ? "Unstar board" : "Star board"}
            title={starred ? "Unstar board" : "Star board"}
          >
            <IconStar size={16} />
          </button>
          <InputGroup className="st-search" style={{ marginLeft: 0, width: 280 }}>
            <InputGroupAddon>
              <IconSearch size={16} aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter tasks…"
              aria-label="Filter tasks"
            />
          </InputGroup>
          <span className="faint mono" style={{ fontSize: 11 }}>
            {projectTasks.length} tasks · drag cards between columns
          </span>
          {!canWrite ? (
            <span className="faint" style={{ fontSize: 11 }}>
              View-only role — ask an admin to move tasks
            </span>
          ) : null}
        </motion.div>

        <motion.div
          className="st-cols"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
        >
          {filteredColumns.map((col, colIdx) => (
            <motion.section
              key={col.status}
              data-status={col.status}
              className={cx("st-col", col.status === "in_progress" && "is-lit")}
              aria-label={`${STATUS_LABELS[col.status]}, ${col.tasks.length} tasks`}
              onDragOver={(e) => handleDragOver(e, col.status)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => void handleDrop(e, col.status)}
              variants={{
                hidden: { opacity: 0, y: 14 },
                show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: colIdx * 0.02 } },
              }}
              layout
            >
              <div className="st-col-head">
                <h2 className="bcol-name">{STATUS_LABELS[col.status]}</h2>
                <span className="st-col-count">{col.tasks.length}</span>
                <button
                  className="st-col-add"
                  title={`Add task to ${STATUS_LABELS[col.status]}`}
                  onClick={() => openNewTask(col.status as Task["status"])}
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
                  <AnimatePresence initial={false} mode="popLayout">
                    {col.tasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        project={selectedProject}
                        draggable={canWrite}
                        dragging={draggedTaskId === task.id || (touchDrag?.active === true && touchDrag.taskId === task.id)}
                        touchActive={touchDrag?.active === true && touchDrag.taskId === task.id}
                        canWrite={canWrite}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onTouchDragStart={handleTouchDragStart}
                        onTouchDragMove={handleTouchDragMove}
                        onTouchDragEnd={handleTouchDragEnd}
                        onTouchDragCancel={cancelTouchDrag}
                        onEdit={openEditTask}
                        onDelete={setDeletingTask}
                        onDone={handleDone}
                        onSetDue={handleSetDue}
                      />
                    ))}
                  </AnimatePresence>
                )}
                {composerFor === col.status && canWrite ? (
                  <div className="trello-composer">
                    <Textarea
                      autoFocus
                      rows={2}
                      value={composerText}
                      onChange={(e) => setComposerText(e.target.value)}
                      placeholder="Enter a title or paste a link"
                      aria-label={`Add a card to ${STATUS_LABELS[col.status]}`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleQuickAdd();
                        } else if (e.key === "Escape") {
                          setComposerFor(null);
                          setComposerText("");
                        }
                      }}
                    />
                    <div className="trello-composer-actions">
                      <Button size="sm" onClick={() => void handleQuickAdd()} disabled={!composerText.trim()}>
                        Add card
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Cancel adding card"
                        onClick={() => {
                          setComposerFor(null);
                          setComposerText("");
                        }}
                      >
                        <IconX size={16} />
                      </Button>
                    </div>
                  </div>
                ) : canWrite ? (
                  <button
                    className="st-add"
                    onClick={() => {
                      setComposerText("");
                      setComposerFor(col.status as Task["status"]);
                    }}
                    disabled={!selectedProjectId || !user}
                  >
                    <span>+</span> Add a card
                  </button>
                ) : null}
              </div>
            </motion.section>
          ))}
        </motion.div>

        {touchDrag?.active
          ? (() => {
              const ghostTask = projectTasks.find((t) => t.id === touchDrag.taskId);
              if (!ghostTask) return null;
              return (
                <motion.div
                  aria-hidden
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{
                    position: "fixed",
                    left: touchDrag.x,
                    top: touchDrag.y,
                    translate: "-50% -115%",
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
                </motion.div>
              );
            })()
          : null}

        <Modal
          open={showNewTask}
          onClose={() => setShowNewTask(false)}
          title={`New task in ${selectedProject?.name ?? "project"}`}
          sub={`Added to ${STATUS_LABELS[newTaskStatus]} — drag it anywhere.`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowNewTask(false)}>
                Cancel
              </Button>
              <Button onClick={() => void handleCreateTask()} disabled={!newTitle.trim()}>
                <IconPlus size={14} /> Create task
              </Button>
            </>
          }
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="task-title">Title</FieldLabel>
              <Input
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
            </Field>
            <Field>
              <FieldLabel htmlFor="task-status">Status</FieldLabel>
              <Select
                value={newTaskStatus}
                onValueChange={(v) => setNewTaskStatus(v as Task["status"])}
              >
                <SelectTrigger id="task-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </Modal>

        <Modal
          open={editingTask !== null}
          onClose={() => setEditingTask(null)}
          title="Edit task"
          sub="Update the title, details, status, or priority."
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditingTask(null)} disabled={savingEdit}>
                Cancel
              </Button>
              <Button onClick={() => void handleSaveEdit()} disabled={!editTitle.trim() || savingEdit}>
                {savingEdit ? "Saving…" : "Save changes"}
              </Button>
            </>
          }
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="edit-task-title">Title</FieldLabel>
              <Input
                id="edit-task-title"
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Task title"
                autoFocus
                maxLength={200}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-task-desc">Description</FieldLabel>
              <Textarea
                id="edit-task-desc"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Add more detail…"
                rows={4}
              />
            </Field>
            <div style={{ display: "flex", gap: 12 }}>
              <Field className="flex-1">
                <FieldLabel htmlFor="edit-task-status">Status</FieldLabel>
                <Select
                  value={editStatus}
                  onValueChange={(v) => setEditStatus(v as Task["status"])}
                >
                  <SelectTrigger id="edit-task-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_ORDER.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field className="flex-1">
                <FieldLabel htmlFor="edit-task-priority">Priority</FieldLabel>
                <Select
                  value={editPriority}
                  onValueChange={(v) => setEditPriority(v as Task["priority"])}
                >
                  <SelectTrigger id="edit-task-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </FieldGroup>
        </Modal>

        <Modal
          open={deletingTask !== null}
          onClose={() => setDeletingTask(null)}
          title="Delete task?"
          sub={`“${deletingTask?.title ?? ""}” will be moved to trash. This can be undone by an admin.`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeletingTask(null)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void handleConfirmDelete()} disabled={deleting}>
                <IconTrash size={14} /> {deleting ? "Deleting…" : "Delete task"}
              </Button>
            </>
          }
        >
          <p className="text-sm text-muted-foreground">
            This moves the task to trash. Admins can restore it.
          </p>
        </Modal>
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
