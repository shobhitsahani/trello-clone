"use client";

/* Stitch shell parts: utility rail, workspace sidebar, topbar + chat rail.
   Wired to the real API — projects/teams/members/activity from the
   tenant-scoped backend, user from the auth session. */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTenant } from "./store";
import { useToast, Dropdown, MenuItem, Modal } from "./overlay";
import { ThemeToggle } from "./theme-toggle";
import { PaletteSearchTrigger } from "./search-trigger";
import { Button, buttonVariants } from "./ui/button";
import { Input } from "./ui/input";
import { Field, FieldDescription, FieldLabel } from "./ui/field";
import { Textarea } from "./ui/textarea";
import { Avatar as ShadcnAvatar, AvatarFallback } from "./ui/avatar";
import { Skeleton } from "./ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  BadgeCheckIcon,
  BellIcon,
  CreditCardIcon,
  LogOutIcon,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { api, getCurrentTenantId, type ChatMessage, type PaginatedResponse } from "../lib/api";
import { useSWR } from "../lib/swr";
import { useRealtime } from "../lib/realtime";
import { cx, formatChatTime, hueFrom, initials } from "../lib/utils";
import { AnimatePresence, motion } from "@/components/motion";
import {
  IconBell,
  IconBoard,
  IconChevronDown,
  IconChevronRight,
  IconEdit,
  IconFlowMark,
  IconLogout,
  IconMessageSquare,
  IconPlus,
  IconSearch,
  IconSend,
  IconTrash,
  IconTrello,
  IconUsers,
  IconZap,
} from "./icons";

// ---------- @mention helpers (single @ to mention a teammate) ----------
type ChatMember = { userId: string; name: string | null; email: string | null };

