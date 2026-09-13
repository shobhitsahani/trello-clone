"use client";

/* Stitch shell parts: utility rail, workspace sidebar, topbar + chat rail.
   Wired to the real API — projects/teams/members/activity from the
   tenant-scoped backend, user from the auth session. */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTenant } from "./store";
import { useToast, Dropdown, MenuItem, Modal } from "./overlay";
import { Kbd } from "./ui";
import { Avatar as ShadcnAvatar, AvatarFallback } from "./ui/avatar";
import { useAuth } from "../lib/auth";
import { api, getCurrentTenantId, type ChatMessage, type PaginatedResponse } from "../lib/api";
import { useSWR } from "../lib/swr";
import { useRealtime } from "../lib/realtime";
import { cx, formatChatTime, hueFrom, initials } from "../lib/utils";
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
  IconTrash,
  IconUsers,
  IconZap,
} from "./icons";

const NAV_RUN = [
  // { href: "/app/settings/usage", label: "Usage", icon: IconZap }, // usage commented out
  { href: "/app/settings/members", label: "Members", icon: IconUsers },
  { href: "/app/activity", label: "Flow", icon: IconZap, live: true },
] as const;

/* shadcn avatar helper — uses base-ui Avatar with hue-based fallback */
function UserAvatar({
  name,
  size = "sm",
  tint = 220,
}: {
  name: string;
  size?: "sm" | "default" | "lg";
  tint?: number;
}) {
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
          <UserAvatar name={user?.name ?? "You"} size="sm" tint={hueFrom(user?.id ?? "you")} />
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

/** Suggest a short uppercase key from a project name, e.g. "Edge API" -> "EDGE". */
function suggestKey(name: string): string {
  const letters = name.replace(/[^a-zA-Z]/g, "").toUpperCase();
  return letters.slice(0, 4);
}

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
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectKey, setNewProjectKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [projMenu, setProjMenu] = useState<{ x: number; y: number; project: ApiProject } | null>(null);
  const [deletingProj, setDeletingProj] = useState<ApiProject | null>(null);
  const [deleting, setDeleting] = useState(false);

  const projectsQ = useSWR<{ projects: ApiProject[] }>(
    orgId ? `ctx-projects-${orgId}` : null,
    () => api.projects.list(orgId!),
  );
  const teamsQ = useSWR<{ teams: ApiTeam[] }>(
    orgId ? `ctx-teams-${orgId}` : null,
    () => api.teams.list(orgId!),
  );
  const membersQ = useSWR<{ members: Array<{ userId: string; name: string | null; status: string }> }>(
    orgId ? `ctx-members-${orgId}` : null,
    () => api.orgs.listMembers(orgId!),
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

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    const key = (keyTouched ? newProjectKey : suggestKey(newProjectName)).trim().toUpperCase();
    if (!name || !key || !orgId || creatingProject) return;
    setCreatingProject(true);
    try {
      await api.projects.create({ name, key });
      setShowNewProject(false);
      setNewProjectName("");
      setNewProjectKey("");
      setKeyTouched(false);
      await projectsQ.mutate();
      toast({ title: "Project created", msg: `${name} (${key}) is ready.` });
    } catch (err) {
      toast({ title: "Create failed", msg: err instanceof Error ? err.message : "Try again.", kind: "err" });
    } finally {
      setCreatingProject(false);
    }
  };
  const openProjMenu = (e: React.MouseEvent, project: ApiProject) => {
    e.preventDefault();
    e.stopPropagation();
    setProjMenu({
      x: Math.min(e.clientX, window.innerWidth - 230),
      y: Math.min(e.clientY, window.innerHeight - 120),
      project,
    });
  };

  const handleDeleteProject = async () => {
    if (!deletingProj || deleting) return;
    setDeleting(true);
    try {
      await api.projects.delete(deletingProj.id);
      setDeletingProj(null);
      setProjMenu(null);
      await projectsQ.mutate();
      toast({ title: "Project deleted", msg: `${deletingProj.name} was removed.` });
    } catch (err) {
      toast({ title: "Delete failed", msg: err instanceof Error ? err.message : "Try again.", kind: "err" });
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (!projMenu) return;
    const close = () => setProjMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProjMenu(null);
    };
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [projMenu]);

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
                <UserAvatar key={m.userId} name={m.name ?? `M${i + 1}`} size="sm" tint={hueFrom(m.userId)} />
              ))}
              {members.length === 0
                ? ["PR", "AT", "CC"].map((n) => <UserAvatar key={n} name={n} size="sm" tint={hueFrom(n)} />)
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
          <div className="st-sec-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Projects</span>
            <button
              className="st-col-add"
              style={{ margin: 0 }}
              title="New project"
              aria-label="New project"
              onClick={() => {
                setNewProjectName("");
                setNewProjectKey("");
                setKeyTouched(false);
                setShowNewProject(true);
              }}
            >
              <IconPlus size={14} />
            </button>
          </div>
          <Modal
            open={showNewProject}
            onClose={() => setShowNewProject(false)}
            title="New project"
            sub="Shown in the sidebar and on the board. Pick a short key for task cards."
            footer={
              <>
                <button className="btn btn-ghost" onClick={() => setShowNewProject(false)}>Cancel</button>
                <button
                  className="btn btn-primary"
                  onClick={() => void handleCreateProject()}
                  disabled={!newProjectName.trim() || !(keyTouched ? newProjectKey.trim() : suggestKey(newProjectName)) || creatingProject}
                >
                  <IconPlus size={14} /> {creatingProject ? "Creating…" : "Create project"}
                </button>
              </>
            }
          >
            <div className="form-field">
              <label htmlFor="new-project-name">Project name</label>
              <input
                id="new-project-name"
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Signal"
                autoFocus
                maxLength={80}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreateProject();
                }}
              />
            </div>
            <div className="form-field">
              <label htmlFor="new-project-key">Key (short code)</label>
              <input
                id="new-project-key"
                type="text"
                value={keyTouched ? newProjectKey : suggestKey(newProjectName)}
                onChange={(e) => {
                  setKeyTouched(true);
                  setNewProjectKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10));
                }}
                placeholder="SIG"
                maxLength={10}
                className="mono"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreateProject();
                }}
              />
              <p className="field-hint">Shown on task cards — up to 10 letters or digits.</p>
            </div>
          </Modal>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {projects.slice(0, 8).map((p, i) => {
              const href = `/app/board?project=${p.id}`;
              const active = pathname.startsWith("/app/board") && i === 0;
              return (
                <Link
                  key={p.id}
                  href={href}
                  className={cx("st-nav-item", active && "is-active")}
                  onContextMenu={(e) => openProjMenu(e, p)}
                  title={`${p.name} — right-click for options`}
                >
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
          {projMenu ? (
            <div
              className="menu"
              role="menu"
              aria-label={`Options for ${projMenu.project.name}`}
              style={{ position: "fixed", top: projMenu.y, left: projMenu.x, width: 210, zIndex: 70 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="menu-label" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {projMenu.project.key} · {projMenu.project.name}
              </div>
              <button
                className="menu-item"
                role="menuitem"
                style={{ color: "#be123c", fontWeight: 600 }}
                onClick={() => {
                  setDeletingProj(projMenu.project);
                  setProjMenu(null);
                }}
              >
                <IconTrash size={14} />
                Delete project
              </button>
            </div>
          ) : null}
          <Modal
            open={deletingProj !== null}
            onClose={() => (deleting ? null : setDeletingProj(null))}
            title={`Delete ${deletingProj?.name ?? "project"}?`}
            sub="This removes the project from the sidebar and board. Tasks inside it will no longer be listed. This can't be undone."
            footer={
              <>
                <button className="btn btn-ghost" onClick={() => setDeletingProj(null)} disabled={deleting}>
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={() => void handleDeleteProject()} disabled={deleting}>
                  <IconTrash size={14} /> {deleting ? "Deleting…" : "Delete project"}
                </button>
              </>
            }
          >
            <p style={{ fontSize: 13, color: "var(--slate-600)" }}>
              Project key <span className="mono" style={{ fontWeight: 700 }}>{deletingProj?.key}</span> will be
              permanently removed from this workspace.
            </p>
          </Modal>
        </div>

        <div>
          <h3 className="st-sec-label">Run the tenant</h3>
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {/* <Link href="/app/settings/usage" className="st-nav-item"> // usage commented out
              <IconZap size={16} className="dim" />
              <span className="grow">Usage</span>
            </Link> */}
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
          <UserAvatar name={me.name} tint={hueFrom(me.name)} size="sm" />
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
          <UserAvatar name={user?.name ?? "You"} tint={hueFrom(user?.id ?? "you")} size="sm" />
        </span>
      </div>
    </header>
  );
}

/* ---------- right chat / live rail (Stitch CHAT) ---------- */

const CHAT_MIN_W = 240;
const CHAT_MAX_W = 600;
const CHAT_DEFAULT_W = 320;
const CHAT_LS_KEY = "tf.chat.w.v1";

const clampChatW = (n: number) => Math.min(CHAT_MAX_W, Math.max(CHAT_MIN_W, Math.round(n)));

function loadChatWidth(): number {
  if (typeof window === "undefined") return CHAT_DEFAULT_W;
  try {
    const raw = window.localStorage.getItem(CHAT_LS_KEY);
    if (raw == null) return CHAT_DEFAULT_W;
    const n = Number(JSON.parse(raw));
    if (Number.isFinite(n)) return clampChatW(n);
  } catch {
    // corrupted value — fall back to default
  }
  return CHAT_DEFAULT_W;
}

export function ChatRail({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const orgId = getCurrentTenantId();
  const { org } = useTenant();
  const { user } = useAuth();
  const toast = useToast();
  const [width, setWidth] = useState<number>(loadChatWidth);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const chatQ = useSWR<PaginatedResponse<ChatMessage>>(
    orgId ? `chat-messages-${orgId}` : null,
    () => api.chat.list({ limit: 50 }),
  );
  // Shared cache key with ContextBar (`ctx-members-*`): same endpoint, so one
  // request serves both instead of two polls per minute.
  const membersQ = useSWR<{ members: Array<{ userId: string; name: string | null; email: string | null }> }>(
    orgId ? `ctx-members-${orgId}` : null,
    () => api.orgs.listMembers(orgId!),
  );

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of membersQ.data?.members ?? []) {
      if (m.name) map.set(m.userId, m.name);
    }
    return map;
  }, [membersQ.data]);

  const items = useMemo(() => [...(chatQ.data?.data ?? [])].reverse(), [chatQ.data]);

  // Realtime: a teammate's POST /v1/chat/messages fans out as `chat.created`
  // on our org WS channel — revalidate the list instead of polling for it.
  // The mutate fn identity changes per render, so it goes through a ref to
  // keep the WS subscription (and its reconnect backoff) stable.
  const mutateRef = useRef(chatQ.mutate);
  useEffect(() => {
    mutateRef.current = chatQ.mutate;
  });
  const realtimeOpts = useMemo(() => ({ onChat: () => void mutateRef.current() }), []);
  const { isConnected } = useRealtime(realtimeOpts);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!open) return;
    // Don't yank the user's scroll when history/previews revalidate:
    // stick only if they were already near the bottom (or it's first paint).
    if (stickRef.current) el.scrollTop = el.scrollHeight;
  }, [items.length, open]);

  const handleSend = useCallback(
    async (body: string) => {
      if (!user) {
        toast({ title: "Not signed in", msg: "Sign in to send messages.", kind: "err" });
        throw new Error("Not signed in");
      }
      const text = body.trim();
      if (!text) return;
      const optimistic: ChatMessage = {
        id: `local-${Date.now()}`,
        authorId: user.id,
        body: text,
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
      try {
        await api.chat.send(text);
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
    [chatQ, toast, user],
  );

  // Persist width; cheap + survives remounts / page changes.
  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_LS_KEY, JSON.stringify(width));
    } catch {
      // storage unavailable — session-only width
    }
  }, [width]);

  // While dragging: move cursor + no-select on <body>, listen on window so
  // fast drags outside the handle don't drop the gesture.
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
        // capture unsupported — window listeners still track the drag
      }
    },
    [width],
  );

  const onResizeKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
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
    },
    [],
  );

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
    <aside className="st-chat" aria-label="Team chat" style={{ width }}>
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
        <div className="st-chat-head">
          <span className="st-chat-title">
            <span className="pulse-dot" />
            Chat
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="st-live-pill" style={{ fontFamily: "var(--stack-mono)", fontSize: 11 }}>
              <span className="pulse-dot" style={{ width: 6, height: 6, opacity: isConnected ? 1 : 0.3 }} />
              {isConnected ? "Live · team" : "Offline"}
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
          {chatQ.isLoading ? (
            <div className="loading">Loading…</div>
          ) : items.length === 0 ? (
            <div className="st-empty">No messages yet — say hello.</div>
          ) : (
            items.map((m) => {
              const name =
                names.get(m.authorId) ?? (m.authorId === user?.id ? (user?.name ?? "You") : "Someone");
              const own = m.authorId === user?.id;
              const when = formatChatTime(m.createdAt);
              return (
                <ChatBubble
                  key={m.id}
                  who={name.split(" ")[0] || "Someone"}
                  mention={own ? "You" : "@Team"}
                  time={when.absolute ? `${when.absolute} · ${when.relative}` : when.relative}
                  dateTime={m.createdAt}
                  timeTitle={when.title || undefined}
                  tint={hueFrom(m.authorId)}
                  brand={own}
                >
                  {m.body}
                </ChatBubble>
              );
            })
          )}
        </div>
      </div>
      <div className="st-chat-foot">
        <ChatInput onSend={handleSend} />
      </div>
    </aside>
  );
}

