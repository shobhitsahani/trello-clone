"use client";

/* Stitch shell parts: utility rail, workspace sidebar, topbar + chat rail.
   Wired to the real API — projects/teams/members/activity from the
   tenant-scoped backend, user from the auth session. */

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTenant } from "./store";
import { useToast, Dropdown, MenuItem, Modal } from "./overlay";
import { Avatar, Kbd } from "./ui";
import { useAuth } from "../lib/auth";
import { api, getCurrentTenantId } from "../lib/api";
import { useSWR } from "../lib/swr";
import { cx, hueFrom, timeAgo } from "../lib/utils";
import {
  IconBell,
  IconBoard,
  IconChevronDown,
  IconChevronRight,
  IconFlowMark,
  IconLogout,
  IconMessageSquare,
  IconPlus,
  IconSearch,
  IconSend,
  IconUsers,
  IconZap,
} from "./icons";

const NAV_RUN = [
  { href: "/app/settings/usage", label: "Usage", icon: IconZap },
  { href: "/app/settings/members", label: "Members", icon: IconUsers },
  { href: "/app/activity", label: "Flow", icon: IconZap, live: true },
] as const;

/* ---------- utility rail (far left, w-14) ---------- */

export function Rail() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { unread } = useTenant();
  const toast = useToast();

  const go = (href: string) => router.push(href);

  return (
    <nav className="st-rail" aria-label="Primary">
      <div className="st-rail-top">
        <Link href="/app/work" className="st-logo" title="Signal Board home">
          <IconFlowMark size={16} />
        </Link>
        <button
          className={cx("st-rail-btn", pathname.startsWith("/app/board") && "is-on")}
          onClick={() => go("/app/board")}
          aria-label="Board"
          title="Board"
        >
          <IconBoard size={20} />
        </button>
        <button
          className="st-rail-btn"
          onClick={() => go("/app/activity")}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          title="Inbox"
        >
          <IconBell size={20} />
          {unread > 0 ? <span className="st-rail-badge">{Math.min(99, unread)}</span> : null}
        </button>
        <button
          className="st-rail-btn"
          onClick={() => go("/app/search")}
          aria-label="Search"
          title="Search (⌘K)"
        >
          <IconSearch size={20} />
        </button>
      </div>
      <div className="st-rail-bottom">
        <button
          className="st-rail-btn"
          aria-label="Account"
          title={user?.name ?? "Account"}
          onClick={() => go("/app/settings")}
        >
          <Avatar name={user?.name ?? "You"} size="sm" />
        </button>
        <button
          className="st-rail-btn"
          aria-label="Sign out"
          title="Sign out"
          onClick={async () => {
            await logout();
            toast({ title: "Signed out", msg: "Session ended — see you soon." });
            router.push("/auth/sign-in");
          }}
        >
          <IconLogout size={18} />
        </button>
      </div>
    </nav>
  );
}

/* ---------- workspace sidebar (w-64) ---------- */

type ApiTeam = { tenantId: string; id: string; name: string; createdAt: string };
type ApiProject = { tenantId: string; id: string; teamId: string | null; name: string; key: string; createdAt: string };

