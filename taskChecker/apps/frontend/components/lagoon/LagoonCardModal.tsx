/* Lagoon card modal — joyful card details ported from treloo-joyful-design.
   Title, description, label + color, assignee, due date, checklist,
   comments thread, delete. Text fields save on Done; member/due/priority
   persist immediately; checklist + label overrides persist per-task. */

"use client";

import { useMemo, useState, type FormEvent } from "react";
import { api, type Comment, type Member, type PaginatedResponse, type Project, type Task } from "@/lib/api";
import { useSWR } from "@/lib/swr";
import { useToast } from "@/components/overlay";
import { cx } from "@/lib/utils";
import { IconTrash, IconX } from "@/components/icons";
import {
  LAGOON_TONES,
  defaultLabelForPriority,
  lagoonAvatarTone,
  lagoonInitials,
  loadLagoonMeta,
  saveLagoonChecklist,
  saveLagoonLabel,
  toYmd,
  type LagoonCheckItem,
  type LagoonTone,
} from "./lagoon-utils";

export interface LagoonCardModalProps {
  task: Task;
  project: Project | null;
  members: Member[];
  canWrite: boolean;
  onClose: () => void;
  /** Persist a backend patch (title/description/status/priority/assignee/due). */
  onPatch: (taskId: string, patch: Partial<Task>) => Promise<void>;
  onDelete: (task: Task) => void;
  onMetaChanged: () => void;
}

