"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/overlay";
import { AppShell } from "@/components/app-shell";
import {
  IconArrowLeft,
  IconClock,
  IconMessageSquare,
  IconEdit,
  IconTrash,
  IconX,
} from "@/components/icons";
import { api, getCurrentTenantId, type Comment, type Task } from "@/lib/api";
import { Button } from "@heroui/react";
import { useAuth } from "@/lib/auth";
import { useSWR } from "@/lib/swr";
import { cx, timeAgo, hueFrom, isOverdue } from "@/lib/utils";

const STATUSES = ["backlog", "todo", "in_progress", "done"] as const;
const PRIORITIES = ["critical", "high", "medium", "low", "none"] as const;
const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};
const STATUS_COLORS: Record<string, string> = {
  backlog: "var(--muted)",
  todo: "hsl(210 80% 50%)",
  in_progress: "hsl(35 90% 50%)",
  done: "hsl(140 60% 45%)",
};

function SidebarCard({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <div className={cx("sidebar-card", className)}>{children}</div>;
}

function CommentItem({
  comment,
  authorName,
  onDelete,
  canDelete,
  isOwn,
}: {
  comment: Comment;
  authorName: string | null;
  onDelete: () => void;
  canDelete: boolean;
  isOwn: boolean;
}) {
  const tint = hueFrom(comment.authorId);
  return (
    <div className="comment-item">
      <div className="comment-avatar">
        <span style={{ background: `hsl(${tint} 60% 50%)` }}>{(authorName ?? "?").slice(0, 1)}</span>
      </div>
      <div className="comment-content">
        <div className="comment-header">
          <span className="comment-author">
            {authorName ?? "Unknown"}
            {isOwn ? <span className="faint"> · you</span> : null}
          </span>
          <span className="comment-time">{timeAgo(comment.createdAt)}</span>
        </div>
        <p className="comment-body" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {comment.body}
        </p>
        {canDelete ? (
          <div className="comment-actions">
            <button className="btn btn-ghost btn-xs" onClick={onDelete}>
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function TaskDetailPage() {
  const { user, memberships } = useAuth();
  const params = useParams<{ id: string }>();
  const taskId = typeof params.id === "string" ? params.id : "";
  const router = useRouter();
  const toast = useToast();
  const orgId = getCurrentTenantId();
  const [commentBody, setCommentBody] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<Task["status"]>("backlog");
  const [editPriority, setEditPriority] = useState<Task["priority"]>("none");
  const [editAssigneeId, setEditAssigneeId] = useState("");
  const [editDueAt, setEditDueAt] = useState("");
  // Duration-chip selection driving the deadline (no calendar): "none" clears
  // it, "custom" takes its day count from `customDays`. editDueAt stays the
  // underlying datetime-local value so saving is unchanged.
  const [duePreset, setDuePreset] = useState<"none" | "1" | "3" | "7" | "custom">("none");
  const [customDays, setCustomDays] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const taskQ = useSWR<{ task: Task }>(taskId ? `task-${taskId}` : null, () => api.tasks.get(taskId));
  const commentsQ = useSWR<{ data: Comment[]; nextCursor: string | null; hasMore: boolean }>(
    taskId ? `comments-${taskId}` : null,
    () => api.comments.list(taskId, { limit: 50 }),
  );
  const membersQ = useSWR<{ members: Array<{ userId: string; name: string | null }> }>(
    orgId ? `task-members-${orgId}` : null,
    () => api.orgs.listMembers(orgId!),
  );
  const projectQ = useSWR<{ projects: Array<{ id: string; name: string; key: string; teamId: string | null }> }>(
    taskId && orgId ? `task-projects-${orgId}` : null,
    () => api.projects.list(orgId!),
  );

  const task = taskQ.data?.task ?? null;
  const comments = commentsQ.data?.data ?? [];
  const nameById = useMemo(
    () => new Map((membersQ.data?.members ?? []).map((m) => [m.userId, m.name ?? null])),
    [membersQ.data],
  );
  const project = useMemo(
    () => (task ? projectQ.data?.projects.find((p) => p.id === task.projectId) : null) ?? null,
    [task, projectQ.data],
  );
  const myRole = memberships.find((m) => m.tenant_id === orgId)?.role;
  const canWrite = myRole === "owner" || myRole === "admin" || myRole === "member";
  const assignee = task?.assigneeId
    ? { id: task.assigneeId, name: nameById.get(task.assigneeId) ?? "Unknown" }
    : null;
  const reporter = task?.reporterId
    ? { id: task.reporterId, name: nameById.get(task.reporterId) ?? "Unknown" }
    : null;

  const patch = async (data: Partial<Task>, okMsg: string) => {
    if (!taskId || !task) return;
    // Optimistic: controlled selects (status/priority) render from server
    // state, so without this they snap back to the old value while the PATCH
    // is in flight. Roll back to server state on failure.
    await taskQ.mutate({ task: { ...task, ...data } }, { revalidate: false });
    try {
      await api.tasks.update(taskId, data);
      await taskQ.mutate();
      toast({ title: okMsg, msg: "Saved." });
    } catch (err) {
      await taskQ.mutate();
      toast({ title: "Update failed", msg: err instanceof Error ? err.message : "Try again." });
    }
  };

  const handleStatusChange = (status: string) =>
    void patch({ status: status as Task["status"] }, "Status updated");
  const handlePriorityChange = (priority: string) =>
    void patch({ priority: priority as Task["priority"] }, "Priority updated");

  const handleDelete = async () => {
    if (!taskId) return;
    setDeleting(true);
    try {
      await api.tasks.delete(taskId);
      toast({ title: "Task deleted", msg: "Task moved to trash" });
      router.push("/app/work");
    } catch (err) {
      toast({ title: "Delete failed", msg: err instanceof Error ? err.message : "Try again." });
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const openEdit = () => {
    if (!task) return;
    setEditTitle(task.title);
    setEditDescription(task.description ?? "");
    setEditStatus(task.status);
    setEditPriority(task.priority);
    setEditAssigneeId(task.assigneeId ?? "");
    setEditDueAt(task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 16) : "");
    // Reflect the existing deadline in the duration chips where possible.
    if (!task.dueAt) {
      setDuePreset("none");
      setCustomDays("");
    } else {
      const days = Math.round((new Date(task.dueAt).getTime() - Date.now()) / 86_400_000);
      if (days === 1 || days === 3 || days === 7) {
        setDuePreset(String(days) as "1" | "3" | "7");
        setCustomDays("");
      } else {
        setDuePreset("custom");
        setCustomDays(String(Math.max(1, days)));
      }
    }
    setShowEdit(true);
  };

  /** Set the deadline N days from now (same time of day), as a local
   * datetime-local value for the existing save path. */
  const applyDueInDays = (days: number, preset: "1" | "3" | "7" | "custom") => {
    const d = new Date(Date.now() + days * 86_400_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    setEditDueAt(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
    );
    setDuePreset(preset);
  };

  const handleSaveEdit = async () => {
    if (!taskId || !editTitle.trim()) return;
    setSaving(true);
    try {
      const payload: Record<string, string | null> = {};
      if (editTitle.trim() !== task?.title) payload.title = editTitle.trim();
      if (editDescription !== (task?.description ?? "")) payload.description = editDescription;
      if (editStatus !== task?.status) payload.status = editStatus;
      if (editPriority !== task?.priority) payload.priority = editPriority;
      const nextAssignee = editAssigneeId === "" ? null : editAssigneeId;
      if (nextAssignee !== (task?.assigneeId ?? null)) payload.assigneeId = nextAssignee;
      const nextDue = editDueAt === "" ? null : new Date(editDueAt).toISOString();
      const currentDue = task?.dueAt ? new Date(task.dueAt).toISOString() : null;
      if (nextDue !== currentDue) payload.dueAt = nextDue;
      if (Object.keys(payload).length > 0) {
        await api.tasks.update(taskId, payload);
        await taskQ.mutate();
      }
      setShowEdit(false);
      toast({ title: "Task updated", msg: "Saved." });
    } catch (err) {
      toast({ title: "Update failed", msg: err instanceof Error ? err.message : "Try again." });
    } finally {
      setSaving(false);
    }
  };

  const handleComment = async () => {
    const body = commentBody.trim();
    if (!body || !taskId || postingComment) return;
    setPostingComment(true);
    try {
      const res = await api.comments.create(taskId, body);
      setCommentBody("");
      // Optimistic: show the new comment instantly, then reconcile with server.
      await commentsQ.mutate(
        (current) => ({
          data: [res.comment, ...(current?.data ?? [])],
          nextCursor: current?.nextCursor ?? null,
          hasMore: current?.hasMore ?? false,
        }),
      );
      toast({ title: "Comment added", msg: "Posted." });
    } catch (err) {
      toast({ title: "Comment failed", msg: err instanceof Error ? err.message : "Try again." });
    } finally {
      setPostingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    // Optimistic: remove instantly, roll back to server state on failure.
    await commentsQ.mutate(
      (current) => ({
        data: (current?.data ?? []).filter((c) => c.id !== commentId),
        nextCursor: current?.nextCursor ?? null,
        hasMore: current?.hasMore ?? false,
      }),
      { revalidate: false },
    );
    try {
      await api.comments.delete(commentId);
      await commentsQ.mutate();
    } catch (err) {
      await commentsQ.mutate();
      toast({ title: "Delete failed", msg: err instanceof Error ? err.message : "Try again." });
    }
  };

  const canDeleteComment = (c: Comment) => c.authorId === user?.id;

  if (taskQ.isLoading) {
    return (
      <AppShell>
        <div className="page">
          <div className="loading">Loading…</div>
        </div>
      </AppShell>
    );
  }

  if (!task) {
    return (
      <AppShell>
        <div className="page">
          <div className="empty-state">
            <h3>Task not found</h3>
            <p>It may be deleted, or belong to another organization.</p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="page task-detail-page">
        <header className="task-header-bar">
          <Link href="/app/work" className="btn btn-ghost btn-icon" aria-label="Back">
            <IconArrowLeft size={18} />
          </Link>
          <div className="task-header-main">
            <span className="task-detail-key">{project?.key ?? `ID-${task.id.slice(0, 6)}`}</span>
            <h1 className="task-detail-title">{task.title}</h1>
            <div className="task-detail-meta">
              {project ? (
                <Link
                  href={`/app/board?project=${project.id}`}
                  className="task-project-link"
                  style={{ borderColor: `hsl(${hueFrom(project.id)} 80% 70%)` }}
                >
                  {project.key}
                </Link>
              ) : null}
              <span className="task-status-badge" style={{ background: STATUS_COLORS[task.status] }}>
                {STATUS_LABELS[task.status]}
              </span>
              {isOverdue(task.dueAt, task.status) ? (
                <span
                  className="task-status-badge"
                  style={{ background: "hsl(0 75% 45%)" }}
                  title={`Deadline passed ${new Date(task.dueAt as string).toLocaleString()} — moves back to Backlog automatically`}
                >
                  OVERDUE
                </span>
              ) : null}
            </div>
          </div>
          <div className="task-header-actions">
            {canWrite ? (
              <>
                <button className="btn btn-ghost btn-sm" onClick={openEdit}>
                  <IconEdit size={14} /> Edit
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowDeleteConfirm(true)}>
                  <IconTrash size={14} /> Delete
                </button>
              </>
            ) : null}
          </div>
        </header>

        <div className="task-detail-grid">
          <main className="task-main">
            <section className="task-section">
              <h3>Description</h3>
              <div className="task-description">
                {task.description ? (
                  <p>{task.description}</p>
                ) : (
                  <textarea
                    className="textarea"
                    rows={3}
                    placeholder="No description yet. Write one here…"
                    disabled={!canWrite}
                    onBlur={(e) => {
                      if (e.target.value.trim() && e.target.value !== task.description) {
                        void patch({ description: e.target.value }, "Description updated");
                      }
                    }}
                  />
                )}
              </div>
              {canWrite && task.description ? (
                <button className="btn btn-ghost btn-sm" onClick={openEdit}>
                  <IconEdit size={14} /> Edit description
                </button>
              ) : null}
            </section>

            <section className="task-section">
              <h3>Comments {comments.length > 0 ? <span className="faint">({comments.length})</span> : null}</h3>
              <div className="comments-list">
                {commentsQ.isLoading ? (
                  <p className="empty-text">Loading comments…</p>
                ) : comments.length === 0 ? (
                  <p className="empty-text">No comments yet. Be the first to comment!</p>
                ) : (
                  comments.map((c) => (
                    <CommentItem
                      key={c.id}
                      comment={c}
                      authorName={nameById.get(c.authorId) ?? null}
                      canDelete={canDeleteComment(c)}
                      isOwn={c.authorId === user?.id}
                      onDelete={() => void handleDeleteComment(c.id)}
                    />
                  ))
                )}
                {canWrite ? (
                  <form
                    className="comment-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleComment();
                    }}
                  >
                    <textarea
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void handleComment();
                      }}
                      placeholder="Write a comment… (⌘/Ctrl + Enter to post)"
                      rows={3}
                      disabled={postingComment}
                    />
                    <div className="comment-form-actions">
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={!commentBody.trim() || postingComment}
                      >
                        <IconMessageSquare size={14} /> {postingComment ? "Posting…" : "Add comment"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="empty-text">View-only role — you can read but not post comments.</p>
                )}
              </div>
            </section>
          </main>

          <aside className="task-sidebar">
            <SidebarCard>
              <h3 style={{ marginBottom: 12 }}>Details</h3>
              <div className="form-field">
                <label htmlFor="task-status">Status</label>
                <select
                  id="task-status"
                  value={task.status}
                  disabled={!canWrite}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="select"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="task-priority">Priority</label>
                <select
                  id="task-priority"
                  value={task.priority}
                  disabled={!canWrite}
                  onChange={(e) => handlePriorityChange(e.target.value)}
                  className="select"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Assignee</label>
                <span className="faint" style={{ fontSize: 13 }}>{assignee?.name ?? "Unassigned"}</span>
              </div>
              <div className="form-field">
                <label>Reporter</label>
                <span className="faint" style={{ fontSize: 13 }}>{reporter?.name ?? "Unknown"}</span>
              </div>
              {task.dueAt ? (
                <div className="form-field">
                  <label>Due</label>
                  <span className="faint" style={{ fontSize: 13 }}>
                    <IconClock size={12} /> {new Date(task.dueAt).toLocaleString()}
                  </span>
                  {task.status !== "done" && task.status !== "backlog" ? (
                    <p className="field-hint">If the deadline passes first, this task moves back to Backlog automatically.</p>
                  ) : null}
                </div>
              ) : null}
              {canWrite ? (
                <button className="btn btn-ghost btn-sm" onClick={openEdit} style={{ marginTop: 4 }}>
                  <IconEdit size={14} /> Edit all fields
                </button>
              ) : null}
            </SidebarCard>
            <Link href="/app/work" className="btn btn-primary">
              Back to your work
            </Link>
            {canWrite ? (
              <button className="btn btn-danger" onClick={() => setShowDeleteConfirm(true)}>
                <IconTrash size={14} /> Delete task
              </button>
            ) : null}
          </aside>
        </div>

        {showEdit ? (
          <div className="modal-backdrop" onClick={() => setShowEdit(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal aria-label="Edit task">
              <div className="modal-head">
                <div>
                  <div className="modal-title">Edit task</div>
                  <div className="modal-sub">Update any field. Changes are saved to the server.</div>
                </div>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowEdit(false)} aria-label="Close">
                  <IconX size={14} />
                </button>
              </div>
              <div className="modal-body">
                <div className="form-field">
                  <label htmlFor="edit-title">Title</label>
                  <input
                    id="edit-title"
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    maxLength={200}
                    autoFocus
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="edit-description">Description</label>
                  <textarea
                    id="edit-description"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={4}
                    placeholder="Add more detail…"
                  />
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <div className="form-field" style={{ flex: 1 }}>
                    <label htmlFor="edit-status">Status</label>
                    <select
                      id="edit-status"
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as Task["status"])}
                      className="select"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field" style={{ flex: 1 }}>
                    <label htmlFor="edit-priority">Priority</label>
                    <select
                      id="edit-priority"
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value as Task["priority"])}
                      className="select"
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-field">
                  <label htmlFor="edit-assignee">Assignee</label>
                  <select
                    id="edit-assignee"
                    value={editAssigneeId}
                    onChange={(e) => setEditAssigneeId(e.target.value)}
                    className="select"
                  >
                    <option value="">Unassigned</option>
                    {(membersQ.data?.members ?? []).map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name ?? m.userId}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label>Deadline</label>
                  <div className="due-presets" role="group" aria-label="Deadline">
                    {[
                      { preset: "1", label: "1 day" },
                      { preset: "3", label: "3 days" },
                      { preset: "7", label: "7 days" },
                    ].map((o) => (
                      <Button
                        key={o.preset}
                        size="sm"
                        variant={duePreset === o.preset ? "primary" : "secondary"}
                        onPress={() => applyDueInDays(Number(o.preset), o.preset as "1" | "3" | "7")}
                        aria-pressed={duePreset === o.preset}
                        className={cx(duePreset === o.preset && "shadow-sm ring-1 ring-[var(--brand-300)]")}
                      >
                        {o.label}
                      </Button>
                    ))}
                    <span
                      className={cx(
                        "due-custom-heroui",
                        duePreset === "custom" && "due-custom-heroui--active",
                      )}
                    >
                      <Button
                        size="sm"
                        variant={duePreset === "custom" ? "primary" : "secondary"}
                        onPress={() => {
                          const n = Math.max(1, Math.min(365, Math.floor(Number(customDays) || 0)));
                          if (n > 0) applyDueInDays(n, "custom");
                          else setDuePreset("custom");
                        }}
                        className={cx(
                          "due-custom-btn",
                          duePreset === "custom" && "shadow-sm",
                        )}
                      >
                        <IconClock size={14} />
                        Custom
                      </Button>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={customDays}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setCustomDays(raw);
                          const n = Math.floor(Number(raw));
                          if (Number.isFinite(n) && n >= 1 && n <= 365) applyDueInDays(n, "custom");
                        }}
                        placeholder="days"
                        aria-label="Custom deadline in days"
                        className="due-custom-input"
                      />
                    </span>
                    <Button
                      size="sm"
                      variant={duePreset === "none" ? "primary" : "ghost"}
                      onPress={() => {
                        setEditDueAt("");
                        setDuePreset("none");
                      }}
                      aria-pressed={duePreset === "none"}
                      className={duePreset === "none" ? "shadow-sm" : ""}
                    >
                      <IconX size={14} />
                      No deadline
                    </Button>
                  </div>
                  {editDueAt && !Number.isNaN(Date.parse(editDueAt)) ? (
                    isOverdue(new Date(editDueAt).toISOString(), editStatus) ? (
                      <p className="field-hint" style={{ color: "hsl(0 75% 45%)", fontWeight: 600 }}>
                        Overdue — if still open, the next sweep moves this task back to Backlog.
                      </p>
                    ) : (
                      <p className="field-hint">
                        Due {new Date(editDueAt).toLocaleString()}. Misses move back to Backlog automatically.
                      </p>
                    )
                  ) : (
                    <p className="field-hint">No deadline — the task never auto-moves.</p>
                  )}
                </div>
              </div>
              <div className="modal-foot">
                <button className="btn btn-ghost" onClick={() => setShowEdit(false)} disabled={saving}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={() => void handleSaveEdit()} disabled={!editTitle.trim() || saving}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showDeleteConfirm ? (
          <div className="modal-backdrop" onClick={() => setShowDeleteConfirm(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal aria-label="Delete task">
              <div className="modal-head">
                <div>
                  <div className="modal-title">Delete task?</div>
                  <div className="modal-sub">“{task.title}” will be moved to trash.</div>
                </div>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowDeleteConfirm(false)} aria-label="Close">
                  <IconX size={14} />
                </button>
              </div>
              <div className="modal-foot">
                <button className="btn btn-ghost" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={() => void handleDelete()} disabled={deleting}>
                  <IconTrash size={14} /> {deleting ? "Deleting…" : "Delete task"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}