"use client";

import { useMemo, memo, useState, useEffect, startTransition } from "react";
import Link from "next/link";
import { useTenant } from "@/components/store";
import { useToast, Modal } from "@/components/overlay";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { AppShell } from "@/components/app-shell";
import { IconPlus, IconSearch, IconLayers, IconUsers, IconFile, IconTrash, IconEdit } from "@/components/icons";
import { api, getCurrentTenantId, type Project, type Team, type Task } from "@/lib/api";
import { useSWR } from "@/lib/swr";
import { cx, hueFrom } from "@/lib/utils";

/**
 * rerender-memo: Memoize ProjectCard — only re-renders when project data changes
 */
const ProjectCard = memo(function ProjectCard({
  project,
  team,
  tasks,
  onContextMenu,
}: {
  project: Project;
  team: Team | null;
  tasks: Task[];
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const hue = hueFrom(project.key || project.id);
  const openCount = tasks.filter((t) => t.status !== "done").length;
  const doneCount = tasks.length - openCount;
  const totalCount = tasks.length;
  const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <Link
      href={`/app/board?project=${project.id}`}
      className="project-card trello-tile"
      onContextMenu={onContextMenu}
      title={`${project.name} — right-click for options`}
    >
      <div
        className="trello-tile-cover"
        style={{ background: `linear-gradient(135deg, hsl(${hue} 65% 52%), hsl(${(hue + 45) % 360} 60% 36%))` }}
      >
        <span className="trello-tile-key">{project.key}</span>
      </div>
      <div className="trello-tile-body">
        <h3>{project.name}</h3>
        <div className="project-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%`, background: `hsl(${hue} 75% 45%)` }} />
          </div>
          <span className="progress-text">{doneCount}/{totalCount} tasks · {progress}% complete</span>
        </div>
        <div className="project-meta">
          {team ? (
            <span className="project-team">
              <IconUsers size={13} /> {team.name}
            </span>
          ) : null}
          <span className="project-stats">
            <IconFile size={13} /> {openCount} open
          </span>
        </div>
      </div>
    </Link>
  );
});