function getMentionHandle(m: ChatMember): string {
  if (m.name) return m.name.replace(/\s+/g, "");
  if (m.email) return (m.email.split("@")[0] ?? "").replace(/[^a-zA-Z0-9_]/g, "");
  return m.userId.slice(0, 8);
}
function getDisplayName(m: ChatMember): string {
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
function renderMentions(text: string) {
  const parts = text.split(/(@[A-Za-z0-9_]+)/g);
  return parts.map((part, i) =>
    /^@[A-Za-z0-9_]+$/.test(part) ? (
      <span key={i} className="st-mention-inline">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

const NAV_RUN = [
  // { href: "/app/settings/usage", label: "Usage", icon: IconZap }, // usage commented out
  { href: "/app/settings/members", label: "Members", icon: IconUsers },
  { href: "/app/activity", label: "Flow", icon: IconZap, live: true },
] as const;

/* shadcn avatar helper — uses base-ui Avatar with hue-based fallback.
   Pass `loading` while the person is still resolving (signed out, offline,
   slow network) to render a pulsing skeleton of the same size instead. */
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

/* ---------- utility rail (far left, w-14) ---------- */

export function Rail() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isLoading: authLoading } = useAuth();
  const { unread } = useTenant();
  const toast = useToast();

  const go = (href: string) => router.push(href);

  return (
    <nav className="st-rail" aria-label="Primary">
      <div className="st-rail-top">
        <Link href="/app/work" className="st-logo" title="Signal Board home">
          <IconFlowMark size={16} />
        </Link>
        <motion.button
          className={cx("st-rail-btn", pathname.startsWith("/app/board") && "is-on")}
          onClick={() => go("/app/board")}
          aria-label="Board"
          title="Board"
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.92 }}
        >
          <IconBoard size={20} />
        </motion.button>
        <motion.button
          className="st-rail-btn"
          onClick={() => go("/app/activity")}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          title="Inbox"
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.92 }}
        >
          <IconBell size={20} />
          {unread > 0 ? (
            <motion.span
              className="st-rail-badge"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              key={unread}
            >
              {Math.min(99, unread)}
            </motion.span>
          ) : null}
        </motion.button>
        <motion.button
          className="st-rail-btn"
          onClick={() => go("/app/search")}
          aria-label="Search"
          title="Search (⌘K)"
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.92 }}
        >
          <IconSearch size={20} />
        </motion.button>
      </div>
      <div className="st-rail-bottom">
        <button
          className="st-rail-btn"
          aria-label="Account"
          title={user?.name ?? "Account"}
          onClick={() => go("/app/settings")}
        >
          <UserAvatar
            name={user?.name ?? "You"}
            size="sm"
            tint={hueFrom(user?.id ?? "you")}
            loading={authLoading || !user}
          />
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
  const { user, isLoading: authLoading } = useAuth();
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
  const [renamingProj, setRenamingProj] = useState<ApiProject | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);

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

  const openRenameProject = (project: ApiProject) => {
    setRenamingProj(project);
    setRenameName(project.name);
    setProjMenu(null);
  };

  const handleRenameProject = async () => {
    const name = renameName.trim();
    if (!renamingProj || !name || renaming) return;
    if (name === renamingProj.name) {
      setRenamingProj(null);
      return;
    }
    setRenaming(true);
    try {
      await api.projects.update(renamingProj.id, { name });
      setRenamingProj(null);
      await projectsQ.mutate();
      toast({ title: "Project renamed", msg: `Renamed to ${name}.` });
    } catch (err) {
      toast({ title: "Rename failed", msg: err instanceof Error ? err.message : "Try again.", kind: "err" });
    } finally {
      setRenaming(false);
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
                <Button variant="ghost" onClick={() => setShowNewOrg(false)}>Cancel</Button>
                <Button
                  onClick={() => void handleCreateOrg()}
                  disabled={!newOrgName.trim() || creatingOrg}
                >
                  <IconPlus size={14} /> {creatingOrg ? "Creating…" : "Create organization"}
                </Button>
              </>
            }
          >
            <Field>
              <FieldLabel htmlFor="new-org-name">Organization name</FieldLabel>
              <Input
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
              <FieldDescription>2–80 characters. You can invite teammates after.</FieldDescription>
            </Field>
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
              {membersQ.isLoading ? (
                <>
                  <Skeleton aria-hidden className="size-6 shrink-0 rounded-full" />
                  <Skeleton aria-hidden className="size-6 shrink-0 rounded-full" />
                  <Skeleton aria-hidden className="size-6 shrink-0 rounded-full" />
                </>
              ) : (
                members
                  .slice(0, 3)
                  .map((m, i) => (
                    <UserAvatar key={m.userId} name={m.name ?? `M${i + 1}`} size="sm" tint={hueFrom(m.userId)} />
                  ))
              )}
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
                <Button variant="ghost" onClick={() => setShowNewProject(false)}>Cancel</Button>
                <Button
                  onClick={() => void handleCreateProject()}
                  disabled={!newProjectName.trim() || !(keyTouched ? newProjectKey.trim() : suggestKey(newProjectName)) || creatingProject}
                >
                  <IconPlus size={14} /> {creatingProject ? "Creating…" : "Create project"}
                </Button>
              </>
            }
          >
            <Field>
              <FieldLabel htmlFor="new-project-name">Project name</FieldLabel>
              <Input
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
            </Field>
            <Field>
              <FieldLabel htmlFor="new-project-key">Key (short code)</FieldLabel>
              <Input
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
              <FieldDescription>Shown on task cards — up to 10 letters or digits.</FieldDescription>
            </Field>
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
                onClick={() => openRenameProject(projMenu.project)}
              >
                <IconEdit size={14} />
                Rename project
              </button>
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
            open={renamingProj !== null}
            onClose={() => (renaming ? null : setRenamingProj(null))}
            title="Rename project"
            sub="Shown in the sidebar, projects list, and on the board."
            footer={
              <>
                <Button variant="ghost" onClick={() => setRenamingProj(null)} disabled={renaming}>
                  Cancel
                </Button>
                <Button
                  onClick={() => void handleRenameProject()}
                  disabled={renaming || !renameName.trim() || renameName.trim() === renamingProj?.name}
                >
                  <IconEdit size={14} /> {renaming ? "Renaming…" : "Rename project"}
                </Button>
              </>
            }
          >
            <Field>
              <FieldLabel htmlFor="rename-project-name">Project name</FieldLabel>
              <Input
                id="rename-project-name"
                type="text"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                placeholder="Project name"
                autoFocus
                maxLength={100}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleRenameProject();
                }}
              />
            </Field>
          </Modal>
          <Modal
            open={deletingProj !== null}
            onClose={() => (deleting ? null : setDeletingProj(null))}
            title={`Delete ${deletingProj?.name ?? "project"}?`}
            sub="This removes the project from the sidebar and board. Tasks inside it will no longer be listed. This can't be undone."
            footer={
              <>
                <Button variant="ghost" onClick={() => setDeletingProj(null)} disabled={deleting}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={() => void handleDeleteProject()} disabled={deleting}>
                  <IconTrash size={14} /> {deleting ? "Deleting…" : "Delete project"}
                </Button>
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
        {authLoading || !user ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }} aria-hidden>
            <Skeleton className="size-6 shrink-0 rounded-full" />
            <span className="grow" style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              <Skeleton className="h-3 w-24 rounded" />
              <Skeleton className="h-2.5 w-32 rounded" />
            </span>
          </div>
        ) : (
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
        )}
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
  const { user, logout, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const orgId = getCurrentTenantId();

  const projectsQ = useSWR<{ projects: ApiProject[] }>(
    orgId ? `top-projects-${orgId}` : null,
    () => api.projects.list(orgId!),
  );
  const project = projectsQ.data?.projects[0] ?? null;

  return (
    <motion.header
      className="st-topbar trello-topbar"
      aria-label="Top navigation"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link href="/app/work" className="trello-brand" aria-label="Trello home">
        <span className="trello-logo-tile">
          <IconTrello size={18} />
        </span>
        <span className="trello-word">Trello</span>
      </Link>
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

      <PaletteSearchTrigger onOpen={onOpenPalette} />

      <div className="topbar-right">
        <ThemeToggle id="topbar-theme-mode" showLabel={false} />
        <Link href="/app/board" className={buttonVariants({ variant: "default", size: "sm" }) + " trello-create-btn"}>
          <IconPlus size={14} /> Create
        </Link>
        <motion.button
          className="topbar-bell"
          onClick={onOpenNotifs}
          aria-label="Notifications"
          whileTap={{ scale: 0.9 }}
        >
          <IconBell size={16} />
          {unread > 0 ? (
            <motion.span
              className="bell-badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              key={unread}
            />
          ) : null}
        </motion.button>
        <span className="topbar-me">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
                  <UserAvatar
                    name={user?.name ?? "You"}
                    size="sm"
                    tint={hueFrom(user?.id ?? "you")}
                    loading={authLoading || !user}
                  />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                {authLoading || !user ? (
                  <span className="flex flex-col gap-1.5 py-0.5" aria-hidden>
                    <Skeleton className="h-3.5 w-28 rounded" />
                    <Skeleton className="h-3 w-36 rounded" />
                  </span>
                ) : (
                  <>
                    <span className="block max-w-full truncate text-sm font-semibold text-foreground">
                      {user.name}
                    </span>
                    {user.email ? (
                      <span className="block max-w-full truncate text-xs font-normal text-muted-foreground">
                        {user.email}
                      </span>
                    ) : null}
                  </>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem closeOnClick onClick={() => router.push("/app/settings")}>
                  <BadgeCheckIcon />
                  Account
                </DropdownMenuItem>
                <DropdownMenuItem closeOnClick onClick={() => router.push("/app/settings/usage")}>
                  <CreditCardIcon />
                  Billing
                </DropdownMenuItem>
                <DropdownMenuItem closeOnClick onClick={onOpenNotifs}>
                  <BellIcon />
                  Notifications
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                closeOnClick
                variant="destructive"
                onClick={async () => {
                  await logout();
                  toast({ title: "Signed out", msg: "Session ended — see you soon." });
                  router.push("/auth/sign-in");
                }}
              >
                <LogOutIcon />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>
    </motion.header>
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

  return (
    <motion.aside
      className="st-chat"
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
            <div role="status" aria-label="Loading messages" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
            <div className="st-empty">No messages yet — say hello.</div>
          ) : (
            items.map((m) => {
              const name =
                names.get(m.authorId) ?? (m.authorId === user?.id ? (user?.name ?? "You") : "Someone");
              const own = m.authorId === user?.id;
              const when = formatChatTime(m.createdAt);
              // Name still resolving (members slow/offline) and not our own
              // message → pulse a skeleton avatar instead of a "Someone" bubble.
              const avatarLoading =
                membersQ.isLoading && !names.get(m.authorId) && m.authorId !== user?.id;
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
                  avatarLoading={avatarLoading}
                >
                  {m.body}
                </ChatBubble>
              );
            })
          )}
        </div>
      </div>
      <div className="st-chat-foot">
        <ChatInput onSend={handleSend} members={membersQ.data?.members ?? []} />
      </div>
    </motion.aside>
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
  avatarLoading,
  children,
}: {
  who: string;
  mention: string;
  time: string;
  dateTime?: string;
  timeTitle?: string;
  tint: number;
  brand?: boolean;
  avatarLoading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className="st-msg"
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <UserAvatar name={who} tint={tint} size="sm" loading={avatarLoading} />
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
          <p>{typeof children === "string" ? renderMentions(children) : children}</p>
        </div>
      </div>
    </motion.div>
  );
}

function ChatInput({
  onSend,
  members = [],
}: {
  onSend: (body: string) => Promise<void>;
  members?: ChatMember[];
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [mention, setMention] = useState<{ at: number; query: string } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !sending;

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

  const updateMention = useCallback(
    (val: string, cursor: number | null) => {
      if (cursor == null) {
        setMention(null);
        return;
      }
      const m = detectMention(val, cursor);
      setMention(m);
      setMentionIndex(0);
    },
    [],
  );

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

  const send = async () => {
    const text = value.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await onSend(text);
      setValue("");
      setMention(null);
    } catch {
      // onSend already toasted + rolled back; keep the text for retry.
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
    // Multiline composer: Enter sends, Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <form className="st-chat-input" onSubmit={(e) => void submit(e)}>
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
      <Textarea
        ref={inputRef}
        rows={1}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          updateMention(v, e.target.selectionStart);
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
        placeholder="Type your message here…  @ to mention"
        aria-label="Send a message"
        aria-autocomplete="list"
        aria-expanded={!!mention && filtered.length > 0}
        aria-controls={mention ? "mention-list" : undefined}
        maxLength={2000}
        disabled={sending}
        autoComplete="off"
        className="max-h-32 min-h-9 resize-none py-2 pr-10 text-xs"
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
