"use client";

import { useMemo, memo, useState, startTransition } from "react";
import Link from "next/link";
import { useTenant } from "@/components/store";
import { useToast } from "@/components/overlay";
import { AppShell } from "@/components/app-shell";
import { IconPlus, IconSearch, IconFolder, IconUsers, IconFile } from "@/components/icons";
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
}: {
  project: Project;
  team: Team | null;
  tasks: Task[];
}) {
  const hue = hueFrom(project.key || project.id);
  const openCount = tasks.filter((t) => t.status !== "done").length;
  const doneCount = tasks.length - openCount;
  const totalCount = tasks.length;
  const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <Link href={`/app/board?project=${project.id}`} className="project-card">
      <div className="project-card-header">
        <div className="project-icon" style={{ background: `linear-gradient(150deg, hsl(${hue} 90% 62%), hsl(${hue} 75% 45%))` }}>
          <IconFolder size={20} />
        </div>
        <div className="project-info">
          <h3>{project.name}</h3>
          <span className="project-key">{project.key}</span>
        </div>
      </div>
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
              <IconFolder size={14} />
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
            <div className="empty-state">
              <IconFolder size={48} className="dim" />
              <h3>No projects found</h3>
              <p>{search ? "Try a different search term" : "Create your first project to get started"}</p>
              <button className="btn btn-primary" onClick={() => setShowNew(true)}>
                <IconPlus size={14} /> New project
              </button>
            </div>
          ) : (
            filteredProjects.map((project, i) => (
              <ProjectCard
                key={project.id}
                project={project}
                team={teams.find((t) => t.id === project.teamId) ?? null}
                tasks={taskPagesQ.data?.[i] ?? []}
              />
            ))
          )}
        </div>

        {showNew ? (
          <div className="modal-backdrop" onClick={() => setShowNew(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal aria-label="Create project">
              <div className="modal-header">
                <h3>New project</h3>
              </div>
              <div className="modal-body">
                <div className="form-field">
                  <label htmlFor="proj-name">Name</label>
                  <input id="proj-name" type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Launch" autoFocus />
                </div>
                <div className="form-field">
                  <label htmlFor="proj-key">Key (short code)</label>
                  <input id="proj-key" type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="LAU" maxLength={10} />
                  <p className="field-hint">Shown on task cards — 1-10 letters.</p>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={() => void handleCreate()} disabled={!newName.trim() || !newKey.trim()}>
                  <IconPlus size={14} /> Create project
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

