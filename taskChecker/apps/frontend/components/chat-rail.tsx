"use client";

/* Realtime team chat rail — tags, images, emoji reactions, sender local-time.
   Fluid by design: layout-animated bubbles, optimistic sends, in-place
   reaction patching (no list revalidate), sticky auto-scroll, typing
   presence, day dividers, image lightbox, drag-drop/paste uploads. */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { useTenant } from "./store";
import { useToast } from "./overlay";
import { Textarea } from "./ui/textarea";
import { Avatar as ShadcnAvatar, AvatarFallback } from "./ui/avatar";
import { Skeleton } from "./ui/skeleton";
import {
  api,
  getCurrentTenantId,
  type ChatAttachment,
  type ChatMessage,
  type ChatReactionGroup,
  type PaginatedResponse,
} from "../lib/api";
import { useSWR } from "../lib/swr";
import { useRealtime } from "../lib/realtime";
import { cx, formatChatTime, hueFrom, initials } from "../lib/utils";
import { AnimatePresence, motion } from "@/components/motion";
import {
  IconChecks,
  IconChevronRight,
  IconMessageSquare,
  IconMic,
  IconPaperclip,
  IconPlus,
  IconSend,
  IconSmile,
  IconTrash,
  IconX,
} from "./icons";

/* ---------------- constants ---------------- */

const CHAT_MIN_W = 240;
const CHAT_MAX_W = 600;
const CHAT_DEFAULT_W = 340;
const CHAT_LS_KEY = "tf.chat.w.v1";
const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "🙏", "🔥", "👀"];
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const clampChatW = (n: number) => Math.min(CHAT_MAX_W, Math.max(CHAT_MIN_W, Math.round(n)));

function loadChatWidth(): number {
  if (typeof window === "undefined") return CHAT_DEFAULT_W;
  try {
    const raw = window.localStorage.getItem(CHAT_LS_KEY);
    if (raw == null) return CHAT_DEFAULT_W;
    const n = Number(JSON.parse(raw));
    if (Number.isFinite(n)) return clampChatW(n);
  } catch {
    // corrupted — default
  }
  return CHAT_DEFAULT_W;
}

/* ---------------- @mention helpers ---------------- */

export type ChatMember = { userId: string; name: string | null; email: string | null };

export function getMentionHandle(m: ChatMember): string {
  if (m.name) return m.name.replace(/\s+/g, "");
  if (m.email) return (m.email.split("@")[0] ?? "").replace(/[^a-zA-Z0-9_]/g, "");
  return m.userId.slice(0, 8);
}
export function getDisplayName(m: ChatMember): string {
  return m.name ?? m.email ?? `User ${m.userId.slice(0, 4)}`;
}
function detectMention(value: string, cursor: number): { at: number; query: string } | null {
  const before = value.slice(0, cursor);
  const atIdx = before.lastIndexOf("@");
  if (atIdx === -1) return null;
  if (atIdx > 0 && !/\s/.test(before[atIdx - 1] ?? "")) return null;
  const afterAt = before.slice(atIdx);
  if (!/^@[^\s@]*$/.test(afterAt)) return null;
  const query = afterAt.slice(1);
  if (query.length > 30) return null;
  return { at: atIdx, query };
}

/** Resolve @tokens in text to member userIds (for the mentions[] payload). */
function resolveMentionIds(text: string, members: ChatMember[]): string[] {
  const tokens = [...text.matchAll(/@([A-Za-z0-9_]+)/g)].map((m) => (m[1] ?? "").toLowerCase());
  if (tokens.length === 0) return [];
  const out = new Set<string>();
  const byHandle = new Map(members.map((m) => [getMentionHandle(m).toLowerCase(), m.userId]));
  const byCompact = new Map(
    members.map((m) => [(m.name ?? "").toLowerCase().replace(/\s+/g, ""), m.userId]),
  );
  const lower = text.toLowerCase();
  for (const t of tokens) {
    const hit = byHandle.get(t) ?? byCompact.get(t);
    if (hit) out.add(hit);
  }
  for (const m of members) {
    const n = (m.name ?? "").toLowerCase();
    if (n && lower.includes(`@${n}`)) out.add(m.userId);
  }
  return [...out].slice(0, 20);
}

