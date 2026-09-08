"use client";

import { useState, useMemo, memo, startTransition } from "react";
import { useTenant } from "@/components/store";
import { useToast } from "@/components/overlay";
import { AppShell } from "@/components/app-shell";
import { IconPlus, IconSearch, IconUsers, IconShield, IconUser, IconMail, IconTrash, IconEdit, IconChevronRight } from "@/components/icons";
import { api, getCurrentTenantId, type Role } from "@/lib/api";
import { useSWR } from "@/lib/swr";
import { cx } from "@/lib/utils";

interface Member {
  userId: string;
  name: string | null;
  email: string | null;
  role: Role;
  status: "invited" | "active" | "deactivated";
}

const ROLE_VALUES: Role[] = ["owner", "admin", "member", "viewer"];
const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};
const ROLE_HIERARCHY: Record<Role, number> = { owner: 4, admin: 3, member: 2, viewer: 1 };

const MemberRow = memo(function MemberRow({
  member,
  currentUserRole,
  currentUserId,
  onRoleChange,
  onDeactivate,
}: {
  member: Member;
  currentUserRole: Role;
  currentUserId: string | undefined;
  onRoleChange: (userId: string, role: Role) => void;
  onDeactivate: (userId: string) => void;
}) {
  const isSelf = member.userId === currentUserId;
  const canManage = (ROLE_HIERARCHY[currentUserRole] ?? 0) > (ROLE_HIERARCHY[member.role] ?? 0);
  const canChangeRole = (targetRole: Role) => (ROLE_HIERARCHY[currentUserRole] ?? 0) > (ROLE_HIERARCHY[targetRole] ?? 0);

  return (
    <div className="member-row">
      <div className="member-info">
        <div className="member-avatar">
          {(member.name ?? member.email ?? "?").slice(0, 1).toUpperCase()}
        </div>
        <div className="member-details">
          <div className="member-name-row">
            <h4>{member.name ?? "Unknown"}</h4>
            {isSelf && <span className="you-badge">You</span>}
          </div>
          <p className="member-email">{member.email}</p>
          <span className={cx("status-badge", member.status)}>{member.status}</span>
        </div>
      </div>
      <div className="member-role">
        <select
          value={member.role}
          onChange={(e) => onRoleChange(member.userId, e.target.value as Role)}
          disabled={isSelf || !canChangeRole(member.role) || !canManage}
          className="role-select"
        >
          {ROLE_VALUES
            .filter((r) => canChangeRole(r) || r === member.role)
            .map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
        </select>
      </div>
      <div className="member-actions">
        {!isSelf && member.status === "active" && canManage ? (
          <button className="btn btn-ghost btn-sm btn-danger" onClick={() => onDeactivate(member.userId)}>
            <IconTrash size={14} /> Remove
          </button>
        ) : isSelf ? (
          <span className="dim">Current user</span>
        ) : !canManage ? (
          <span className="dim">Insufficient role</span>
        ) : null}
      </div>
    </div>
  );
});

export default function MembersPage() {
  const { org, orgs } = useTenant();
  const toast = useToast();
  const orgId = getCurrentTenantId();
  const [search, setSearch] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");

  const membersQ = useSWR<{ members: Member[] }>(
    orgId ? `members-${orgId}` : null,
    () => api.orgs.listMembers(orgId!),
  );
  const members = membersQ.data?.members ?? [];
  const currentUser = useMemo(
    () => members.find((m) => m.status === "active" && m.userId === getCurrentTenantId?.()),
    [members]
  );
  const currentUserRole = currentUser?.role ?? "member";
  const currentUserId = currentUser?.userId;

  const filteredMembers = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      (m.name ?? "").toLowerCase().includes(q) ||
      (m.email ?? "").toLowerCase().includes(q)
    );
  }, [members, search]);

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !orgId) return;
    try {
      await api.orgs.invite(orgId, { email: inviteEmail.trim(), role: inviteRole });
      setShowInviteModal(false);
      setInviteEmail("");
      await membersQ.mutate();
      toast({ title: "Invite sent", msg: `${inviteEmail} has been invited as ${inviteRole}` });
    } catch (err) {
      toast({ title: "Invite failed", msg: err instanceof Error ? err.message : "Try again." });
    }
  };

  const handleRoleChange = async (userId: string, role: Role) => {
    if (!orgId) return;
    try {
      await api.orgs.updateMemberRole(orgId, userId, role);
      await membersQ.mutate();
      toast({ title: "Role updated", msg: "Member role changed" });
    } catch (err) {
      toast({ title: "Update failed", msg: err instanceof Error ? err.message : "Try again." });
      await membersQ.mutate();
    }
  };

  const handleDeactivate = async (userId: string) => {
    if (!orgId) return;
    if (!confirm("Remove this member from the organization?")) return;
    try {
      await api.orgs.deactivateMember(orgId, userId);
      await membersQ.mutate();
      toast({ title: "Member removed", msg: "They can be re-invited later" });
    } catch (err) {
      toast({ title: "Remove failed", msg: err instanceof Error ? err.message : "Try again." });
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    startTransition(() => setSearch(e.target.value));
  };

  return (
    <AppShell>
      <div className="page settings-page">
        <header className="page-header">
          <div>
            <h1 className="page-title">Members</h1>
            <p className="page-subtitle">Manage members and roles in {org?.name ?? "your organization"}</p>
          </div>
          <div className="page-actions">
            <button className="btn btn-primary" onClick={() => setShowInviteModal(true)}>
              <IconPlus size={14} /> Invite member
            </button>
          </div>
        </header>

        <div className="settings-content">
          <div className="members-toolbar">
            <div className="search-box">
              <IconSearch size={16} />
              <input
                type="text"
                value={search}
                onChange={handleSearchChange}
                placeholder="Search members…"
              />
            </div>
          </div>

          <div className="member-list">
            <div className="member-list-header">
              <span>Member</span>
              <span>Role</span>
              <span>Status</span>
              <span />
            </div>
            {filteredMembers.map((member) => (
              <MemberRow
                key={member.userId}
                member={member}
                currentUserRole={currentUserRole}
                currentUserId={currentUserId}
                onRoleChange={handleRoleChange}
                onDeactivate={handleDeactivate}
              />
            ))}
            {filteredMembers.length === 0 ? (
              <div className="empty-state inline">
                <IconUsers size={32} className="dim" />
                <p>{search ? "No matching members" : "No members yet"}</p>
              </div>
            ) : null}
          </div>
        </div>

        {showInviteModal ? (
          <div className="modal-backdrop" onClick={() => setShowInviteModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal aria-label="Invite member">
              <div className="modal-header">
                <h3>Invite member</h3>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowInviteModal(false)} aria-label="Close">
                  <IconChevronRight size={14} />
                </button>
              </div>
              <div className="modal-body">
                <div className="form-field">
                  <label htmlFor="invite-email">Email</label>
                  <div className="input-with-icon">
                    <IconMail size={18} />
                    <input
                      id="invite-email"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="colleague@company.com"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="form-field">
                  <label htmlFor="invite-role">Role</label>
                  <select id="invite-role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)} className="select">
                    {ROLE_VALUES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setShowInviteModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleInvite} disabled={!inviteEmail.trim()}>
                  <IconMail size={14} /> Send invite
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}