export default function ProjectsPage() {
  const { org } = useTenant();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [projMenu, setProjMenu] = useState<{ x: number; y: number; project: Project } | null>(null);
  const [deletingProj, setDeletingProj] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [renamingProj, setRenamingProj] = useState<Project | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);

  const orgId = getCurrentTenantId();
  const projectsQ = useSWR<{ projects: Project[] }>(
    orgId ? `projects-projects-${orgId}` : null,
    () => api.projects.list(orgId!),
  );
  const teamsQ = useSWR<{ teams: Team[] }>(
    orgId ? `projects-teams-${orgId}` : null,
    () => api.teams.list(orgId!),
  );
  const projects = projectsQ.data?.projects ?? [];
  const teams = teamsQ.data?.teams ?? [];

  // Task counts per project — parallel fetches, keyed by project count+ids.
  const taskPagesQ = useSWR<Task[][]>(
    orgId && projects.length > 0 ? `projects-tasks-${orgId}-${projects.map((p) => p.id).join(",")}` : null,
    async () => {
      const pages = await Promise.all(projects.map((p) => api.tasks.list(orgId!, p.id, { limit: 100 })));
      return pages.map((page) => page.data);
    },
  );

  const handleCreate = async () => {
    if (!newName.trim() || !newKey.trim() || !orgId) return;
    try {
      await api.projects.create({ name: newName.trim(), key: newKey.trim().toUpperCase() });
      setShowNew(false);
      setNewName("");
      setNewKey("");
      await projectsQ.mutate();
      toast({ title: "Project created", msg: `${newName} is ready.` });
    } catch (err) {
      toast({ title: "Create failed", msg: err instanceof Error ? err.message : "Try again." });
    }
  };

  const openProjMenu = (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    setProjMenu({
      x: Math.min(e.clientX, window.innerWidth - 230),
      y: Math.min(e.clientY, window.innerHeight - 120),
      project,
    });
  };

  const handleDelete = async () => {
    if (!deletingProj || deleting) return;
    setDeleting(true);
    try {
      await api.projects.delete(deletingProj.id);
      setDeletingProj(null);
      setProjMenu(null);
      await projectsQ.mutate();
      toast({ title: "Project deleted", msg: `${deletingProj.name} was removed.` });
    } catch (err) {
      toast({ title: "Delete failed", msg: err instanceof Error ? err.message : "Try again." });
    } finally {
      setDeleting(false);
    }
  };

  const openRename = (project: Project) => {
    setRenamingProj(project);
    setRenameName(project.name);
    setProjMenu(null);
  };

  const handleRename = async () => {
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
      toast({ title: "Rename failed", msg: err instanceof Error ? err.message : "Try again." });
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

  // Memoize filtered projects to avoid re-filtering on every render
  const filteredProjects = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.key.toLowerCase().includes(q)
    );
  }, [projects, search]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    startTransition(() => {
      setSearch(e.target.value);
    });
  };

  const handleViewChange = (v: "grid" | "list") => {
    startTransition(() => {
      setView(v);
    });
  };

  return (
    <AppShell>
      <div className="page">
        <header className="page-header">
          <div>
            <h1 className="page-title">Projects</h1>
            <p className="page-subtitle">All projects in {org?.name ?? "your organization"}</p>
          </div>
          <div className="page-actions">
            <button className="btn btn-primary" onClick={() => setShowNew(true)}>
              <IconPlus size={14} /> New project
            </button>
          </div>
        </header>

        <div className="projects-toolbar">
          <div className="search-box">
            <IconSearch size={16} />
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder="Search projects…"
            />
          </div>
          <div className="view-toggle" role="group">
            <button className={cx("btn btn-ghost btn-sm", view === "grid" ? "active" : "")} onClick={() => handleViewChange("grid")} aria-label="Grid view">
              <IconLayers size={14} />
            </button>
            <button className={cx("btn btn-ghost btn-sm", view === "list" ? "active" : "")} onClick={() => handleViewChange("list")} aria-label="List view">
              <IconFile size={14} />
            </button>
          </div>
        </div>

        <div className={cx("projects-grid", view === "list" ? "list-view" : "")}>
          {projectsQ.isLoading ? (
            <div className="loading">Loading…</div>
          ) : filteredProjects.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconLayers />
                </EmptyMedia>
                <EmptyTitle>No projects found</EmptyTitle>
                <EmptyDescription>
                  {search ? "Try a different search term" : "Create your first project to get started"}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setShowNew(true)}>
                  <IconPlus size={14} /> New project
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            filteredProjects.map((project, i) => (
              <ProjectCard
                key={project.id}
                project={project}
                team={teams.find((t) => t.id === project.teamId) ?? null}
                tasks={taskPagesQ.data?.[i] ?? []}
                onContextMenu={(e) => openProjMenu(e, project)}
              />
            ))
          )}
        </div>

        <Modal
          open={showNew}
          onClose={() => setShowNew(false)}
          title="New project"
          sub="Shown in the sidebar and on the board. Pick a short key for task cards."
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button onClick={() => void handleCreate()} disabled={!newName.trim() || !newKey.trim()}>
                <IconPlus size={14} /> Create project
              </Button>
            </>
          }
        >
          <Field>
            <FieldLabel htmlFor="proj-name">Name</FieldLabel>
            <Input id="proj-name" type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Launch" autoFocus />
          </Field>
          <Field>
            <FieldLabel htmlFor="proj-key">Key (short code)</FieldLabel>
            <Input
              id="proj-key"
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
              placeholder="LAU"
              maxLength={10}
              className="mono"
            />
            <FieldDescription>Shown on task cards — 1-10 letters.</FieldDescription>
          </Field>
        </Modal>
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
              onClick={() => openRename(projMenu.project)}
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
                onClick={() => void handleRename()}
                disabled={renaming || !renameName.trim() || renameName.trim() === renamingProj?.name}
              >
                <IconEdit size={14} /> {renaming ? "Renaming…" : "Rename project"}
              </Button>
            </>
          }
        >
          <Field>
            <FieldLabel htmlFor="proj-rename">Name</FieldLabel>
            <Input
              id="proj-rename"
              type="text"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleRename();
              }}
              placeholder="Project name"
              maxLength={100}
              autoFocus
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
              <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
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
    </AppShell>
  );
}

