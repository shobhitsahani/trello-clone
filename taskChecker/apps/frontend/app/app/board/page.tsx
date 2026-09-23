/* Lagoon board — joyful kanban ported from treloo-joyful-design, backed by
   the real projects/tasks API. Board / Timeline / Calendar views, label-tone
   filter, active-only toggle, search, drag-and-drop (mouse + touch),
   inline composers, list rename, starring, and the full card modal. */

"use client";

import { Suspense, memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LagoonShell, useLagoonChrome } from "@/components/lagoon/LagoonShell";
import { LagoonCardModal } from "@/components/lagoon/LagoonCardModal";
import {
  IconBell,
  IconCalendar,
  IconCheck,
  IconColumns,
  IconList,
  IconListTodo,
  IconMenu,
  IconPlus,
  IconSearch,
  IconSliders,
  IconStar,
  IconX,
} from "@/components/icons";
import { api, getCurrentTenantId, type ListLabel, type Member, type Task, type Project } from "@/lib/api";
import { useToast } from "@/components/overlay";
import { useAuth } from "@/lib/auth";
import { useTenant } from "@/components/store";
import { useSWR } from "@/lib/swr";
import { useUpdateTask } from "@/lib/mutations";
import { cx } from "@/lib/utils";
import {
  LAGOON_TONES,
  clearLagoonMeta,
  effectiveLabel,
  lagoonAvatarTone,
  lagoonDueBadge,
  lagoonInitials,
  loadLagoonMeta,
  toYmd,
  todayYmd,
  type LagoonTone,
} from "@/components/lagoon/lagoon-utils";

const STATUS_ORDER = ["backlog", "todo", "in_progress", "done"] as const;
const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};
/* Joyful column dots — Treloo backlog teal / progress ocean / review coral. */
const STATUS_DOT: Record<string, string> = {
  backlog: "var(--lagoon-teal)",
  todo: "var(--lagoon-ocean)",
  in_progress: "var(--lagoon-coral)",
  done: "var(--lagoon-success)",
};

type BoardView = "board" | "timeline" | "calendar";

/** Joyful task card — label pill, title, description, assignee, due badge,
 *  checklist progress. Click opens the card modal. Mouse uses native HTML5
 *  drag-and-drop; touch uses the long-press pointer handlers below. */