function renderMentions(text: string) {
  const parts = text.split(/(@[A-Za-z0-9_]+)/g);
  return parts.map((part, i) =>
    /^@[A-Za-z0-9_]+$/.test(part) ? (
      <span key={i} className="st-mention-inline" data-mention={part}>
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

/** Day divider key in viewer-local calendar. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayLabelFor(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function UserAvatar({
  name,
  size = "sm",
  tint = 220,
  loading,
}: {
  name: string;
  size?: "sm" | "default" | "lg";
  tint?: number;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Skeleton
        aria-hidden
        className={
          size === "sm"
            ? "size-6 shrink-0 rounded-full"
            : size === "lg"
              ? "size-10 shrink-0 rounded-full"
              : "size-8 shrink-0 rounded-full"
        }
      />
    );
  }
  return (
    <ShadcnAvatar size={size}>
      <AvatarFallback
        style={{
          background: `hsl(${tint} 45% 20%)`,
          color: `hsl(${tint} 80% 78%)`,
          borderColor: `hsl(${tint} 40% 30%)`,
        }}
      >
        {initials(name)}
      </AvatarFallback>
    </ShadcnAvatar>
  );
}

/* ---------------- main rail ---------------- */

export function ChatRail({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const orgId = getCurrentTenantId();
  const { org } = useTenant();
  const { user } = useAuth();
  const toast = useToast();
  const [width, setWidth] = useState<number>(loadChatWidth);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const [lightbox, setLightbox] = useState<ChatAttachment | null>(null);
  const [typing, setTyping] = useState<Map<string, { name: string; at: number }>>(new Map());

  const chatQ = useSWR<PaginatedResponse<ChatMessage>>(
    orgId ? `chat-messages-${orgId}` : null,
    () => api.chat.list({ limit: 60 }),
  );
  const membersQ = useSWR<{ members: Array<{ userId: string; name: string | null; email: string | null }> }>(
    orgId ? `ctx-members-${orgId}` : null,
    () => api.orgs.listMembers(orgId!),
  );

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of membersQ.data?.members ?? []) {
      if (m.name) map.set(m.userId, m.name);
      else if (m.email) map.set(m.userId, m.email);
    }
    return map;
  }, [membersQ.data]);

  const items = useMemo(() => [...(chatQ.data?.data ?? [])].reverse(), [chatQ.data]);

  /* Day-divider + compact-group flags precomputed (no mutation during render).
     A message is compact when it follows the same author within 5 minutes —
     avatar/name collapse like modern chat apps. */
  const itemsWithDay = useMemo(
    () =>
      items.map((m, i) => {
        const prev = i > 0 ? items[i - 1] : undefined;
        const sameAuthor = !!prev && prev.authorId === m.authorId;
        const gap =
          prev && sameAuthor
            ? Math.abs(new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime())
            : Number.POSITIVE_INFINITY;
        return {
          m,
          showDay: i === 0 || dayKey(m.createdAt) !== dayKey(items[i - 1]?.createdAt ?? ""),
          compact: sameAuthor && gap < 5 * 60 * 1000,
        };
      }),
    [items],
  );

  /* Realtime patching — no full revalidate on every keystroke elsewhere. */
  const mutateRef = useRef(chatQ.mutate);
  useEffect(() => {
    mutateRef.current = chatQ.mutate;
  });
  const userIdRef = useRef(user?.id);
  useEffect(() => {
    userIdRef.current = user?.id;
  });

  const patchReactions = useCallback((messageId: string, reactions: ChatReactionGroup[]) => {
    void mutateRef.current(
      (current) => {
        if (!current) return { data: [], nextCursor: null, hasMore: false };
        return {
          ...current,
          data: current.data.map((m) => (m.id === messageId ? { ...m, reactions } : m)),
        };
      },
      { revalidate: false },
    );
  }, []);

  const realtimeOpts = useMemo(
    () => ({
      onChat: (msg: { type: string; entityId?: string; meta?: unknown; [key: string]: unknown }) => {
        if (msg.type === "chat.updated") {
          const meta = msg.meta as { messageId?: string; reactions?: ChatReactionGroup[] } | undefined;
          if (meta?.messageId && Array.isArray(meta.reactions)) {
            patchReactions(meta.messageId, meta.reactions);
            return;
          }
        }
        void mutateRef.current();
      },
      onChatUpdated: (msg: { meta?: unknown; [key: string]: unknown }) => {
        const meta = msg.meta as { messageId?: string; reactions?: ChatReactionGroup[] } | undefined;
        if (meta?.messageId && Array.isArray(meta.reactions)) patchReactions(meta.messageId, meta.reactions);
      },
      onChatTyping: (msg: { meta?: unknown; [key: string]: unknown }) => {
        const meta = msg.meta as { authorId?: string; displayName?: string | null } | undefined;
        const aid = meta?.authorId;
        if (!aid || aid === userIdRef.current) return;
        const name = meta?.displayName || names.get(aid)?.split(" ")[0] || "Someone";
        setTyping((prev) => {
          const next = new Map(prev);
          next.set(aid, { name, at: Date.now() });
          return next;
        });
      },
    }),
    [patchReactions, names],
  );
  const { isConnected } = useRealtime(realtimeOpts);

  /* Expire typing indicators after 3.5s. */
  useEffect(() => {
    if (typing.size === 0) return;
    const id = setInterval(() => {
      const now = Date.now();
      setTyping((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [k, v] of prev) {
          if (now - v.at > 3500) {
            next.delete(k);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [typing.size]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !open) return;
    if (stickRef.current) el.scrollTop = el.scrollHeight;
  }, [items.length, open, typing.size]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      stickRef.current = true;
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, []);

  const handleSend = useCallback(
    async (body: string, attachments: ChatAttachment[]) => {
      if (!user) {
        toast({ title: "Not signed in", msg: "Sign in to send messages.", kind: "err" });
        throw new Error("Not signed in");
      }
      const text = body.trim();
      if (!text && attachments.length === 0) return;
      const members = membersQ.data?.members ?? [];
      const mentionIds = resolveMentionIds(text, members).filter((id) => id !== user.id);
      const optimistic: ChatMessage = {
        id: `local-${Date.now()}`,
        authorId: user.id,
        body: text,
        attachments,
        mentions: mentionIds,
        reactions: [],
        createdAt: new Date().toISOString(),
      };
      await chatQ.mutate(
        (current) => ({
          data: [optimistic, ...(current?.data ?? [])],
          nextCursor: current?.nextCursor ?? null,
          hasMore: current?.hasMore ?? false,
        }),
        { revalidate: false },
      );
      stickRef.current = true;
      try {
        await api.chat.send({ body: text, attachments, mentions: mentionIds });
        await chatQ.mutate();
      } catch (err) {
        await chatQ.mutate(
          (current) =>
            current
              ? { ...current, data: current.data.filter((m) => m.id !== optimistic.id) }
              : { data: [], nextCursor: null, hasMore: false },
          { revalidate: false },
        );
        toast({ title: "Send failed", msg: err instanceof Error ? err.message : "Try again.", kind: "err" });
        throw err;
      }
    },
    [chatQ, toast, user, membersQ.data],
  );

  const handleReact = useCallback(
    async (m: ChatMessage, emoji: string) => {
      const me = user?.id;
      if (!me) return;
      const current = m.reactions ?? [];
      const mine = current.find((g) => g.emoji === emoji)?.reactedByMe;
      // Optimistic toggle.
      const next: ChatReactionGroup[] = (() => {
        const map = new Map(current.map((g) => [g.emoji, { ...g, userIds: [...g.userIds] }]));
        const g = map.get(emoji);
        if (mine) {
          if (g) {
            g.userIds = g.userIds.filter((u) => u !== me);
            g.count = g.userIds.length;
            g.reactedByMe = false;
            if (g.count <= 0) map.delete(emoji);
            else map.set(emoji, g);
          }
        } else if (g) {
          if (!g.userIds.includes(me)) g.userIds.push(me);
          g.count = g.userIds.length;
          g.reactedByMe = true;
          map.set(emoji, g);
        } else {
          map.set(emoji, { emoji, count: 1, userIds: [me], reactedByMe: true });
        }
        return [...map.values()].sort((a, b) => b.count - a.count);
      })();
      patchReactions(m.id, next);
      try {
        const res = mine ? await api.chat.unreact(m.id, emoji) : await api.chat.react(m.id, emoji);
        patchReactions(m.id, res.reactions ?? next);
      } catch {
        patchReactions(m.id, current);
      }
    },
    [patchReactions, user?.id],
  );

  const handleDelete = useCallback(
    async (m: ChatMessage) => {
      const prev = chatQ.data;
      await chatQ.mutate(
        (current) =>
          current
            ? { ...current, data: current.data.filter((x) => x.id !== m.id) }
            : { data: [], nextCursor: null, hasMore: false },
        { revalidate: false },
      );
      try {
        await api.chat.remove(m.id);
        await chatQ.mutate();
      } catch (err) {
        if (prev) await chatQ.mutate(prev, { revalidate: false });
        toast({ title: "Delete failed", msg: err instanceof Error ? err.message : "Try again.", kind: "err" });
      }
    },
    [chatQ, toast],
  );

  /* Persist width. */
  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_LS_KEY, JSON.stringify(width));
    } catch {
      // storage unavailable
    }
  }, [width]);

  useEffect(() => {
    if (!dragging) return;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    const onMove = (e: PointerEvent) => {
      const s = dragRef.current;
      if (!s) return;
      setWidth(clampChatW(s.startW + (s.startX - e.clientX)));
    };
    const onUp = () => {
      dragRef.current = null;
      setDragging(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging]);

  const onResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startW: width };
      setDragging(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // window listeners still track
      }
    },
    [width],
  );

  const onResizeKey = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setWidth((w) => clampChatW(w + 16));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setWidth((w) => clampChatW(w - 16));
    } else if (e.key === "Home") {
      e.preventDefault();
      setWidth(CHAT_DEFAULT_W);
    }
  }, []);

  const soon = useCallback(
    (what: string) => toast({ title: `${what} coming soon`, msg: "Team calls aren't available yet." }),
    [toast],
  );

  if (!open) {
    return (
      <motion.button
        className="st-chat-expand"
        onClick={onToggle}
        title="Expand chat"
        aria-label="Expand chat"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.97 }}
      >
        <IconMessageSquare size={16} />
        <span>Chat</span>
        <span className="pulse-dot" style={{ width: 6, height: 6 }} />
      </motion.button>
    );
  }

  const typingNames = [...typing.values()].map((t) => t.name);

  const teamName = org?.name ? `${org.name} team` : "Team chat";
  const memberList = membersQ.data?.members ?? [];
  const onlineCount = isConnected ? memberList.length : 0;

  return (
    <motion.aside
      className="st-chat st-chat-fluid st-chat-7"
      aria-label="Team chat"
      style={{ width }}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className={cx("st-chat-resize", dragging && "is-dragging")}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat panel"
        aria-valuemin={CHAT_MIN_W}
        aria-valuemax={CHAT_MAX_W}
        aria-valuenow={Math.round(width)}
        tabIndex={0}
        title="Drag to resize chat (double-click to reset)"
        onPointerDown={onResizeStart}
        onDoubleClick={() => setWidth(CHAT_DEFAULT_W)}
        onKeyDown={onResizeKey}
      />
      <div
        className="st-chat-scroll"
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        <div className="st7-head">
          <span className="st7-team-avatar" aria-hidden>
            //
          </span>
          <span className="st7-head-text">
            <span className="st7-team-name">{teamName}</span>
            <span className="st7-team-sub">
              {memberList.length > 0 ? `${memberList.length} member${memberList.length === 1 ? "" : "s"}` : "Team"}
              {isConnected ? (
                <>
                  {", "}
                  <span className="st7-online">{onlineCount} online</span>
                </>
              ) : (
                " · offline"
              )}
            </span>
          </span>
          <span className="st7-head-actions">
            <button className="st-col-add" onClick={onToggle} title="Collapse chat" aria-label="Collapse chat">
              <IconChevronRight size={16} />
            </button>
          </span>
        </div>
        {memberList.length > 0 ? (
          <div className="st7-online-strip">
            <span className="st7-online-label">Online now</span>
            <span className="st7-avatar-stack" aria-label={`${onlineCount} online`}>
              {memberList.slice(0, 7).map((m) => (
                <span
                  key={m.userId}
                  className="st7-stack-avatar"
                  title={getDisplayName(m)}
                  style={{ background: `hsl(${hueFrom(m.userId)} 55% 88%)`, color: `hsl(${hueFrom(m.userId)} 45% 32%)` }}
                >
                  {initials(getDisplayName(m))}
                  <i className="st7-presence" />
                </span>
              ))}
              {memberList.length > 7 ? (
                <span className="st7-stack-avatar st7-stack-more">+{memberList.length - 7}</span>
              ) : null}
            </span>
          </div>
        ) : null}
        <div className="st-chat-list">
          {chatQ.isLoading ? (
            <div role="status" aria-label="Loading messages" className="st-chat-skeletons">
              {[0, 1, 2].map((i) => (
                <div key={i} className="st-msg" aria-hidden>
                  <Skeleton className="size-6 shrink-0 rounded-full" />
                  <div className="st-msg-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <Skeleton className="h-2.5 w-24 rounded" />
                    <Skeleton className="h-9 w-full rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="st-empty">
              No messages yet — say hello, tag someone with @, or drop an image.
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {itemsWithDay.map(({ m, showDay, compact }) => {
                const name =
                  names.get(m.authorId) ?? (m.authorId === user?.id ? (user?.name ?? "You") : "Someone");
                const own = m.authorId === user?.id;
                const when = formatChatTime(m.createdAt);
                const avatarLoading =
                  membersQ.isLoading && !names.get(m.authorId) && m.authorId !== user?.id;
                return (
                  <div key={m.id}>
                    {showDay ? (
                      <div className="st-day-divider" aria-label={dayLabelFor(m.createdAt)}>
                        <span>{dayLabelFor(m.createdAt)}</span>
                      </div>
                    ) : null}
                    <ChatBubble
                      message={m}
                      who={name.split(" ")[0] || "Someone"}
                      fullName={name}
                      compact={compact && !showDay}
                      isOwn={own}
                      time={when.relative}
                      absolute={when.absolute}
                      dateTime={m.createdAt}
                      timeTitle={when.title || undefined}
                      tint={hueFrom(m.authorId)}
                      brand={own}
                      avatarLoading={avatarLoading}
                      onReact={handleReact}
                      onDelete={own ? handleDelete : undefined}
                      onImage={setLightbox}
                      currentUserId={user?.id}
                    />
                  </div>
                );
              })}
            </AnimatePresence>
          )}
          <AnimatePresence>
            {typingNames.length > 0 ? (
              <motion.div
                key="typing"
                className="st-typing"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
              >
                <span className="st-typing-dots" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  {typingNames.slice(0, 2).join(", ")}
                  {typingNames.length > 2 ? ` +${typingNames.length - 2}` : ""} typing…
                </span>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
      <div className="st-chat-foot">
        <ChatInput
          onSend={handleSend}
          members={membersQ.data?.members ?? []}
          displayName={user?.name ?? "Someone"}
          onTypingScroll={scrollToBottom}
          onSoon={soon}
        />
      </div>
      <AnimatePresence>
        {lightbox ? (
          <motion.div
            key="lightbox"
            className="st-lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            role="dialog"
            aria-label={`Image preview: ${lightbox.name}`}
          >
            <motion.img
              src={lightbox.url}
              alt={lightbox.name}
              initial={{ scale: 0.94, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
            />
            <span className="st-lightbox-name">{lightbox.name}</span>
            <button className="st-lightbox-close" onClick={() => setLightbox(null)} aria-label="Close preview">
              ✕
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.aside>
  );
}

/* ---------------- bubble ---------------- */

function ChatBubble({
  message: m,
  who,
  fullName,
  compact,
  isOwn,
  time,
  absolute,
  dateTime,
  timeTitle,
  tint,
  brand,
  avatarLoading,
  onReact,
  onDelete,
  onImage,
  currentUserId,
}: {
  message: ChatMessage;
  who: string;
  fullName: string;
  compact?: boolean;
  isOwn?: boolean;
  time: string;
  absolute: string;
  dateTime?: string;
  timeTitle?: string;
  tint: number;
  brand?: boolean;
  avatarLoading?: boolean;
  onReact: (m: ChatMessage, emoji: string) => void;
  onDelete?: (m: ChatMessage) => void;
  onImage: (a: ChatAttachment) => void;
  currentUserId?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const images = m.attachments ?? [];
  const reactions = m.reactions ?? [];
  const mentionedMe = (m.mentions ?? []).includes(currentUserId ?? "__none__");
  const showToolbar = hover || pickerOpen;

  return (
    <motion.div
      className={cx("st-msg", compact && "is-compact", mentionedMe && "is-mentioned")}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setPickerOpen(false);
      }}
    >
      {compact ? (
        <span className="st-msg-gutter" aria-hidden>
          <span className="st-msg-gutter-time">{time}</span>
        </span>
      ) : (
        <UserAvatar name={fullName} tint={tint} size="sm" loading={avatarLoading} />
      )}
      <div className="st-msg-body">
        {compact ? null : (
          <div className="st-msg-head">
            <span className="st-msg-who">
              {who}
              {isOwn ? <span className="faint"> · you</span> : null}
              {mentionedMe ? <span className="st-mention-flag">@you</span> : null}
            </span>
            <span className="st-msg-time">
              {dateTime ? (
                <time dateTime={dateTime} title={`${absolute} · ${timeTitle ?? time}`}>
                  {time} · {absolute}
                </time>
              ) : (
                time
              )}
            </span>
          </div>
        )}
        <div className="st-bubble-wrap">
          <div className={cx("st-bubble", brand ? "st-bubble-brand" : "st-bubble-slate")}>
            {m.body ? <p>{renderMentions(m.body)}</p> : null}
            {isOwn && !m.id.startsWith("local-") ? (
              <span className="st7-checks" title="Sent">
                <IconChecks size={13} />
              </span>
            ) : null}
            {images.length > 0 ? (
              <div className={cx("st-img-grid", images.length > 1 && "is-multi")}>
                {images.map((a, i) => (
                  <motion.button
                    key={`${m.id}-img-${i}`}
                    type="button"
                    className="st-img-thumb"
                    onClick={() => onImage(a)}
                    title={`${a.name} — click to expand`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={a.name} loading="lazy" />
                  </motion.button>
                ))}
              </div>
            ) : null}
          </div>
          <AnimatePresence>
            {showToolbar ? (
              <motion.div
                key="react-bar"
                className="st-react-bar"
                initial={{ opacity: 0, y: 4, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.96 }}
                transition={{ duration: 0.15 }}
              >
                {QUICK_EMOJIS.slice(0, 5).map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="st-react-quick"
                    title={`React ${e}`}
                    onClick={() => onReact(m, e)}
                  >
                    {e}
                  </button>
                ))}
                <button
                  type="button"
                  className="st-react-more"
                  title="More reactions"
                  aria-label="More reactions"
                  aria-expanded={pickerOpen}
                  onClick={() => setPickerOpen((v) => !v)}
                >
                  <IconSmile size={14} />
                </button>
                {onDelete && m.id && !m.id.startsWith("local-") ? (
                  <button
                    type="button"
                    className="st-react-del"
                    title="Delete message"
                    aria-label="Delete message"
                    onClick={() => onDelete(m)}
                  >
                    <IconTrash size={13} />
                  </button>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
          <AnimatePresence>
            {pickerOpen ? (
              <motion.div
                key="emoji-pop"
                className="st-emoji-pop"
                initial={{ opacity: 0, scale: 0.95, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.15 }}
              >
                {QUICK_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="st-emoji-cell"
                    title={`React ${e}`}
                    onClick={() => {
                      onReact(m, e);
                      setPickerOpen(false);
                    }}
                  >
                    {e}
                  </button>
                ))}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
        {reactions.length > 0 ? (
          <div className="st-reactions">
            {reactions.map((g) => (
              <motion.button
                key={g.emoji}
                type="button"
                layout
                className={cx("st-reaction-chip", g.reactedByMe && "is-me")}
                title={`${g.count} · ${g.userIds.slice(0, 5).join(", ")}${g.userIds.length > 5 ? "…" : ""}`}
                onClick={() => onReact(m, g.emoji)}
                whileTap={{ scale: 0.9 }}
              >
                <span>{g.emoji}</span>
                <span className="st-reaction-n">{g.count}</span>
              </motion.button>
            ))}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

/* ---------------- composer ---------------- */

function ChatInput({
  onSend,
  members = [],
  displayName,
  onTypingScroll,
  onSoon,
}: {
  onSend: (body: string, attachments: ChatAttachment[]) => Promise<void>;
  members?: ChatMember[];
  displayName: string;
  onTypingScroll: () => void;
  onSoon: (what: string) => void;
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [mention, setMention] = useState<{ at: number; query: string } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [pending, setPending] = useState<ChatAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastTypingRef = useRef(0);
  const canSend = (value.trim().length > 0 || pending.length > 0) && !sending;

  const filtered = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return members
      .filter((m) => {
        const handle = getMentionHandle(m).toLowerCase();
        const display = getDisplayName(m).toLowerCase();
        return handle.includes(q) || display.includes(q);
      })
      .slice(0, 8);
  }, [mention, members]);

  const updateMention = useCallback((val: string, cursor: number | null) => {
    if (cursor == null) {
      setMention(null);
      return;
    }
    const m = detectMention(val, cursor);
    setMention(m);
    setMentionIndex(0);
  }, []);

  const broadcastTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingRef.current < 2500) return;
    lastTypingRef.current = now;
    void api.chat.typing(displayName);
  }, [displayName]);

  const selectMember = useCallback(
    (m: ChatMember) => {
      if (!mention || !inputRef.current) return;
      const handle = getMentionHandle(m);
      const cursor = inputRef.current.selectionStart ?? value.length;
      const before = value.slice(0, mention.at);
      const after = value.slice(cursor);
      const next = `${before}@${handle} ${after}`;
      setValue(next);
      setMention(null);
      setMentionIndex(0);
      requestAnimationFrame(() => {
        const pos = before.length + handle.length + 2;
        inputRef.current?.setSelectionRange(pos, pos);
        inputRef.current?.focus();
      });
    },
    [mention, value],
  );

  const filesToAttachments = useCallback(
    async (files: FileList | File[]) => {
      const arr = [...files].filter((f) => f.type.startsWith("image/")).slice(0, MAX_IMAGES - pending.length);
      if (arr.length === 0) return;
      for (const f of arr) {
        if (f.size > MAX_IMAGE_BYTES) continue;
        const url = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result ?? ""));
          r.readAsDataURL(f);
        });
        if (!url) continue;
        setPending((prev) =>
          prev.length >= MAX_IMAGES ? prev : [...prev, { url, name: f.name, mime: f.type, size: f.size }],
        );
      }
    },
    [pending.length],
  );

  const send = async () => {
    const text = value.trim();
    if ((!text && pending.length === 0) || sending) return;
    setSending(true);
    try {
      await onSend(text, pending);
      setValue("");
      setPending([]);
      setMention(null);
      onTypingScroll();
    } catch {
      // onSend already toasted + rolled back; keep text for retry.
    } finally {
      setSending(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % filtered.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        if (filtered[mentionIndex]) {
          e.preventDefault();
          selectMember(filtered[mentionIndex]);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <form
      className={cx("st-composer", dragOver && "is-dragover")}
      onSubmit={(e) => void submit(e)}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length > 0) void filesToAttachments(e.dataTransfer.files);
      }}
    >
      {pending.length > 0 ? (
        <div className="st-pending-strip" aria-label="Images to send">
          {pending.map((a, i) => (
            <div key={`${i}-${a.name}`} className="st-pending-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt={a.name} />
              <button
                type="button"
                aria-label={`Remove ${a.name}`}
                onClick={() => setPending((p) => p.filter((_, j) => j !== i))}
              >
                <IconX size={10} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="st-composer-box st7-compose">
        {mention && filtered.length > 0 ? (
          <div className="st-mention-list" role="listbox" aria-label="Mention suggestions" id="mention-list">
            <div className="st-mention-list-head">Mention — @{mention.query || "…"}</div>
            {filtered.map((m, idx) => (
              <button
                key={m.userId}
                type="button"
                role="option"
                aria-selected={idx === mentionIndex}
                className={cx("st-mention-item", idx === mentionIndex && "is-active")}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectMember(m);
                }}
              >
                <UserAvatar name={getDisplayName(m)} tint={hueFrom(m.userId)} size="sm" />
                <span className="st-mention-item-name">{getDisplayName(m)}</span>
                <span className="st-mention-item-handle">@{getMentionHandle(m)}</span>
              </button>
            ))}
          </div>
        ) : null}
        <AnimatePresence>
          {showEmoji ? (
            <motion.div
              key="composer-emoji"
              className="st-emoji-pop st-emoji-composer"
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4 }}
            >
              {QUICK_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="st-emoji-cell"
                  title={`Insert ${e}`}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    setValue((v) => `${v}${e}`);
                    inputRef.current?.focus();
                  }}
                >
                  {e}
                </button>
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>
        <div className="st7-compose-row">
          <button
            type="button"
            className="st7-add-btn"
            title="Attach images (or drag-drop / paste)"
            aria-label="Attach images"
            onClick={() => fileRef.current?.click()}
          >
            <IconPlus size={15} />
          </button>
          <Textarea
            ref={inputRef}
            rows={1}
            value={value}
            onChange={(e) => {
              const v = e.target.value;
              setValue(v);
              updateMention(v, e.target.selectionStart);
              broadcastTyping();
            }}
            onSelect={(e) => {
              const t = e.target as HTMLTextAreaElement;
              updateMention(value, t.selectionStart);
            }}
            onKeyUp={(e) => {
              const t = e.target as HTMLTextAreaElement;
              if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
                updateMention(value, t.selectionStart);
              }
            }}
            onKeyDown={onKeyDown}
            onBlur={() => {
              setTimeout(() => setMention(null), 150);
            }}
            onPaste={(e) => {
              const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
              if (files.length > 0) {
                e.preventDefault();
                void filesToAttachments(files);
              }
            }}
            placeholder="Write a message…"
            aria-label="Send a message"
            aria-autocomplete="list"
            aria-expanded={!!mention && filtered.length > 0}
            aria-controls={mention ? "mention-list" : undefined}
            maxLength={2000}
            disabled={sending}
            autoComplete="off"
            className="st-composer-input st7-compose-input max-h-32 min-h-9 resize-none"
          />
          <button
            type="button"
            className={cx("st7-ghost-btn", showEmoji && "is-on")}
            title="Insert emoji"
            aria-label="Insert emoji"
            aria-expanded={showEmoji}
            onClick={() => setShowEmoji((v) => !v)}
          >
            <IconSmile size={16} />
          </button>
          <button
            type="button"
            className="st7-ghost-btn"
            title="Voice message"
            aria-label="Record voice message"
            onClick={() => onSoon("Voice messages")}
          >
            <IconMic size={16} />
          </button>
          <button className="st7-send-btn" title="Send message" type="submit" disabled={!canSend} aria-label="Send message">
            <IconSend size={14} />
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          aria-label="Attach images"
          onChange={(e) => {
            if (e.target.files) void filesToAttachments(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="st7-compose-bar">
          <button
            type="button"
            className="st7-ghost-btn st7-attach-btn"
            title="Attach a file"
            aria-label="Attach a file"
            onClick={() => fileRef.current?.click()}
          >
            <IconPaperclip size={14} />
          </button>
          <span className="st-composer-hint">@ to tag · paste or drop images · Enter to send</span>
        </div>
      </div>
      {dragOver ? <div className="st-drop-hint">Drop images to attach</div> : null}
    </form>
  );
}