function ChatBubble({
  who,
  mention,
  time,
  dateTime,
  timeTitle,
  tint,
  brand,
  children,
}: {
  who: string;
  mention: string;
  time: string;
  dateTime?: string;
  timeTitle?: string;
  tint: number;
  brand?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="st-msg">
      <UserAvatar name={who} tint={tint} size="sm" />
      <div className="st-msg-body">
        <div className="st-msg-head">
          <span className="st-msg-who">
            {who}
            <span style={{ color: "var(--slate-400)", fontWeight: 400 }}>→</span>
            <span className="st-mention">{mention}</span>
          </span>
          <span className="st-msg-time">
            {dateTime ? (
              <time dateTime={dateTime} title={timeTitle ?? time}>
                {time}
              </time>
            ) : (
              time
            )}
          </span>
        </div>
        <div className={cx("st-bubble", brand ? "st-bubble-brand" : "st-bubble-slate")}>
          <p>{children}</p>
        </div>
      </div>
    </div>
  );
}

function ChatInput({ onSend }: { onSend: (body: string) => Promise<void> }) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const canSend = value.trim().length > 0 && !sending;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = value.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await onSend(text);
      setValue("");
    } catch {
      // onSend already toasted + rolled back; keep the text for retry.
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="st-chat-input" onSubmit={(e) => void submit(e)}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Send a message…"
        aria-label="Send a message"
        maxLength={2000}
        disabled={sending}
      />
      <button
        className="st-send"
        title="Send message"
        type="submit"
        disabled={!canSend}
        style={!canSend ? { opacity: 0.45 } : undefined}
      >
        <IconSend size={14} />
      </button>
    </form>
  );
}

/* legacy export aliases */
export const NAV = NAV_RUN;