const LagoonTaskCard = memo(function LagoonTaskCard({
  task,
  metaTick,
  assigneeName,
  draggable,
  dragging,
  touchActive,
  canWrite,
  isDone,
  today,
  onDragStart,
  onDragEnd,
  onTouchDragStart,
  onTouchDragMove,
  onTouchDragEnd,
  onTouchDragCancel,
  onOpen,
  onDone,
}: {
  task: Task;
  metaTick: number;
  assigneeName: string | null;
  draggable: boolean;
  dragging: boolean;
  touchActive: boolean;
  canWrite: boolean;
  isDone: boolean;
  today: string | null;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onDragEnd: () => void;
  onTouchDragStart: (e: React.PointerEvent, taskId: string) => void;
  onTouchDragMove: (e: React.PointerEvent) => void;
  onTouchDragEnd: (e: React.PointerEvent) => void;
  onTouchDragCancel: () => void;
  onOpen: (task: Task) => void;
  onDone: (task: Task) => void;
}) {
  // Label + checklist live in per-task local meta (no backend fields for
  // them); metaTick re-reads after the modal saves.
  const meta = useMemo(() => loadLagoonMeta(task.id), [task.id, metaTick]);
  const label = useMemo(() => effectiveLabel(task.priority, meta), [task.priority, meta]);
  const dueYmd = toYmd(task.dueAt);
  const due = dueYmd ? lagoonDueBadge(dueYmd, today) : null;
  const doneItems = meta.checklist.filter((c) => c.done).length;

  return (
    <article
      className={cx("lagoon-card", dragging && "is-dragging", isDone && "is-done")}
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
      onClick={() => onOpen(task)}
      style={touchActive ? { touchAction: "none", userSelect: "none" } : { touchAction: "pan-y" }}
      role="listitem"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(task);
      }}
    >
      {label ? (
        <span className={cx("lagoon-card-label", `lg-pill-${label.tone}`)}>{label.text}</span>
      ) : null}
      <h3 className="lagoon-card-title">{task.title}</h3>
      {task.description ? <p className="lagoon-card-desc">{task.description}</p> : null}
      <div className="lagoon-card-foot">
        {assigneeName ? (
          <span
            className="lagoon-avatar"
            title={assigneeName}
            style={{ width: 24, height: 24, fontSize: 9, background: lagoonAvatarTone(task.assigneeId ?? "?") }}
          >
            {lagoonInitials(assigneeName)}
          </span>
        ) : null}
        {due ? (
          <span
            className={cx(
              "lagoon-due",
              due.status === "overdue" && !isDone && "is-overdue",
              due.status === "today" && "is-today",
            )}
          >
            <IconCalendar size={12} />
            {due.status === "overdue" && !isDone ? `Overdue · ${due.text}` : due.text}
          </span>
        ) : null}
        <span className="lagoon-card-stats">
          {meta.checklist.length > 0 ? (
            <span className={cx(doneItems === meta.checklist.length && "is-complete")} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <IconListTodo size={12} />
              {doneItems}/{meta.checklist.length}
            </span>
          ) : null}
          {isDone ? <IconCheck size={12} style={{ color: "var(--lagoon-success)" }} /> : null}
          {!isDone && canWrite ? (
            <button
              type="button"
              className="lagoon-done-btn"
              aria-label={`Mark ${task.title} as done`}
              title="Mark as done"
              onClick={(e) => {
                e.stopPropagation();
                onDone(task);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <IconCheck size={12} />
            </button>
          ) : null}
        </span>
      </div>
    </article>
  );
});

