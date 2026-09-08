"use client";

/* Shell parts: icon rail, context bar, scope strip — wired to the real API.
   Projects/teams come from the tenant-scoped backend; the user block comes
   from the auth session. */

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTenant } from "./store";
import { useToast, Dropdown, MenuItem } from "./overlay";
import { Avatar, Kbd } from "./ui";
import { useAuth } from "../lib/auth";
import { api, getCurrentTenantId } from "../lib/api";
import { useSWR } from "../lib/swr";
import { cx, hueFrom } from "../lib/utils";
import {
  IconBell,
  IconBoard,
  IconChevronDown,
  IconFile,
  IconFlowMark,
  IconFolder,
  IconLogout,
  IconPulse,
  IconSearch,
  IconSettings,
  IconUsers,
  IconWork,
} from "./icons";

const NAV = [
  { href: "/app/work", label: "Your work", icon: IconWork },
  { href: "/app/board", label: "Board", icon: IconBoard },
  { href: "/app/projects", label: "Projects", icon: IconFolder },
  { href: "/app/teams", label: "Teams", icon: IconUsers },
  { href: "/app/activity", label: "Activity", icon: IconPulse },
] as const;

/* ---------- icon rail ---------- */

export function Rail() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const toast = useToast();

  const goTo = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router],
  );

  return (
    <nav className="rail" aria-label="Primary">
      <Link href="/" className="rail-glyph" title="TeamFlow home">
        <IconFlowMark size={19} />
      </Link>
      <span className="rail-sep" aria-hidden="true" />
      <button
        className={cx("rail-btn", (pathname.startsWith("/app/work") || pathname.startsWith("/app/board")) && "is-on")}
        onClick={() => goTo("/app/work")}
        aria-label="Your work"
        title="Your work"
      >
        <IconWork size={19} />
      </button>
      <button
        className={cx("rail-btn", pathname.startsWith("/app/board") && "is-on")}
        onClick={() => goTo("/app/board")}
        aria-label="Board"
        title="Board"
      >
        <IconBoard size={19} />
      </button>
      <button
        className="rail-btn"
        onClick={() => goTo("/app/activity")}
        aria-label="Notifications"
        title="Inbox"
      >
        <IconBell size={19} />
      </button>
      <button
        className="rail-btn"
        onClick={() => goTo("/app/activity")}
        aria-label="Search"
        title="Search  (⌘K)"
      >
        <IconSearch size={19} />
      </button>
      <span className="grow" />
      <button
        className="rail-btn rail-me"
        aria-label="Account"
        title={user?.name ?? "Account"}
      >
        <Avatar name={user?.name ?? "You"} size="sm" accent />
      </button>
      <button
        className="rail-btn"
        aria-label="Sign out"
        title="Sign out"
        onClick={async () => {
          await logout();
          toast({ title: "Signed out", msg: "Session ended — see you soon." });
          router.push("/auth/sign-in");
        }}
      >
        <IconLogout size={19} />
      </button>
    </nav>
  );
}

/* ---------- org glyph ---------- */

