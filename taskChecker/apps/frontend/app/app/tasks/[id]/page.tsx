"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTenant } from "@/components/store";
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
import { useAuth } from "@/lib/auth";
import { useSWR } from "@/lib/swr";
import { cx, timeAgo, hueFrom } from "@/lib/utils";

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
const PRIORITY_COLORS: Record<string, string> = {
  critical: "hsl(0 75% 55%)",
  high: "hsl(35 90% 50%)",
  medium: "hsl(210 80% 50%)",
  low: "var(--muted)",
  none: "var(--muted)",
};

function SidebarCard({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <div className={cx("sidebar-card", className)}>{children}</div>;
}

function CommentItem({
  comment,
  authorName,
  onDelete,
  canDelete,
}: {
  comment: Comment;
  authorName: string | null;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const tint = hueFrom(comment.authorId);
  return (
    <div className="comment-item">
      <div className="comment-avatar">
        <span style={{ background: `hsl(${tint} 60% 50%)` }}>{(authorName ?? "?").slice(0, 1)}</span>
      </div>
      <div className="comment-content">
        <div className="comment-header">
          <span className="comment-author">{authorName ?? "Unknown"}</span>
          <span className="comment-time">{timeAgo(comment.createdAt)}</span>
        </div>
        <p className="comment-body">{comment.body}</p>
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
  const [showEdit, setShowEdit] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<Task["status"]>("backlog");
  const [editPriority, setEditPriority] = useState<Task["priority"]>("none");
  const [editAssigneeId, setEditAssigneeId] = useState("");
  const [editDueAt, setEditDueAt] = useState("");
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
    if (!taskId) return;
    try {
      await api.tasks.update(taskId, data);
      await taskQ.mutate();
      toast({ title: okMsg, msg: "Saved." });
    } catch (err) {
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
    setShowEdit(true);
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
    if (!commentBody.trim() || !taskId) return;
    try {
      await api.comments.create(taskId, commentBody.trim());
      setCommentBody("");
      await commentsQ.mutate();
      toast({ title: "Comment added", msg: "Posted." });
    } catch (err) {
      toast({ title: "Comment failed", msg: err instanceof Error ? err.message : "Try again." });
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await api.comments.delete(commentId);
      await commentsQ.mutate();
    } catch (err) {
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
            </div>
          </div>
          <div className="task-header-actions">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => toast({ title: "Edit task", msg: "Use the fields below to edit this task." })}
            >
              <IconEdit size={14} /> Edit
            </button>
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
                    onBlur={(e) => void patch({ description: e.target.value }, "Description updated")}
                  />
                )}
              </div>
            </section>

            <section className="task-section">
              <h3>Comments</h3>
              <div className="comments-list">
                {comments.map((c) => (
                  <CommentItem
                    key={c.id}
                    comment={c}
                    authorName={nameById.get(c.authorId) ?? null}
                    canDelete={canDeleteComment(c)}
                    onDelete={() => void handleDeleteComment(c.id)}
                  />
                ))}
                {comments.length === 0 ? (
                  <p className="empty-text">No comments yet. Be the first to comment!</p>
                ) : null}
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
                    placeholder="Write a comment…"
                    rows={3}
                  />
                  <div className="comment-form-actions">
                    <button type="submit" className="btn btn-primary" disabled={!commentBody.trim()}>
                      <IconMessageSquare size={14} /> Add comment
                    </button>
                  </div>
                </form>
              </div>
            </section>
          </main>

          <aside className="task-sidebar">
            <Link href="/app/work" className="btn btn-primary">
              Back to your work
            </Link>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}