"use client";

/* Notification sheet — live notifications from GET /v1/notifications.
   shadcn Sheet + Badge + Button + Empty. Payload shape is event-specific;
   derive a title/href defensively. */

import { useRouter } from "next/navigation";
import { useTenant } from "./store";
import { IconCheck, IconFlowMark, IconMessageSquare, IconUser } from "./icons";
import { timeAgo } from "../lib/utils";
import type { Notification } from "../lib/api";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Empty, EmptyDescription, EmptyTitle } from "./ui/empty";
import { Separator } from "./ui/separator";
import { cn } from "@/lib/utils";

function notifTitle(n: Notification): string {
  const t = String((n.payload as { title?: string })?.title ?? "");
  if (t) return t;
  if (n.type === "task.assigned") return "Assigned you a task";
  if (n.type === "chat.mentioned") return "Mentioned you in chat";
  return n.type.replace(/[._]/g, " ");
}

function notifMsg(n: Notification): string {
  const p = n.payload as { message?: string; body?: string; actorName?: string; assigneeId?: string; taskTitle?: string } | undefined;
  const m = String(p?.message ?? p?.body ?? p?.taskTitle ?? "");
  if (n.type === "task.assigned" && p?.actorName) return `${p.actorName} → ${m}`;
  if (n.type === "chat.mentioned" && p?.actorName) return `${p.actorName}: ${m}`;
  if (n.type === "task.created" && p?.actorName) return `${p.actorName} created "${m}"`;
  return m;
}

function notifHref(n: Notification): string {
  const p = n.payload as { taskId?: string; projectId?: string; entityId?: string; entityType?: string; chatMessageId?: string } | undefined;
  if (n.type === "chat.mentioned" || p?.entityType === "chat") return "/app/board";
  const id = p?.taskId ?? p?.entityId;
  if (id) {
    // entityType task/comment → task page; chat → board already handled
    if (p?.entityType === "chat") return "/app/board";
    return `/app/tasks/${id}`;
  }
  return "/app/activity";
}

function NotifIcon({ type }: { type: string }) {
  if (type === "task.assigned") return <IconUser size={14} />;
  if (type === "chat.mentioned") return <IconMessageSquare size={14} />;
  if (type === "task.created") return <IconCheck size={14} />;
  return <IconFlowMark size={14} />;
}

export function NotifSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { notifications, unread, markRead, markAllRead } = useTenant();

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent className="gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="flex-row items-center gap-2 border-b p-4 text-left">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <SheetTitle>Notifications</SheetTitle>
            {unread > 0 ? (
              <Badge variant="default">{unread} new</Badge>
            ) : null}
          </div>
          <Button variant="ghost" size="xs" onClick={markAllRead}>
            <IconCheck size={12} /> Mark all read
          </Button>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-2">
          {notifications.length === 0 ? (
            <Empty className="py-10">
              <EmptyTitle>No notifications</EmptyTitle>
              <EmptyDescription>You are all caught up.</EmptyDescription>
            </Empty>
          ) : (
            <div className="flex flex-col">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    markRead(n.id);
                    onClose();
                    router.push(notifHref(n));
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors",
                    "hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    !n.readAt && "bg-primary/[0.04]"
                  )}
                >
                  <span className="mt-0.5 grid size-7 flex-none place-items-center rounded-full bg-muted text-muted-foreground">
                    <NotifIcon type={n.type} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-foreground">
                      {notifTitle(n)}
                    </span>
                    {notifMsg(n) ? (
                      <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
                        {notifMsg(n)}
                      </span>
                    ) : null}
                    <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                      {timeAgo(n.createdAt)} ago
                    </span>
                  </span>
                  {!n.readAt ? (
                    <span className="mt-1.5 size-2 flex-none rounded-full bg-primary" aria-label="Unread" />
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>

        <Separator />
        <SheetFooter className="mt-0 block border-0 bg-transparent p-4">
          <SheetDescription>
            Missed something while offline? Realtime catch-up replays from your last cursor — nothing is
            lost.
          </SheetDescription>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
