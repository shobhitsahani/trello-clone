"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
import { Modal, useToast } from "@/components/overlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { cx, timeAgo, hueFrom, isOverdue, initials } from "@/lib/utils";
import { AnimatePresence, motion, backdropFade, popIn, PageEnter } from "@/components/motion";

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
  nameLoading,
  onDelete,
  canDelete,
  isOwn,
}: {
  comment: Comment;
  authorName: string | null;
  nameLoading?: boolean;
  onDelete: () => void;
  canDelete: boolean;
  isOwn: boolean;
}) {
  const tint = hueFrom(comment.authorId);
  return (
    <motion.div
      className="comment-item"
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
    >
      <div className="comment-avatar">
        {nameLoading ? (
          <Skeleton aria-hidden className="size-6 shrink-0 rounded-full" />
        ) : (
          <Avatar size="sm">
            <AvatarFallback
              style={{
                background: `hsl(${tint} 45% 20%)`,
                color: `hsl(${tint} 80% 78%)`,
              }}
            >
              {initials(authorName ?? "?")}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
      <div className="comment-content">
        <div className="comment-header">
          {nameLoading ? (
            <Skeleton aria-hidden className="h-3 w-24 rounded" />
          ) : (
            <span className="comment-author">
              {authorName ?? "Unknown"}
              {isOwn ? <span className="faint"> · you</span> : null}
            </span>
          )}
          <span className="comment-time">{timeAgo(comment.createdAt)}</span>
        </div>
        <p className="comment-body" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {comment.body}
        </p>
        {canDelete ? (
          <div className="comment-actions">
            <Button variant="ghost" size="xs" onClick={onDelete}>
              Delete
            </Button>
          </div>
        ) : null}
      </div>
    </motion.div>
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
  // Duration-chip selection driving the deadline, plus the calendar picker
  // below for an absolute date. "none" clears it, "custom" takes its value
  // from `customDays` or the picked date. editDueAt stays the underlying
  // datetime-local value so saving is unchanged.
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

  /** Set the deadline to an absolute calendar date, keeping the current
   * time of day (or now when none is set yet). */
  const applyDueDate = (date: Date | undefined) => {
    if (!date) {
      setEditDueAt("");
      setDuePreset("none");
      return;
    }
    const pad = (n: number) => String(n).padStart(2, "0");
    const base =
      editDueAt && !Number.isNaN(Date.parse(editDueAt)) ? new Date(editDueAt) : new Date();
    setEditDueAt(
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}`,
    );
    setDuePreset("custom");
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
      <PageEnter className="page task-detail-page">
        <motion.header
          className="task-header-bar"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <Link href="/app/work" className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="Back">
            <IconArrowLeft size={18} />
          </Link>
          <div className="task-header-main">
            <h1 className="trello-detail-title">{task.title}</h1>
            <p className="trello-detail-sub">
              in list <strong>{STATUS_LABELS[task.status]}</strong>
              {project ? (
                <>
                  {" "}on <Link href={`/app/board?project=${project.id}`}>{project.name}</Link>
                </>
              ) : null}{" "}
              <span className="mono">· {project?.key ?? "ID"}-{task.id.slice(0, 4).toUpperCase()}</span>
            </p>
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
                <Button variant="ghost" size="sm" onClick={openEdit}>
                  <IconEdit size={14} /> Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(true)}>
                  <IconTrash size={14} /> Delete
                </Button>
              </>
            ) : null}
          </div>
        </motion.header>

        <div className="task-detail-grid">
          <motion.main
            className="task-main"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
          >
            <section className="task-section">
              <h3 className="trello-section-head">Description</h3>
              <div className="task-description">
                {task.description ? (
                  <p>{task.description}</p>
                ) : (
                  <Textarea
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
                <Button variant="ghost" size="sm" onClick={openEdit}>
                  <IconEdit size={14} /> Edit description
                </Button>
              ) : null}
            </section>

            <section className="task-section">
              <h3 className="trello-section-head">Activity {comments.length > 0 ? <span className="faint">({comments.length})</span> : null}</h3>
              <div className="comments-list">
                {commentsQ.isLoading ? (
                  <div role="status" aria-label="Loading comments" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {[0, 1].map((i) => (
                      <div key={i} className="comment-item" aria-hidden>
                        <div className="comment-avatar">
                          <Skeleton className="size-6 shrink-0 rounded-full" />
                        </div>
                        <div className="comment-content" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <Skeleton className="h-3 w-28 rounded" />
                          <Skeleton className="h-3 w-full rounded" />
                          <Skeleton className="h-3 w-2/3 rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : comments.length === 0 ? (
                  <p className="empty-text">No comments yet. Be the first to comment!</p>
                ) : (
                  <AnimatePresence initial={false} mode="popLayout">
                    {comments.map((c) => (
                      <CommentItem
                        key={c.id}
                        comment={c}
                        authorName={nameById.get(c.authorId) ?? null}
                        nameLoading={membersQ.isLoading && !nameById.get(c.authorId)}
                        canDelete={canDeleteComment(c)}
                        isOwn={c.authorId === user?.id}
                        onDelete={() => void handleDeleteComment(c.id)}
                      />
                    ))}
                  </AnimatePresence>
                )}
                {canWrite ? (
                  <form
                    className="comment-form trello-comment-box"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleComment();
                    }}
                  >
                    <Textarea
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
                      <Button
                        type="submit"
                        disabled={!commentBody.trim() || postingComment}
                      >
                        <IconMessageSquare size={14} /> {postingComment ? "Posting…" : "Add comment"}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <p className="empty-text">View-only role — you can read but not post comments.</p>
                )}
              </div>
            </section>
          </motion.main>

          <motion.aside
            className="task-sidebar"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <SidebarCard>
              <h3 className="trello-section-head" style={{ fontSize: 14 }}>Details</h3>
              <Field>
                <FieldLabel htmlFor="task-status">Status</FieldLabel>
                <Select
                  value={task.status}
                  disabled={!canWrite}
                  onValueChange={(v) => { if (v) handleStatusChange(v); }}
                >
                  <SelectTrigger id="task-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="task-priority">Priority</FieldLabel>
                <Select
                  value={task.priority}
                  disabled={!canWrite}
                  onValueChange={(v) => { if (v) handlePriorityChange(v); }}
                >
                  <SelectTrigger id="task-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Assignee</FieldLabel>
                <span className="faint" style={{ fontSize: 13 }}>{assignee?.name ?? "Unassigned"}</span>
              </Field>
              <Field>
                <FieldLabel>Reporter</FieldLabel>
                <span className="faint" style={{ fontSize: 13 }}>{reporter?.name ?? "Unknown"}</span>
              </Field>
              {task.dueAt ? (
                <Field>
                  <FieldLabel>Due</FieldLabel>
                  <span className="faint" style={{ fontSize: 13 }}>
                    <IconClock size={12} /> {new Date(task.dueAt).toLocaleString()}
                  </span>
                  {task.status !== "done" && task.status !== "backlog" ? (
                    <FieldDescription>If the deadline passes first, this task moves back to Backlog automatically.</FieldDescription>
                  ) : null}
                </Field>
              ) : null}
              {canWrite ? (
                <Button variant="ghost" size="sm" onClick={openEdit} className="trello-side-btn" style={{ marginTop: 4 }}>
                  <IconEdit size={14} /> Edit all fields
                </Button>
              ) : null}
            </SidebarCard>
            <Link href="/app/work" className={cx(buttonVariants({ variant: "ghost" }), "trello-side-btn")}>
              Back to your work
            </Link>
            {canWrite ? (
              <Button variant="ghost" onClick={() => setShowDeleteConfirm(true)} className="trello-side-btn danger">
                <IconTrash size={14} /> Delete task
              </Button>
            ) : null}
          </motion.aside>
        </div>

        <Modal
          open={showEdit}
          onClose={() => setShowEdit(false)}
          title="Edit task"
          sub="Update any field. Changes are saved to the server."
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowEdit(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => void handleSaveEdit()} disabled={!editTitle.trim() || saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </>
          }
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="edit-title">Title</FieldLabel>
              <Input
                id="edit-title"
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={200}
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-description">Description</FieldLabel>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={4}
                placeholder="Add more detail…"
              />
            </Field>
                <div style={{ display: "flex", gap: 12 }}>
                  <Field className="flex-1">
                    <FieldLabel htmlFor="edit-status">Status</FieldLabel>
                    <Select
                      value={editStatus}
                      onValueChange={(v) => setEditStatus(v as Task["status"])}
                    >
                      <SelectTrigger id="edit-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field className="flex-1">
                    <FieldLabel htmlFor="edit-priority">Priority</FieldLabel>
                    <Select
                      value={editPriority}
                      onValueChange={(v) => setEditPriority(v as Task["priority"])}
                    >
                      <SelectTrigger id="edit-priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="edit-assignee">Assignee</FieldLabel>
                  <Select value={editAssigneeId || "unassigned"} onValueChange={(v) => setEditAssigneeId(!v || v === "unassigned" ? "" : v)}>
                    <SelectTrigger id="edit-assignee">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {(membersQ.data?.members ?? []).map((m) => (
                        <SelectItem key={m.userId} value={m.userId}>
                          {m.name ?? m.userId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Deadline</FieldLabel>
                  <div className="due-presets" role="group" aria-label="Deadline">
                    {[
                      { preset: "1", label: "1 day" },
                      { preset: "3", label: "3 days" },
                      { preset: "7", label: "7 days" },
                    ].map((o) => (
                      <Button
                        key={o.preset}
                        size="sm"
                        variant={duePreset === o.preset ? "default" : "secondary"}
                        onClick={() => applyDueInDays(Number(o.preset), o.preset as "1" | "3" | "7")}
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
                        variant={duePreset === "custom" ? "default" : "secondary"}
                        onClick={() => {
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
                      <Input
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
                      variant={duePreset === "none" ? "default" : "ghost"}
                      onClick={() => {
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
                  <DatePicker
                    value={
                      editDueAt && !Number.isNaN(Date.parse(editDueAt))
                        ? new Date(editDueAt)
                        : undefined
                    }
                    onSelect={applyDueDate}
                    placeholder="Pick a specific date…"
                  />
                  {editDueAt && !Number.isNaN(Date.parse(editDueAt)) ? (
                    isOverdue(new Date(editDueAt).toISOString(), editStatus) ? (
                      <FieldDescription style={{ color: "hsl(0 75% 45%)", fontWeight: 600 }}>
                        Overdue — if still open, the next sweep moves this task back to Backlog.
                      </FieldDescription>
                    ) : (
                      <FieldDescription>
                        Due {new Date(editDueAt).toLocaleString()}. Misses move back to Backlog automatically.
                      </FieldDescription>
                    )
                  ) : (
                    <FieldDescription>No deadline — the task never auto-moves.</FieldDescription>
                  )}
                </Field>
              </FieldGroup>
            </Modal>

        <Modal
          open={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          title="Delete task?"
          sub={`“${task.title}” will be moved to trash.`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
                <IconTrash size={14} /> {deleting ? "Deleting…" : "Delete task"}
              </Button>
            </>
          }
        >
          <p className="text-sm text-muted-foreground">
            This moves the task to trash.
          </p>
        </Modal>
      </PageEnter>
    </AppShell>
  );
}