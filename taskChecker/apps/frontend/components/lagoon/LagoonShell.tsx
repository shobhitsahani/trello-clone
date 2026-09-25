/* Lagoon shell — joyful sidebar chrome ported from treloo-joyful-design.
   Ocean sidebar + workspace nav + boards list + new-board creation, backed
   by the real projects API. Also owns the ⌘K palette + notification sheet
   so Lagoon pages keep full app functionality. */

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useTenant } from "@/components/store";
import { useToast } from "@/components/overlay";
import { api, type Project } from "@/lib/api";
import { cx } from "@/lib/utils";
import {
  IconBoard,
  IconChevronDown,
  IconClock,
  IconFlowMark,
  IconLayers,
  IconPlus,
  IconUsers,
  IconX,
} from "@/components/icons";
import { suggestLagoonKey } from "./lagoon-utils";

/* ---------- chrome context (menu / palette / notifications) ---------- */

interface LagoonChrome {
  openMenu: () => void;
  openPalette: () => void;
  openNotifs: () => void;
  openNewBoard: () => void;
}

const LagoonChromeCtx = createContext<LagoonChrome>({
  openMenu: () => {},
  openPalette: () => {},
  openNotifs: () => {},
  openNewBoard: () => {},
});

export function useLagoonChrome(): LagoonChrome {
  return useContext(LagoonChromeCtx);
}

const DynamicCommandPalette = dynamic(
  () => import("@/components/command-palette").then((mod) => mod.CommandPalette),
  { loading: () => <div className="cmdk-loading">Loading…</div>, ssr: false },
);

const DynamicNotifSheet = dynamic(
  () => import("@/components/notif-sheet").then((mod) => mod.NotifSheet),
  { loading: () => null, ssr: false },
);

/** Route guard — Lagoon pages require a live session, like /app. */
function LagoonAuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/auth/sign-in");
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="lagoon" style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        {isLoading ? (
          <span style={{ color: "var(--lagoon-muted-fg)", fontSize: 13 }}>Loading session…</span>
        ) : (
          <a href="/auth/sign-in" className="lagoon-create-btn">
            <IconFlowMark size={14} /> Sign in to continue
          </a>
        )}
      </div>
    );
  }
  return <>{children}</>;
}

