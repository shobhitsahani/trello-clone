"use client";

/* Notification sheet — live notifications from GET /v1/notifications.
   Payload shape is event-specific; derive a title/href defensively. */

import { useRouter } from "next/navigation";
import { useTenant } from "./store";
import { IconCheck, IconFlowMark, IconX } from "./icons";
import { cx, timeAgo } from "../lib/utils";
import type { Notification } from "../lib/api";

function notifTitle(n: Notification): string {
  const t = String((n.payload as { title?: string })?.title ?? "");
  if (t) return t;
  return n.type.replace(/[._]/g, " ");
}

function notifMsg(n: Notification): string {
  const m = String((n.payload as { message?: string; body?: string })?.message ??
    (n.payload as { body?: string })?.body ?? "");
  return m;
}

function notifHref(n: Notification): string {
  const p = n.payload as { taskId?: string; projectId?: string; entityId?: string } | undefined;
  const id = p?.taskId ?? p?.entityId;
  return id ? `/app/tasks/${id}` : "/app/activity";
}

export function NotifSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { notifications, unread, markRead, markAllRead } = useTenant();

  if (!open) return null;

  return (
    <div className="sheet" role="dialog" aria-modal aria-label="Notifications">
      <div className="sheet-head">
        <span className="sheet-title">Notifications</span>
        {unread > 0 ? (
          <span className="badge" style={{ color: "var(--accent-hi)" }}>
            {unread} new
          </span>
        ) : null}
        <div className="row" style={{ marginLeft: "auto" }}>
          <button className="btn btn-ghost btn-xs" onClick={markAllRead}>
            <IconCheck size={12} /> Mark all read
          </button>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Close">
            <IconX size={14} />
          </button>
        </div>
      </div>
      <div className="sheet-body">
        <div className="notif-list">
          {notifications.length === 0 ? (
            <div className="empty" style={{ padding: "24px 16px" }}>
              <div className="empty-title">No notifications</div>
              <p className="empty-msg">You are all caught up.</p>
            </div>
          ) : null}
          {notifications.map((n) => (
            <button
              key={n.id}
              className={cx("notif-item", !n.readAt && "notif-unread")}
              style={{ textAlign: "left" }}
              onClick={() => {
                markRead(n.id);
                onClose();
                router.push(notifHref(n));
              }}
            >
              <span className="notif-ico">
                <IconFlowMark size={14} />
              </span>
              <span className="grow">
                <span className="notif-title" style={{ display: "block" }}>
                  {notifTitle(n)}
                </span>
                {notifMsg(n) ? (
                  <span className="notif-msg" style={{ display: "block" }}>
                    {notifMsg(n)}
                  </span>
                ) : null}
                <span className="notif-time" style={{ display: "block" }}>
                  {timeAgo(n.createdAt)} ago
                </span>
              </span>
              {!n.readAt ? <span className="notif-unread-dot" aria-label="Unread" /> : null}
            </button>
          ))}
        </div>
      </div>
      <div className="sheet-foot">
        Missed something while offline? Realtime catch-up replays from your last cursor — nothing is
        lost.
      </div>
    </div>
  );
}
