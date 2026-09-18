"use client";

import { useMemo, useState, startTransition } from "react";
import { useTenant } from "@/components/store";
import { Modal, useToast } from "@/components/overlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { AppShell } from "@/components/app-shell";
import { IconPlus, IconSearch, IconUsers } from "@/components/icons";
import { api, getCurrentTenantId, type Project, type Team } from "@/lib/api";
import { useSWR } from "@/lib/swr";

/**
 * TeamCard — real Team rows carry only { id, name, createdAt }; show the
 * project count grouped under the team instead of member avatars.
 */
function TeamCard({ team, projects }: { team: Team; projects: Project[] }) {
  const teamProjects = projects.filter((p) => p.teamId === team.id);

  return (
    <div className="team-card">
      <div className="team-card-header">
        <div className="team-avatar">
          <IconUsers size={24} />
        </div>
        <div className="team-info">
          <h3>{team.name}</h3>
          <p className="team-meta">
            {teamProjects.length} project{teamProjects.length !== 1 ? "s" : ""} · created {new Date(team.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>
      {teamProjects.length > 0 ? (
        <div className="team-members">
          {teamProjects.slice(0, 4).map((p) => (
            <span key={p.id} className="member-avatar more" title={p.name}>
              {p.key.slice(0, 2)}
            </span>
          ))}
          {teamProjects.length > 4 ? (
            <span className="member-avatar more">+{teamProjects.length - 4}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function TeamsPage() {
  const { org } = useTenant();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");

  const orgId = getCurrentTenantId();
  const teamsQ = useSWR<{ teams: Team[] }>(
    orgId ? `teams-teams-${orgId}` : null,
    () => api.teams.list(orgId!),
  );
  const projectsQ = useSWR<{ projects: Project[] }>(
    orgId ? `teams-projects-${orgId}` : null,
    () => api.projects.list(orgId!),
  );
  const teams = teamsQ.data?.teams ?? [];
  const projects = projectsQ.data?.projects ?? [];

  const handleCreate = async () => {
    if (!newName.trim() || !orgId) return;
    try {
      await api.teams.create(orgId, newName.trim());
      setShowNew(false);
      setNewName("");
      await teamsQ.mutate();
      toast({ title: "Team created", msg: `${newName} is ready.` });
    } catch (err) {
      toast({ title: "Create failed", msg: err instanceof Error ? err.message : "Try again." });
    }
  };

  const filteredTeams = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return teams;
    return teams.filter((t) => t.name.toLowerCase().includes(q));
  }, [teams, search]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    startTransition(() => {
      setSearch(e.target.value);
    });
  };

  return (
    <AppShell>
      <div className="page">
        <header className="page-header">
          <div>
            <h1 className="page-title">Teams</h1>
            <p className="page-subtitle">All teams in {org?.name ?? "your organization"}</p>
          </div>
          <div className="page-actions">
            <Button onClick={() => setShowNew(true)}>
              <IconPlus size={14} /> New team
            </Button>
          </div>
        </header>

        <div className="teams-toolbar">
          <div className="search-box">
            <IconSearch size={16} />
            <Input
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder="Search teams…"
              className="border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

        <div className="teams-grid">
          {teamsQ.isLoading ? (
            <div className="loading">Loading…</div>
          ) : filteredTeams.length === 0 ? (
            <div className="empty-state">
              <IconUsers size={48} className="dim" />
              <h3>No teams found</h3>
              <p>{search ? "Try a different search term" : "Create your first team to get started"}</p>
              <Button onClick={() => setShowNew(true)}>
                <IconPlus size={14} /> New team
              </Button>
            </div>
          ) : (
            filteredTeams.map((team) => <TeamCard key={team.id} team={team} projects={projects} />)
          )}
        </div>

        <Modal
          open={showNew}
          onClose={() => setShowNew(false)}
          title="New team"
          sub="Group projects under a team."
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button onClick={() => void handleCreate()} disabled={!newName.trim()}>
                <IconPlus size={14} /> Create team
              </Button>
            </>
          }
        >
          <Field>
            <FieldLabel htmlFor="team-name">Team name</FieldLabel>
            <Input
              id="team-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Platform"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
              }}
            />
          </Field>
        </Modal>
      </div>
    </AppShell>
  );
}