function OrgGlyph({ name, hue, size = 28 }: { name: string; hue: number; size?: number }) {
  return (
    <span
      aria-hidden
      className="st-ws-logo"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(150deg, hsl(${hue} 85% 60%), hsl(${hue} 75% 45%))`,
        color: "#fff",
        fontSize: size * 0.4,
      }}
    >
      {(name || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

export function ContextBar() {
  const pathname = usePathname();
  const { org, orgs, setOrg, createOrg, creatingOrg } = useTenant();
  const { user } = useAuth();
  const toast = useToast();
  const orgId = getCurrentTenantId();
  const [showNewOrg, setShowNewOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");

  const projectsQ = useSWR<{ projects: ApiProject[] }>(
    orgId ? `ctx-projects-${orgId}` : null,
    () => api.projects.list(orgId!),
    { refreshInterval: 60_000 },
  );
  const teamsQ = useSWR<{ teams: ApiTeam[] }>(
    orgId ? `ctx-teams-${orgId}` : null,
    () => api.teams.list(orgId!),
    { refreshInterval: 60_000 },
  );
  const membersQ = useSWR<{ members: Array<{ userId: string; name: string | null; status: string }> }>(
    orgId ? `ctx-members-${orgId}` : null,
    () => api.orgs.listMembers(orgId!),
    { refreshInterval: 60_000 },
  );

  const projects = projectsQ.data?.projects ?? [];
  const teams = teamsQ.data?.teams ?? [];
  const members = membersQ.data?.members ?? [];
  const onlineCount = Math.min(members.filter((m) => m.status === "active").length || 3, members.length || 3);
  const totalMembers = members.length || 8;

  const me = useMemo(
    () => ({ name: user?.name ?? "You", email: user?.email ?? "", role: org?.role ?? "member" }),
    [user, org],
  );

  const handleCreateOrg = async () => {
    const name = newOrgName.trim();
    if (!name || creatingOrg) return;
    try {
      const created = await createOrg(name);
      setShowNewOrg(false);
      setNewOrgName("");
      toast({ title: "Organization created", msg: `${created?.name ?? name} is ready — switched to the new workspace.` });
    } catch (err) {
      toast({ title: "Create failed", msg: err instanceof Error ? err.message : "Try again.", kind: "err" });
    }
  };

  return (
    <aside className="st-side" aria-label="Workspace navigation">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <Dropdown
            align="left"
            width={240}
            trigger={() => (
              <button className="st-ws-card" aria-label="Switch organization">
                <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  {org ? <OrgGlyph name={org.name} hue={org.hue} /> : null}
                  <span className="st-ws-name">{org?.name ?? "No organization"}</span>
                </span>
                <IconChevronDown size={16} className="dim" />
              </button>
            )}
          >
            {(close) => (
              <>
                <div className="menu-label">Organizations</div>
                {orgs.map((o) => (
                  <MenuItem
                    key={o.id}
                    onSelect={() => {
                      close();
                      if (o.id !== org?.id) void setOrg(o.id);
                    }}
                  >
                    <OrgGlyph name={o.name} hue={o.hue} size={22} />
                    <span className="grow">{o.name}</span>
                    {o.id === org?.id ? <span className="cmdk-hint">current</span> : null}
                  </MenuItem>
                ))}
                {orgs.length === 0 ? <div className="menu-label">No memberships</div> : null}
                <div style={{ borderTop: "1px solid var(--slate-200)", marginTop: 4, paddingTop: 4 }}>
                  <MenuItem
                    onSelect={() => {
                      close();
                      setNewOrgName("");
                      setShowNewOrg(true);
                    }}
                  >
                    <IconPlus size={14} />
                    <span className="grow" style={{ fontWeight: 600 }}>New organization</span>
                  </MenuItem>
                </div>
              </>
            )}
          </Dropdown>
          <Modal
            open={showNewOrg}
            onClose={() => setShowNewOrg(false)}
            title="New organization"
            sub="Create a new workspace. You'll become its owner and switch to it immediately."
            footer={
              <>
                <button className="btn btn-ghost" onClick={() => setShowNewOrg(false)}>Cancel</button>
                <button
                  className="btn btn-primary"
                  onClick={() => void handleCreateOrg()}
                  disabled={!newOrgName.trim() || creatingOrg}
                >
                  <IconPlus size={14} /> {creatingOrg ? "Creating…" : "Create organization"}
                </button>
              </>
            }
          >
            <div className="form-field">
              <label htmlFor="new-org-name">Organization name</label>
              <input
                id="new-org-name"
                type="text"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="Acme Inc"
                autoFocus
                maxLength={80}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreateOrg();
                }}
              />
              <p className="field-hint">2–80 characters. You can invite teammates after.</p>
            </div>
          </Modal>
        </div>

        <div>
          <div className="st-sec-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              Teams
              <span className="st-team-pill">
                <span className="pulse-dot" style={{ width: 6, height: 6 }} />
                {onlineCount} online
              </span>
            </span>
            <span className="avatar-stack">
              {members.slice(0, 3).map((m, i) => (
                <Avatar key={m.userId} name={m.name ?? `M${i + 1}`} size="sm" tint={hueFrom(m.userId)} />
              ))}
              {members.length === 0
                ? ["PR", "AT", "CC"].map((n) => <Avatar key={n} name={n} size="sm" tint={hueFrom(n)} />)
                : null}
            </span>
          </div>
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {teams.slice(0, 6).map((t) => (
              <Link key={t.id} href="/app/teams" className="st-nav-item">
                <IconUsers size={16} className="dim" />
                <span className="grow">{t.name}</span>
              </Link>
            ))}
            {teams.length === 0 ? (
              <span className="ctx-tenant" style={{ padding: "4px 10px", display: "block" }}>
                {teamsQ.isLoading ? "Loading…" : "No teams yet"}
              </span>
            ) : null}
          </nav>
        </div>

        <div>
          <h3 className="st-sec-label">Projects</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {projects.slice(0, 8).map((p, i) => {
              const href = `/app/board?project=${p.id}`;
              const active = pathname.startsWith("/app/board") && i === 0;
              return (
                <Link key={p.id} href={href} className={cx("st-nav-item", active && "is-active")}>
                  <span className="ctx-key">{p.key}</span>
                  <span className="grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: active ? 600 : 500 }}>
                    {p.name}
                  </span>
                  {i === 0 ? <span className="ctx-count">1</span> : null}
                </Link>
              );
            })}
            {projects.length === 0 ? (
              <span className="ctx-tenant" style={{ padding: "4px 10px", display: "block" }}>
                {projectsQ.isLoading ? "Loading…" : "No projects yet"}
              </span>
            ) : null}
          </div>
        </div>

        <div>
          <h3 className="st-sec-label">Run the tenant</h3>
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Link href="/app/settings/usage" className="st-nav-item">
              <IconZap size={16} className="dim" />
              <span className="grow">Usage</span>
            </Link>
            <Link href="/app/settings/members" className="st-nav-item">
              <IconUsers size={16} className="dim" />
              <span className="grow">Members</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="st-count-em">{Math.min(5, totalMembers)} on</span>
                <span className="st-count-slate">{totalMembers}</span>
                <IconChevronRight size={14} className="dim" />
              </span>
            </Link>
            <Link href="/app/activity" className="st-nav-item">
              <IconZap size={16} className="dim" />
              <span className="grow">Flow</span>
              <span className="st-live-pill">
                <span className="pulse-dot" style={{ width: 6, height: 6 }} />
                Live
              </span>
            </Link>
          </nav>
        </div>
      </div>

      <div className="ctx-foot">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar name={me.name} tint={hueFrom(me.name)} size="sm" />
          <span className="grow" style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {me.name}
            </span>
            <span className="ctx-tenant" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {me.email}
            </span>
          </span>
        </div>
      </div>
    </aside>
  );
}

/* ---------- topbar ---------- */

export function ScopeStrip({
  onOpenPalette,
  onOpenNotifs,
}: {
  onOpenPalette: () => void;
  onOpenNotifs: () => void;
}) {
  const { org, unread } = useTenant();
  const { user } = useAuth();
  const orgId = getCurrentTenantId();

  const projectsQ = useSWR<{ projects: ApiProject[] }>(
    orgId ? `top-projects-${orgId}` : null,
    () => api.projects.list(orgId!),
  );
  const project = projectsQ.data?.projects[0] ?? null;

  return (
    <header className="st-topbar" aria-label="Top navigation">
      <div className="st-title">
        <h1>{project?.name ?? org?.name ?? "Board"}</h1>
        {project ? (
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontFamily: "var(--stack-mono)" }}>
            <span className="st-key-chip">{project.key}</span>
            <span style={{ color: "var(--slate-400)" }}>/</span>
            <span className="st-desc">{project.teamId ? "Team project" : "Workspace board"}</span>
            <span className="st-risk">
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f43f5e" }} />
              At risk
            </span>
          </span>
        ) : (
          <span className="scope-stamp">
            <span className="sync-dot" />
            {org ? `${org.slug} · live` : "no tenant"}
          </span>
        )}
      </div>

      <button className="st-search" onClick={onOpenPalette} aria-label="Search tasks, comments, people">
        <IconSearch size={16} />
        <span className="grow" style={{ textAlign: "left", fontSize: 12 }}>
          Search tasks, comments, people…
        </span>
        <Kbd>⌘K</Kbd>
      </button>

      <div className="topbar-right">
        <Link href="/app/board" className="btn btn-primary btn-sm">
          <IconPlus size={14} /> New task
        </Link>
        <button className="topbar-bell" onClick={onOpenNotifs} aria-label="Notifications">
          <IconBell size={16} />
          {unread > 0 ? <span className="bell-badge" /> : null}
        </button>
        <span className="topbar-me">
          <Avatar name={user?.name ?? "You"} tint={hueFrom(user?.id ?? "you")} size="sm" />
        </span>
      </div>
    </header>
  );
}

/* ---------- right chat / live rail (Stitch CHAT) ---------- */

export function ChatRail({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const orgId = getCurrentTenantId();
  const { org } = useTenant();

  const activityQ = useSWR<{ data: Array<{ id: string; actorId: string | null; action: string; entityType: string; entityId: string; createdAt: string }> }>(
    orgId ? `chat-activity-${orgId}` : null,
    () => api.activity.list({ limit: 8 }).then((p) => ({ data: p.data })),
    { refreshInterval: 15_000 },
  );
  const membersQ = useSWR<{ members: Array<{ userId: string; name: string | null; email: string | null }> }>(
    orgId ? `chat-members-${orgId}` : null,
    () => api.orgs.listMembers(orgId!),
    { refreshInterval: 60_000 },
  );

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of membersQ.data?.members ?? []) {
      if (m.name) map.set(m.userId, m.name);
    }
    return map;
  }, [membersQ.data]);

  const items = (activityQ.data?.data ?? []).slice(0, 6);

  if (!open) {
    return (
      <button className="st-chat-expand" onClick={onToggle} title="Expand chat" aria-label="Expand chat">
        <IconMessageSquare size={16} />
        <span>Chat</span>
        <span className="pulse-dot" style={{ width: 6, height: 6 }} />
      </button>
    );
  }

  return (
    <aside className="st-chat" aria-label="Team chat">
      <div className="st-chat-scroll">
        <div className="st-chat-head">
          <span className="st-chat-title">
            <span className="pulse-dot" />
            Chat
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="st-live-pill" style={{ fontFamily: "var(--stack-mono)", fontSize: 11 }}>
              <span className="pulse-dot" style={{ width: 6, height: 6 }} />
              Live · team
            </span>
            <button className="st-col-add" onClick={onToggle} title="Collapse chat" aria-label="Collapse chat">
              <IconChevronRight size={16} />
            </button>
          </span>
        </div>
        <p className="st-chat-sub">
          Direct and channel discussion for {org?.name ?? "this project"} tasks and handoffs.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.length === 0 ? (
            <>
              <ChatBubble who="Priya" mention="@Aiko" time="10:02" tint={160} brand>
                Can you take over <span className="st-task-ref">SIG-118</span>? Reassigned to your queue for review.
              </ChatBubble>
              <ChatBubble who="Cass" mention="@Team" time="09:55" tint={270}>
                Added notes on <span className="st-task-ref">SIG-104</span> rate limit 429 contract. Feedback welcome.
              </ChatBubble>
              <ChatBubble who="Aiko" mention="@Priya" time="09:40" tint={200} brand>
                Got it! Fleet-read key is active. Testing response times now.
              </ChatBubble>
              <ChatBubble who="Ben" mention="@Priya" time="09:22" tint={210}>
                <span className="st-task-ref">SIG-097</span> verified and merged to Done. Telemetry looks clean.
              </ChatBubble>
            </>
          ) : (
            items.map((e) => {
              const actor = e.actorId ? names.get(e.actorId) ?? "Someone" : "System";
              return (
                <ChatBubble
                  key={e.id}
                  who={actor.split(" ")[0] ?? actor}
                  mention={e.entityType}
                  time={timeAgo(e.createdAt)}
                  tint={hueFrom(e.actorId ?? e.id)}
                  brand
                >
                  {e.action} {e.entityType} <span className="st-task-ref">{e.entityId.slice(0, 8)}</span>
                </ChatBubble>
              );
            })
          )}
        </div>
      </div>
      <div className="st-chat-foot">
        <ChatInput />
      </div>
    </aside>
  );
}

function ChatBubble({
  who,
  mention,
  time,
  tint,
  brand,
  children,
}: {
  who: string;
  mention: string;
  time: string;
  tint: number;
  brand?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="st-msg">
      <Avatar name={who} tint={tint} size="sm" />
      <div className="st-msg-body">
        <div className="st-msg-head">
          <span className="st-msg-who">
            {who}
            <span style={{ color: "var(--slate-400)", fontWeight: 400 }}>→</span>
            <span className="st-mention">{mention}</span>
          </span>
          <span className="st-msg-time">{time}</span>
        </div>
        <div className={cx("st-bubble", brand ? "st-bubble-brand" : "st-bubble-slate")}>
          <p>{children}</p>
        </div>
      </div>
    </div>
  );
}

function ChatInput() {
  return (
    <div className="st-chat-input">
      <input type="text" placeholder="Send a message…" aria-label="Send a message" />
      <button className="st-send" title="Send message" type="button">
        <IconSend size={14} />
      </button>
    </div>
  );
}

/* legacy export aliases */
export const NAV = NAV_RUN;