/** Treloo-style list title — click to rename inline, Enter/blur saves. */
function LagoonListTitle({
  status,
  title,
  canWrite,
  onRename,
}: {
  status: Task["status"];
  title: string;
  canWrite: boolean;
  onRename: (status: Task["status"], label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  if (!editing) {
    return (
      <h2
        title={canWrite ? "Rename list" : title}
        onClick={() => {
          if (canWrite) {
            setDraft(title);
            setEditing(true);
          }
        }}
        style={canWrite ? { cursor: "pointer" } : undefined}
      >
        {title}
      </h2>
    );
  }

  const commit = () => {
    setEditing(false);
    const next = draft.trim().slice(0, 50);
    if (next && next !== title) onRename(status, next);
    else setDraft(title);
  };

  return (
    <input
      autoFocus
      value={draft}
      maxLength={50}
      aria-label="List name"
      className="lagoon-input"
      style={{ fontSize: 13, fontWeight: 600, padding: "2px 8px" }}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          setDraft(title);
          setEditing(false);
        }
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/** Flat timeline row — same card data, sorted by due date. */
function LagoonTimelineRow({
  task,
  project,
  assigneeName,
  metaTick,
  today,
  onOpen,
}: {
  task: Task;
  project: Project | null;
  assigneeName: string | null;
  metaTick: number;
  today: string | null;
  onOpen: (task: Task) => void;
}) {
  const meta = useMemo(() => loadLagoonMeta(task.id), [task.id, metaTick]);
  const label = useMemo(() => effectiveLabel(task.priority, meta), [task.priority, meta]);
  const dueYmd = toYmd(task.dueAt);
  const due = dueYmd ? lagoonDueBadge(dueYmd, today) : null;
  return (
    <button type="button" className="lagoon-tl-row" onClick={() => onOpen(task)}>
      <span style={{ width: 8, height: 8, borderRadius: 9999, background: STATUS_DOT[task.status] ?? "var(--lagoon-muted-fg)", flex: "none" }} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {task.title}
        </span>
        <span style={{ fontSize: 10, color: "var(--lagoon-muted-fg)", fontFamily: "var(--font-mono)" }}>
          {project ? `${project.key} · ` : ""}{STATUS_LABELS[task.status] ?? task.status}
        </span>
      </span>
      {label ? <span className={cx("lagoon-card-label", `lg-pill-${label.tone}`)} style={{ marginBottom: 0 }}>{label.text}</span> : null}
      {due ? (
        <span className={cx("lagoon-due", due.status === "overdue" && "is-overdue", due.status === "today" && "is-today")}>
          <IconCalendar size={12} />{due.text}
        </span>
      ) : null}
      {assigneeName ? (
        <span className="lagoon-avatar" title={assigneeName} style={{ width: 24, height: 24, fontSize: 9, background: lagoonAvatarTone(task.assigneeId ?? "?") }}>
          {lagoonInitials(assigneeName)}
        </span>
      ) : null}
    </button>
  );
}

function LagoonBoard() {
  const toast = useToast();
  const router = useRouter();
  const { user, memberships } = useAuth();
  const { org, unread } = useTenant();
  const { openMenu, openNotifs, openNewBoard } = useLagoonChrome();
  const orgId = getCurrentTenantId();
  const searchParams = useSearchParams();
  const updateTask = useUpdateTask();

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

  const listsQ = useSWR<{ lists: ListLabel[] }>(
    selectedProjectId ? `board-lists-${selectedProjectId}` : null,
    () => api.projects.lists(selectedProjectId),
  );
  const labelMap = useMemo(
    () => new Map((listsQ.data?.lists ?? []).map((l) => [l.status, l.label])),
    [listsQ.data],
  );
  const labelFor = useCallback(
    (status: string) => labelMap.get(status as Task["status"]) ?? STATUS_LABELS[status] ?? status,
    [labelMap],
  );

  const membersQ = useSWR<{ members: Member[] }>(
    orgId ? `ctx-members-${orgId}` : null,
    () => api.orgs.listMembers(orgId!),
  );
  const members = membersQ.data?.members ?? [];
  const memberName = useCallback(
    (userId: string | null) => {
      if (!userId) return null;
      const m = members.find((x) => x.userId === userId);
      return m?.name ?? m?.email ?? null;
    },
    [members],
  );

  const handleRenameList = useCallback(
    async (status: Task["status"], label: string) => {
      const clean = label.trim().slice(0, 50);
      if (!canWrite || !selectedProjectId || !clean || clean === labelFor(status)) return;
      await listsQ.mutate(
        (current) => ({
          lists: [...(current?.lists ?? []).filter((l) => l.status !== status), { status, label: clean }],
        }),
        { revalidate: false },
      );
      try {
        await api.projects.renameList(selectedProjectId, status, clean);
        toast({ title: "List renamed", msg: `Now called "${clean}".` });
        await listsQ.mutate();
      } catch (err) {
        await listsQ.mutate();
        toast({ title: "Rename failed", msg: err instanceof Error ? err.message : "Try again." });
      }
    },
    [canWrite, selectedProjectId, listsQ, labelFor, toast],
  );

  // Joyful filters — Treloo search + label-tone dots + active-only toggle.
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [toneFilter, setToneFilter] = useState<LagoonTone | null>(null);
  const [activeOnly, setActiveOnly] = useState(false);
  const [metaTick, setMetaTick] = useState(0);
  const bumpMeta = useCallback(() => setMetaTick((t) => t + 1), []);
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(todayYmd()), []);

  // Board / Timeline / Calendar views (?view= deep-links from the sidebar).
  const viewParam = searchParams.get("view");
  const [view, setView] = useState<BoardView>(
    viewParam === "calendar" || viewParam === "timeline" ? viewParam : "board",
  );
  useEffect(() => {
    if (viewParam === "board" || viewParam === "timeline" || viewParam === "calendar") {
      setView(viewParam);
    }
  }, [viewParam]);

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
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

  const [composerFor, setComposerFor] = useState<Task["status"] | null>(null);
  const [composerText, setComposerText] = useState("");
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
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const selectedTask = selectedTaskId ? (projectTasks.find((t) => t.id === selectedTaskId) ?? null) : null;

  const handleSelectProject = useCallback(
    (id: string) => {
      setSelectedTaskId(null);
      setComposerFor(null);
      router.push(`/app/board?project=${id}`);
    },
    [router],
  );

  const columns = useMemo(
    () =>
      STATUS_ORDER.map((status) => ({
        status,
        tasks: projectTasks.filter((t) => t.status === status),
      })),
    [projectTasks],
  );

  const filteredColumns = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    // metaTick re-reads per-task local meta (labels/checklists) after modal saves.
    void metaTick;
    return columns.map((col) => ({
      ...col,
      tasks: col.tasks.filter((t) => {
        if (activeOnly && t.status === "done") return false;
        if (toneFilter) {
          const meta = loadLagoonMeta(t.id);
          const label = effectiveLabel(t.priority, meta);
          if (!label || label.tone !== toneFilter) return false;
        }
        if (!q) return true;
        const meta = loadLagoonMeta(t.id);
        const labelText = effectiveLabel(t.priority, meta)?.text ?? "";
        return `${t.title} ${t.description ?? ""} ${labelText}`.toLowerCase().includes(q);
      }),
    }));
  }, [columns, deferredSearch, activeOnly, toneFilter, metaTick]);

  const flatTasks = useMemo(() => filteredColumns.flatMap((c) => c.tasks), [filteredColumns]);

  const timelineTasks = useMemo(
    () =>
      [...flatTasks].sort((a, b) => {
        if (!a.dueAt && !b.dueAt) return 0;
        if (!a.dueAt) return 1;
        if (!b.dueAt) return -1;
        return a.dueAt < b.dueAt ? -1 : 1;
      }),
    [flatTasks],
  );

  const calendarGroups = useMemo(() => {
    const groups: Array<{ key: string; label: string; tasks: Task[] }> = [
      { key: "overdue", label: "Overdue", tasks: [] },
      { key: "today", label: "Today", tasks: [] },
      { key: "tomorrow", label: "Tomorrow", tasks: [] },
      { key: "week", label: "This week", tasks: [] },
      { key: "later", label: "Later", tasks: [] },
      { key: "nodate", label: "No date", tasks: [] },
    ];
    if (!today) {
      groups[5]!.tasks = flatTasks;
      return groups;
    }
    const tomorrow = (() => {
      const d = new Date(`${today}T12:00:00`);
      d.setDate(d.getDate() + 1);
      return todayYmd(d);
    })();
    const weekEnd = (() => {
      const d = new Date(`${today}T12:00:00`);
      d.setDate(d.getDate() + 7);
      return todayYmd(d);
    })();
    for (const t of flatTasks) {
      const ymd = toYmd(t.dueAt);
      if (!ymd) groups[5]!.tasks.push(t);
      else if (ymd < today && t.status !== "done") groups[0]!.tasks.push(t);
      else if (ymd === today) groups[1]!.tasks.push(t);
      else if (ymd === tomorrow) groups[2]!.tasks.push(t);
      else if (ymd <= weekEnd) groups[3]!.tasks.push(t);
      else groups[4]!.tasks.push(t);
    }
    return groups;
  }, [flatTasks, today]);

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

  const performDrop = useCallback(
    async (taskId: string, newStatus: string) => {
      const target = projectTasks.find((t) => t.id === taskId);
      if (!target || target.status === newStatus) return;
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
        toast({ title: "Task moved", msg: `Moved to ${labelFor(newStatus)}` });
        await tasksQ.mutate();
      } catch (err) {
        await tasksQ.mutate();
        toast({ title: "Move failed", msg: err instanceof Error ? err.message : "Try again." });
      }
    },
    [projectTasks, updateTask, selectedProjectId, toast, tasksQ, labelFor],
  );

  const handleDone = useCallback(
    async (task: Task) => {
      if (!canWrite || task.status === "done") return;
      await performDrop(task.id, "done");
    },
    [canWrite, performDrop],
  );

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
        const origin = touchOrigin.current;
        if (origin && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > TOUCH_MOVE_TOLERANCE) {
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
      if (!wasActive || !taskId) return;
      const status = statusFromPoint(e.clientX, e.clientY);
      if (!status) return;
      void performDrop(taskId, status);
    },
    [touchDrag, statusFromPoint, performDrop],
  );

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

  /** Backend patch with optimistic UI — throws on failure for modal handling. */
  const patchTask = useCallback(
    async (taskId: string, patch: Partial<Task>) => {
      await tasksQ.mutate(
        (current) => ({
          ...(current ?? { data: [], nextCursor: null, hasMore: false }),
          data: (current?.data ?? []).map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
        }),
        { revalidate: false },
      );
      try {
        await updateTask(taskId, patch, selectedProjectId);
        await tasksQ.mutate();
      } catch (err) {
        await tasksQ.mutate();
        throw err;
      }
    },
    [tasksQ, updateTask, selectedProjectId],
  );

  const handleDeleteTask = useCallback(
    async (task: Task) => {
      try {
        await api.tasks.delete(task.id);
        clearLagoonMeta(task.id);
        setSelectedTaskId(null);
        await tasksQ.mutate();
        toast({ title: "Card deleted", msg: "Task moved to trash." });
      } catch (err) {
        toast({ title: "Delete failed", msg: err instanceof Error ? err.message : "Try again." });
      }
    },
    [tasksQ, toast],
  );

  const openCard = useCallback((task: Task) => setSelectedTaskId(task.id), []);

  if (!projectsQ.isLoading && projects.length === 0) {
    return (
      <LagoonShell
        projects={projects}
        activeProjectId=""
        onSelectProject={() => {}}
        onProjectsChanged={() => projectsQ.mutate()}
      >
        <div className="lagoon-list-wrap" style={{ paddingTop: 32 }}>
          <div className="lagoon-empty">
            <h3 className="lagoon-display" style={{ fontSize: 16, fontWeight: 600 }}>No boards yet</h3>
            <p style={{ marginTop: 8, fontSize: 13, color: "var(--lagoon-muted-fg)" }}>
              Create your first board to start adding cards.
            </p>
            <button className="lagoon-create-btn" style={{ marginTop: 16 }} onClick={openNewBoard}>
              <IconPlus size={14} /> New board
            </button>
          </div>
        </div>
      </LagoonShell>
    );
  }

  return (
    <LagoonShell
      projects={projects}
      activeProjectId={selectedProjectId}
      onSelectProject={handleSelectProject}
      onProjectsChanged={() => projectsQ.mutate()}
    >
      <header className="lagoon-header">
        <button aria-label="Open menu" className="lagoon-icon-btn lagoon-only-mobile" onClick={openMenu}>
          <IconMenu size={18} />
        </button>
        <span style={{ width: 8, height: 8, borderRadius: 9999, background: "var(--lagoon-teal)", flex: "none" }} />
        <div style={{ minWidth: 0 }}>
          <h1 style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selectedProject?.name ?? "Board"}
          </h1>
          <p className="lagoon-sub">{org?.name ?? "Workspace"} · updated just now</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          <div className="lagoon-search" style={{ width: 224 }} data-lagoon-desktop-search>
            <IconSearch size={14} />
            <input
              aria-label="Search tasks"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks, people…"
            />
          </div>
          <div style={{ alignItems: "center" }} data-lagoon-avatar-cluster>
            {members.slice(0, 3).map((m) => {
              const display = m.name ?? m.email ?? m.userId.slice(0, 4);
              return (
                <span
                  key={m.userId}
                  title={display}
                  className="lagoon-avatar"
                  style={{ width: 28, height: 28, fontSize: 9, background: lagoonAvatarTone(m.userId), border: "2px solid var(--lagoon-card)", marginLeft: -8 }}
                >
                  {lagoonInitials(display)}
                </span>
              );
            })}
          </div>
          <button aria-label="Notifications" className="lagoon-icon-btn" onClick={openNotifs} style={{ position: "relative" }}>
            <IconBell size={18} />
            {unread > 0 ? (
              <span style={{ position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: 9999, background: "var(--lagoon-coral)" }} />
            ) : null}
          </button>
          <button className="lagoon-icon-btn" onClick={toggleStarred} aria-pressed={starred} aria-label={starred ? "Unstar board" : "Star board"} title={starred ? "Unstar board" : "Star board"} style={{ color: starred ? "#e2b203" : undefined }}>
            <IconStar size={16} />
          </button>
          <button
            className="lagoon-create-btn"
            onClick={() => {
              setComposerText("");
              setComposerFor(columns[0]?.status ?? "backlog");
              setView("board");
            }}
            disabled={!selectedProjectId || !user}
          >
            <IconPlus size={14} /> <span data-lagoon-create-label>Create</span>
          </button>
        </div>
      </header>

      <div className="lagoon-filterbar">
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
          <button className={cx("lagoon-view-btn", view === "board" && "is-on")} onClick={() => setView("board")}>
            <IconColumns size={14} /> Board
          </button>
          <button className={cx("lagoon-view-btn", view === "timeline" && "is-on")} onClick={() => setView("timeline")}>
            <IconList size={14} /> Timeline
          </button>
          <button className={cx("lagoon-view-btn", view === "calendar" && "is-on")} onClick={() => setView("calendar")}>
            <IconCalendar size={14} /> Calendar
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {LAGOON_TONES.map((tone) => (
            <button
              key={tone}
              aria-label={`Filter ${tone} labels`}
              onClick={() => setToneFilter((v) => (v === tone ? null : tone))}
              className={cx("lagoon-tone-btn", toneFilter === tone && "is-on")}
            >
              <span style={{ width: 12, height: 12, borderRadius: 9999, background: `var(--lagoon-${tone})` }} />
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          <button className={cx("lagoon-toggle-btn", activeOnly && "is-on")} onClick={() => setActiveOnly((v) => !v)}>
            <IconSliders size={14} /> {activeOnly ? "Active only" : "All tasks"}
          </button>
        </div>
        <div className="lagoon-search" style={{ width: "100%" }} data-lagoon-mobile-search>
          <IconSearch size={14} />
          <input
            aria-label="Search tasks on mobile"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks…"
          />
        </div>
      </div>

      {view === "board" ? (
        <div className="lagoon-board-scroll">
          <div className="lagoon-cols">
            {filteredColumns.map((col) => (
              <section
                key={col.status}
                data-status={col.status}
                className="lagoon-col"
                aria-label={`${labelFor(col.status)}, ${col.tasks.length} tasks`}
                onDragOver={(e) => handleDragOver(e, col.status)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => void handleDrop(e, col.status)}
              >
                <div className="lagoon-col-head">
                  <span style={{ width: 8, height: 8, borderRadius: 9999, background: STATUS_DOT[col.status], flex: "none" }} />
                  <LagoonListTitle
                    status={col.status as Task["status"]}
                    title={labelFor(col.status)}
                    canWrite={canWrite}
                    onRename={handleRenameList}
                  />
                  <span className="lagoon-col-count">{col.tasks.length}</span>
                </div>
                <div className={cx("lagoon-col-body", draggedTaskId && "is-dragging")} role="list">
                  {col.tasks.map((task) => (
                    <LagoonTaskCard
                      key={task.id}
                      task={task}
                      metaTick={metaTick}
                      assigneeName={memberName(task.assigneeId)}
                      draggable={canWrite}
                      dragging={draggedTaskId === task.id || (touchDrag?.active === true && touchDrag.taskId === task.id)}
                      touchActive={touchDrag?.active === true && touchDrag.taskId === task.id}
                      canWrite={canWrite}
                      isDone={col.status === "done"}
                      today={today}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onTouchDragStart={handleTouchDragStart}
                      onTouchDragMove={handleTouchDragMove}
                      onTouchDragEnd={handleTouchDragEnd}
                      onTouchDragCancel={cancelTouchDrag}
                      onOpen={openCard}
                      onDone={handleDone}
                    />
                  ))}
                  {composerFor === col.status && canWrite ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleQuickAdd();
                      }}
                      className="lagoon-composer"
                    >
                      <textarea
                        autoFocus
                        value={composerText}
                        onChange={(e) => setComposerText(e.target.value)}
                        placeholder="What needs to be done?"
                        aria-label={`Add a card to ${labelFor(col.status)}`}
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
                      <div className="lagoon-composer-actions">
                        <button type="submit" className="lagoon-btn" disabled={!composerText.trim()}>
                          Add card
                        </button>
                        <button
                          type="button"
                          aria-label="Cancel"
                          className="lagoon-icon-btn"
                          onClick={() => {
                            setComposerFor(null);
                            setComposerText("");
                          }}
                        >
                          <IconX size={16} />
                        </button>
                      </div>
                    </form>
                  ) : canWrite ? (
                    <button
                      className="lagoon-add-card"
                      onClick={() => {
                        setComposerText("");
                        setComposerFor(col.status as Task["status"]);
                      }}
                      disabled={!selectedProjectId || !user}
                    >
                      <IconPlus size={14} /> Add card
                    </button>
                  ) : null}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : view === "timeline" ? (
        <div className="lagoon-list-wrap">
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 880 }}>
            {timelineTasks.length === 0 ? (
              <div className="lagoon-empty">
                <p style={{ fontSize: 13, color: "var(--lagoon-muted-fg)" }}>Nothing scheduled — add due dates to line up the work.</p>
              </div>
            ) : (
              timelineTasks.map((task) => (
                <LagoonTimelineRow
                  key={task.id}
                  task={task}
                  project={selectedProject}
                  assigneeName={memberName(task.assigneeId)}
                  metaTick={metaTick}
                  today={today}
                  onOpen={openCard}
                />
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="lagoon-list-wrap">
          <div style={{ display: "grid", gap: 12, maxWidth: 880 }}>
            {calendarGroups.map((group) => (
              <section key={group.key} className="lagoon-cal-group" aria-label={`${group.label}, ${group.tasks.length} tasks`}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <h2 className="lagoon-display" style={{ fontSize: 13, fontWeight: 600 }}>{group.label}</h2>
                  <span className="lagoon-col-count">{group.tasks.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {group.tasks.length === 0 ? (
                    <p style={{ fontSize: 12, color: "var(--lagoon-muted-fg)" }}>Nothing here.</p>
                  ) : (
                    group.tasks.map((task) => (
                      <LagoonTimelineRow
                        key={task.id}
                        task={task}
                        project={selectedProject}
                        assigneeName={memberName(task.assigneeId)}
                        metaTick={metaTick}
                        today={today}
                        onOpen={openCard}
                      />
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

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
                  translate: "-50% -115%",
                  zIndex: 200,
                  pointerEvents: "none",
                  minWidth: 180,
                  maxWidth: 260,
                  background: "var(--lagoon-card)",
                  border: "1px solid var(--lagoon-border)",
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

      {!canWrite && projectTasks.length > 0 ? (
        <p style={{ padding: "0 20px 12px", fontSize: 11, color: "var(--lagoon-muted-fg)" }}>
          View-only role — ask an admin to move tasks.
        </p>
      ) : null}

      {selectedTask ? (
        <LagoonCardModal
          key={selectedTask.id}
          task={selectedTask}
          project={selectedProject}
          members={members}
          canWrite={canWrite}
          onClose={() => setSelectedTaskId(null)}
          onPatch={patchTask}
          onDelete={handleDeleteTask}
          onMetaChanged={bumpMeta}
        />
      ) : null}
    </LagoonShell>
  );
}

export default function BoardPageWrapper() {
  return (
    <Suspense fallback={<div className="lagoon" style={{ padding: 24, fontSize: 13 }}>Loading…</div>}>
      <LagoonBoard />
    </Suspense>
  );
}