export interface LagoonShellProps {
  children: ReactNode;
  projects: Project[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  onProjectsChanged: () => Promise<unknown>;
}

export function LagoonShell({
  children,
  projects,
  activeProjectId,
  onSelectProject,
  onProjectsChanged,
}: LagoonShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const { org } = useTenant();
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [newBoardKey, setNewBoardKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [creating, setCreating] = useState(false);

  const openMenu = useCallback(() => setSidebarOpen(true), []);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const openNotifs = useCallback(() => setNotifOpen(true), []);
  const openNewBoard = useCallback(() => {
    setNewBoardName("");
    setNewBoardKey("");
    setKeyTouched(false);
    setNewBoardOpen(true);
    setSidebarOpen(true);
  }, []);

  // ⌘K / Ctrl+K toggles the command palette, like the main AppShell.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const effectiveKey = (keyTouched ? newBoardKey : suggestLagoonKey(newBoardName))
    .trim()
    .toUpperCase();

  const handleCreateBoard = useCallback(async () => {
    const name = newBoardName.trim();
    if (!name || !effectiveKey || creating) return;
    setCreating(true);
    try {
      const result = await api.projects.create({ name, key: effectiveKey });
      setNewBoardOpen(false);
      setNewBoardName("");
      setNewBoardKey("");
      setKeyTouched(false);
      await onProjectsChanged();
      onSelectProject(result.project.id);
      router.push(`/app/board?project=${result.project.id}`);
      toast({ title: "Board created", msg: `${name} is ready.` });
    } catch (err) {
      toast({ title: "Create failed", msg: err instanceof Error ? err.message : "Try again." });
    } finally {
      setCreating(false);
    }
  }, [newBoardName, effectiveKey, creating, onProjectsChanged, onSelectProject, router, toast]);

  const submitCreate = (e: FormEvent) => {
    e.preventDefault();
    void handleCreateBoard();
  };

  const orgInitial = (org?.name || "L").slice(0, 1).toUpperCase();

  const nav = [
    { href: "/app/board", label: "Boards", icon: IconBoard, on: pathname.startsWith("/app/board") },
    { href: "/app/projects", label: "Projects", icon: IconLayers, on: pathname.startsWith("/app/projects") },
    { href: "/app/board?view=calendar", label: "Calendar", icon: IconClock, on: false },
    { href: "/app/settings/members", label: "Members", icon: IconUsers, on: pathname.startsWith("/app/settings/members") },
  ];

  return (
    <LagoonAuthGate>
      <LagoonChromeCtx.Provider value={{ openMenu, openPalette, openNotifs, openNewBoard }}>
        <div className="lagoon lagoon-shell">
          {sidebarOpen ? (
            <button
              aria-label="Close menu"
              onClick={() => setSidebarOpen(false)}
              style={{ position: "fixed", inset: 0, zIndex: 30, background: "rgb(15 23 42 / 0.3)" }}
              className="lagoon-only-mobile"
            />
          ) : null}
          <aside className={cx("lagoon-side", !sidebarOpen && "is-closed")} aria-label="Workspace navigation">
            <div className="lagoon-side-brand">
              <span className="lagoon-side-mark">{orgInitial}</span>
              <span className="lagoon-display" style={{ fontSize: 15, fontWeight: 600 }}>
                {org?.name ?? "Lagoon"}
              </span>
              <button
                aria-label="Close menu"
                onClick={() => setSidebarOpen(false)}
                className="lagoon-icon-btn lagoon-only-mobile"
                style={{ marginLeft: "auto", color: "rgb(255 255 255 / 0.7)" }}
              >
                <IconX size={16} />
              </button>
            </div>
            <button
              className="lagoon-side-ws"
              title={user?.email ?? "Workspace"}
              onClick={() => router.push("/app/settings")}
            >
              <span
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 24,
                  height: 24,
                  borderRadius: 8,
                  background: "var(--lagoon-coral)",
                  fontSize: 10,
                  fontWeight: 700,
                  flex: "none",
                }}
              >
                {(user?.name || "T").slice(0, 1).toUpperCase()}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {org?.name ?? "Workspace"}
                </span>
                <span style={{ display: "block", fontSize: 10, color: "rgb(255 255 255 / 0.55)" }}>
                  {org?.plan ? `${org.plan} plan` : "Free plan"}
                </span>
              </span>
              <IconChevronDown size={12} />
            </button>

            <nav style={{ padding: "16px 12px 0" }}>
              <p className="lagoon-nav-label">Workspace</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {nav.map(({ href, label, icon: Icon, on }) => (
                  <Link
                    key={label}
                    href={href}
                    className={cx("lagoon-nav-link", on && "is-on")}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <Icon size={16} />
                    {label}
                  </Link>
                ))}
              </div>
            </nav>

            <div style={{ padding: "16px 12px 0", overflowY: "auto" }}>
              <p className="lagoon-nav-label">Boards</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSelectProject(p.id);
                      setSidebarOpen(false);
                      router.push(`/app/board?project=${p.id}`);
                    }}
                    className={cx("lagoon-board-link", p.id === activeProjectId && "is-on")}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 9999,
                        background: "var(--lagoon-teal)",
                        flex: "none",
                      }}
                    />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name}
                    </span>
                  </button>
                ))}
                {newBoardOpen ? (
                  <form onSubmit={submitCreate} className="lagoon-side-form" style={{ marginTop: 4 }}>
                    <input
                      autoFocus
                      aria-label="Board name"
                      value={newBoardName}
                      onChange={(e) => setNewBoardName(e.target.value)}
                      placeholder="Board name"
                    />
                    <input
                      aria-label="Board key"
                      value={keyTouched ? newBoardKey : suggestLagoonKey(newBoardName)}
                      onChange={(e) => {
                        setKeyTouched(true);
                        setNewBoardKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10));
                      }}
                      placeholder="KEY"
                      maxLength={10}
                      style={{ marginTop: 6, fontFamily: "var(--font-mono)" }}
                    />
                    <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                      <button type="submit" className="lagoon-btn" style={{ fontSize: 12, padding: "6px 12px" }} disabled={!newBoardName.trim() || !effectiveKey || creating}>
                        {creating ? "Creating…" : "Create"}
                      </button>
                      <button
                        type="button"
                        aria-label="Cancel"
                        className="lagoon-icon-btn"
                        style={{ color: "#fff" }}
                        onClick={() => setNewBoardOpen(false)}
                      >
                        <IconX size={16} />
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            </div>

            <div style={{ marginTop: "auto", padding: "12px 0 0" }}>
              <button className="lagoon-new-board-btn" onClick={() => setNewBoardOpen(true)}>
                <IconPlus size={16} /> New board
              </button>
            </div>
          </aside>

          <div className="lagoon-main">{children}</div>
        </div>

        {paletteOpen ? <DynamicCommandPalette onClose={() => setPaletteOpen(false)} /> : null}
        <DynamicNotifSheet open={notifOpen} onClose={() => setNotifOpen(false)} />
      </LagoonChromeCtx.Provider>
    </LagoonAuthGate>
  );
}