export function LagoonCardModal({
  task,
  project,
  members,
  canWrite,
  onClose,
  onPatch,
  onDelete,
  onMetaChanged,
}: LagoonCardModalProps) {
  const toast = useToast();
  const meta = useMemo(() => loadLagoonMeta(task.id), [task.id]);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [label, setLabel] = useState(
    meta.label !== undefined ? meta.label : (defaultLabelForPriority(task.priority) ?? ""),
  );
  const [tone, setTone] = useState<LagoonTone | undefined>(meta.tone);
  const [checklist, setChecklist] = useState<LagoonCheckItem[]>(meta.checklist);
  const [saving, setSaving] = useState(false);

  const commentsQ = useSWR<PaginatedResponse<Comment>>(
    `lagoon-comments-${task.id}`,
    () => api.comments.list(task.id, { limit: 50 }),
  );
  const comments = useMemo(
    () => [...(commentsQ.data?.data ?? [])].reverse(),
    [commentsQ.data],
  );
  const [commentText, setCommentText] = useState("");

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      if (m.name) map.set(m.userId, m.name);
      else if (m.email) map.set(m.userId, m.email);
    }
    return map;
  }, [members]);

  const persistChecklist = (next: LagoonCheckItem[]) => {
    setChecklist(next);
    saveLagoonChecklist(task.id, next);
    onMetaChanged();
  };

  const persistLabel = (nextLabel: string, nextTone: LagoonTone | undefined) => {
    setLabel(nextLabel);
    setTone(nextTone);
    saveLagoonLabel(task.id, nextLabel, nextTone);
    onMetaChanged();
  };

  const handleMember = async (userId: string | null) => {
    if (!canWrite) return;
    try {
      await onPatch(task.id, { assigneeId: userId });
    } catch (err) {
      toast({ title: "Assignee failed", msg: err instanceof Error ? err.message : "Try again." });
    }
  };

  const handleDue = async (ymd: string) => {
    if (!canWrite) return;
    try {
      if (!ymd) {
        await onPatch(task.id, { dueAt: null });
        return;
      }
      const d = new Date(`${ymd}T12:00:00`);
      if (Number.isNaN(d.getTime())) return;
      await onPatch(task.id, { dueAt: d.toISOString() });
    } catch (err) {
      toast({ title: "Due date failed", msg: err instanceof Error ? err.message : "Try again." });
    }
  };

  const handlePriority = async (priority: Task["priority"]) => {
    if (!canWrite) return;
    try {
      await onPatch(task.id, { priority });
    } catch (err) {
      toast({ title: "Priority failed", msg: err instanceof Error ? err.message : "Try again." });
    }
  };

  const handleAddCheck = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("checkItem") as HTMLInputElement | null;
    const text = input?.value.trim() ?? "";
    if (!text) return;
    persistChecklist([...checklist, { id: Date.now(), text, done: false }]);
    if (input) input.value = "";
  };

  const handleAddComment = async (e: FormEvent) => {
    e.preventDefault();
    const text = commentText.trim();
    if (!text) return;
    setCommentText("");
    try {
      await api.comments.create(task.id, text);
      await commentsQ.mutate();
    } catch (err) {
      setCommentText(text);
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

  /** Done persists the text fields (title/description/label), then closes. */
  const handleDone = async () => {
    if (!canWrite) {
      onClose();
      return;
    }
    const patch: Partial<Task> = {};
    const cleanTitle = title.trim();
    if (cleanTitle && cleanTitle !== task.title) patch.title = cleanTitle;
    if (description !== (task.description ?? "")) patch.description = description;
    // Label text persists locally even without backend changes.
    saveLagoonLabel(task.id, label.trim(), tone);
    onMetaChanged();
    if (Object.keys(patch).length > 0) {
      setSaving(true);
      try {
        await onPatch(task.id, patch);
      } catch (err) {
        toast({ title: "Save failed", msg: err instanceof Error ? err.message : "Try again." });
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }
    onClose();
  };

  const assignee = members.find((m) => m.userId === task.assigneeId) ?? null;

  return (
    <div className="lagoon-modal-veil" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Card details"
        className="lagoon-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <input
            aria-label="Card title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="lagoon-title-input"
            disabled={!canWrite}
          />
          <button aria-label="Close" className="lagoon-icon-btn" onClick={onClose} style={{ flex: "none" }}>
            <IconX size={16} />
          </button>
        </div>
        {project ? (
          <p style={{ marginTop: 4, fontSize: 11, color: "var(--lagoon-muted-fg)" }}>
            {project.key} · {project.name}
          </p>
        ) : null}

        <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
          <div>
            <p className="lagoon-field-label">Description</p>
            <textarea
              aria-label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="lagoon-input"
              style={{ minHeight: 80, resize: "vertical" }}
              placeholder="Add a more detailed description…"
              disabled={!canWrite}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <p className="lagoon-field-label">Label</p>
              <input
                aria-label="Label"
                value={label}
                onChange={(e) => persistLabel(e.target.value, tone)}
                className="lagoon-input"
                placeholder="Label name"
                disabled={!canWrite}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {LAGOON_TONES.map((t) => (
                  <button
                    key={t}
                    aria-label={`Set ${t} label color`}
                    onClick={() => persistLabel(label, tone === t ? undefined : t)}
                    disabled={!canWrite}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 9999,
                      background: `var(--lagoon-${t})`,
                      boxShadow:
                        tone === t
                          ? "0 0 0 2px var(--lagoon-card), 0 0 0 4px var(--lagoon-ink)"
                          : "none",
                    }}
                  />
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <p className="lagoon-field-label">Priority</p>
                <select
                  aria-label="Priority"
                  value={task.priority}
                  onChange={(e) => void handlePriority(e.target.value as Task["priority"])}
                  className="lagoon-input"
                  disabled={!canWrite}
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                  <option value="none">None</option>
                </select>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <p className="lagoon-field-label">Member</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    aria-label="Unassigned"
                    title="Unassigned"
                    onClick={() => void handleMember(null)}
                    disabled={!canWrite}
                    className={cx("lagoon-member-btn", task.assigneeId === null && "is-on")}
                    style={{ background: "var(--lagoon-muted-fg)", color: "#fff" }}
                  >
                    –
                  </button>
                  {members.slice(0, 8).map((m) => {
                    const display = m.name ?? m.email ?? m.userId.slice(0, 4);
                    return (
                      <button
                        key={m.userId}
                        title={display}
                        onClick={() => void handleMember(m.userId)}
                        disabled={!canWrite}
                        className={cx("lagoon-member-btn", task.assigneeId === m.userId && "is-on")}
                        style={{ background: lagoonAvatarTone(m.userId) }}
                      >
                        {lagoonInitials(display)}
                      </button>
                    );
                  })}
                </div>
                {assignee ? (
                  <p style={{ marginTop: 6, fontSize: 11, color: "var(--lagoon-muted-fg)" }}>
                    {assignee.name ?? assignee.email}
                  </p>
                ) : null}
              </div>
              <div>
                <p className="lagoon-field-label">Due date</p>
                <input
                  aria-label="Due date"
                  type="date"
                  value={toYmd(task.dueAt) ?? ""}
                  onChange={(e) => void handleDue(e.target.value)}
                  className="lagoon-input"
                  disabled={!canWrite}
                />
              </div>
            </div>
          </div>

          <div>
            <p className="lagoon-field-label">
              Checklist
              {checklist.length > 0 ? ` · ${checklist.filter((c) => c.done).length}/${checklist.length}` : ""}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {checklist.map((item) => (
                <label key={item.id} className={cx("lagoon-check-row", item.done && "is-done")}>
                  <input
                    type="checkbox"
                    checked={item.done}
                    disabled={!canWrite}
                    onChange={() =>
                      persistChecklist(
                        checklist.map((c) => (c.id === item.id ? { ...c, done: !c.done } : c)),
                      )
                    }
                  />
                  <span>{item.text}</span>
                </label>
              ))}
            </div>
            {canWrite ? (
              <form onSubmit={handleAddCheck} style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <input
                  name="checkItem"
                  aria-label="New checklist item"
                  className="lagoon-input"
                  placeholder="Add an item"
                />
                <button type="submit" className="lagoon-btn-secondary">Add</button>
              </form>
            ) : null}
          </div>

          <div>
            <p className="lagoon-field-label">Comments{comments.length > 0 ? ` · ${comments.length}` : ""}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {commentsQ.isLoading ? (
                <p style={{ fontSize: 12, color: "var(--lagoon-muted-fg)" }}>Loading comments…</p>
              ) : comments.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--lagoon-muted-fg)" }}>No comments yet.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="lagoon-comment">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>
                        {names.get(c.authorId) ?? "Someone"}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--lagoon-muted-fg)" }}>
                        {new Date(c.createdAt).toLocaleString()}
                      </span>
                      {canWrite ? (
                        <button
                          aria-label="Delete comment"
                          onClick={() => void handleDeleteComment(c.id)}
                          style={{ marginLeft: "auto", color: "var(--lagoon-muted-fg)" }}
                        >
                          <IconTrash size={12} />
                        </button>
                      ) : null}
                    </div>
                    <p style={{ whiteSpace: "pre-wrap" }}>{c.body}</p>
                  </div>
                ))
              )}
            </div>
            {canWrite ? (
              <form onSubmit={handleAddComment} style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <input
                  aria-label="Write a comment"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className="lagoon-input"
                  placeholder="Write a comment…"
                />
                <button type="submit" className="lagoon-btn-secondary" disabled={!commentText.trim()}>
                  Send
                </button>
              </form>
            ) : null}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--lagoon-border)", paddingTop: 12 }}>
            {canWrite ? (
              <button className="lagoon-btn-danger" onClick={() => onDelete(task)}>
                <IconTrash size={14} /> Delete card
              </button>
            ) : <span />}
            <button className="lagoon-btn" onClick={() => void handleDone()} disabled={saving}>
              {saving ? "Saving…" : "Done"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