function OrgGlyph({ org, size = 30 }: { org: { name: string; slug: string; hue: number }; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        display: "grid",
        placeItems: "center",
        fontWeight: 750,
        fontSize: size * 0.36,
        letterSpacing: "-0.03em",
        color: `hsl(${org.hue} 60% 14%)`,
        background: `linear-gradient(150deg, hsl(${org.hue} 90% 62%), hsl(${org.hue} 75% 45%))`,
        flex: "none",
      }}
    >
      {(org.name || org.slug || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

/* ---------- context bar ---------- */

type ApiTeam = { tenantId: string; id: string; name: string; createdAt: string };
type ApiProject = { tenantId: string; id: string; teamId: string | null; name: string; key: string; createdAt: string };

export function ContextBar() {
  const pathname = usePathname();
  const { org, orgs, setOrg } = useTenant();
  const { user } = useAuth();
  const orgId = getCurrentTenantId();

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

  const projects = projectsQ.data?.projects ?? [];
  const teams = teamsQ.data?.teams ?? [];
  const me = useMemo(
    () => ({
      name: user?.name ?? "You",
      email: user?.email ?? "",
      role: org?.role ?? "member",
      tint: hueFrom(user?.id ?? "you"),
    }),
    [user, org],
  );

  return (
    <aside className="ctx" aria-label="Context">
      <Dropdown
        align="left"
        width={240}
        trigger={() => (
          <button className="ctx-org" aria-label="Switch organization">
            {org ? <OrgGlyph org={org} /> : null}
            <span className="grow" style={{ textAlign: "left", minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {org?.name ?? "No organization"}
              </span>
              <span className="ctx-tenant">{org?.plan ?? ""}</span>
            </span>
            <IconChevronDown size={14} className="dim" />
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
                <OrgGlyph org={o} size={22} />
                <span className="grow">{o.name}</span>
                {o.id === org?.id ? <span className="cmdk-hint">current</span> : null}
              </MenuItem>
            ))}
            {orgs.length === 0 ? <div className="menu-label">No memberships</div> : null}
          </>
        )}
      </Dropdown>


      <div className="ctx-section">Projects</div>
      <div className="ctx-list">
        {projects.slice(0, 8).map((project) => {
          const hue = hueFrom(project.key || project.id);
          const href = `/app/board?project=${project.id}`;
          const active = pathname === href;
          return (
            <Link key={project.id} href={href} className={cx("ctx-item", active && "ctx-item-active")}>
              <span className="ctx-icon" style={{ color: `hsl(${hue} 80% 70%)` }}>
                <IconFile size={14} />
              </span>
              <span
                className="grow"
                style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {project.name}
              </span>
              <span className="ctx-count">{project.key}</span>
            </Link>
          );
        })}
        {projects.length === 0 ? (
          <span className="ctx-tenant" style={{ padding: "4px 10px", display: "block" }}>
            {projectsQ.isLoading ? "Loading…" : "No projects yet"}
          </span>
        ) : null}
      </div>

      <div className="ctx-section">Teams</div>
      <div className="ctx-list">
        {teams.map((t) => (
          <Link key={t.id} href="/app/teams" className="ctx-item">
            <span className="ctx-icon">
              <IconUsers size={14} />
            </span>
            <span className="grow">{t.name}</span>
          </Link>
        ))}
        {teams.length === 0 ? (
          <span className="ctx-tenant" style={{ padding: "4px 10px", display: "block" }}>
            {teamsQ.isLoading ? "Loading…" : "No teams yet"}
          </span>
        ) : null}
      </div>

      <span className="ctx-spacer" />

      <div className="ctx-foot">
        <Dropdown
          align="left"
          width={230}
          trigger={() => (
            <button className="ctx-user" aria-label="Account menu">
              <Avatar name={me.name} tint={me.tint} size="sm" />
              <span className="grow">
                <span style={{ display: "block", fontWeight: 600, fontSize: 13 }}>{me.name}</span>
                <span className="ctx-tenant">{me.email}</span>
              </span>
            </button>
          )}
        >
          {(close) => (
            <>
              <div className="menu-label">{me.role} · signed in</div>
              <MenuItem
                onSelect={() => {
                  close();
                  window.location.assign("/app/settings");
                }}
              >
                <IconSettings size={14} />
                Organization settings
              </MenuItem>
            </>
          )}
        </Dropdown>
      </div>
    </aside>
  );
}

/* ---------- scope strip ---------- */

export function ScopeStrip({
  onOpenPalette,
  onOpenNotifs,
}: {
  onOpenPalette: () => void;
  onOpenNotifs: () => void;
}) {
  const { org, unread } = useTenant();
  return (
    <div className="scope">
      <span className="scope-stamp">
        <span className="sync-dot" aria-hidden />
        {org ? `${org.slug} · live` : "no tenant"}
      </span>
      <button className="scope-search" onClick={onOpenPalette} aria-label="Search or jump to">
        <IconSearch size={13} />
        <span className="grow" style={{ textAlign: "left" }}>
          Search or jump to…
        </span>
        <Kbd>⌘K</Kbd>
      </button>
      <div className="scope-right">
        <button
          className="scope-btn"
          onClick={onOpenNotifs}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <IconBell size={17} />
          {unread > 0 ? <span className="rail-dot" aria-hidden /> : null}
        </button>
        <Link href="/app/settings" className="scope-btn" aria-label="Settings">
          <IconSettings size={17} />
        </Link>
      </div>
    </div>
  );
}
