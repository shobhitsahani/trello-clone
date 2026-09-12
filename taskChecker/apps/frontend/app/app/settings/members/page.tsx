"use client";

import { useState, useMemo, memo, startTransition } from "react";
import { useTenant } from "@/components/store";
import { useToast } from "@/components/overlay";
import { AppShell } from "@/components/app-shell";
import {
  IconPlus,
  IconSearch,
  IconUsers,
  IconMail,
  IconTrash,
  IconX,
  IconCopy,
  IconCheck,
  IconLink,
  IconClock,
} from "@/components/icons";
import { api, getCurrentTenantId, type Role } from "@/lib/api";
import { useAuth } from "@/lib/auth";
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

const AVATAR_TONES = ["emerald", "sky", "violet", "rose", "amber", "slate"] as const;

function avatarTone(key: string): (typeof AVATAR_TONES)[number] {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length] ?? "slate";
}

function initials(name: string | null, email: string | null): string {
  const src = (name ?? email ?? "?").trim();
  if (!src) return "?";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase() || "?";
  return src.slice(0, 2).toUpperCase();
}

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
  const canChangeRole = (targetRole: Role) =>
    (ROLE_HIERARCHY[currentUserRole] ?? 0) > (ROLE_HIERARCHY[targetRole] ?? 0);
  const tone = avatarTone(member.userId + (member.email ?? ""));
  const online = member.status === "active";
  const elevated = member.role === "owner" || member.role === "admin";

  return (
    <tr className="dir-row">
      <td className="dir-cell dir-cell-user">
        <div className="dir-user">
          <div className="dir-avatar-wrap">
            <span className={cx("dir-avatar", `dir-av-${tone}`)}>
              {initials(member.name, member.email)}
            </span>
            <span className={cx("dir-presence", online ? "is-on" : "is-off")} />
          </div>
          <div className="dir-user-meta">
            <p className="dir-user-name">
              {member.name ?? "Unknown"}
              {isSelf ? <span className="dir-you">You</span> : null}
            </p>
            <p className="dir-user-email mono">{member.email ?? "—"}</p>
          </div>
        </div>
      </td>
      <td className="dir-cell">
        {canManage && !isSelf ? (
          <select
            value={member.role}
            onChange={(e) => onRoleChange(member.userId, e.target.value as Role)}
            className={cx("dir-role-select", elevated ? "is-elevated" : "is-staff")}
            aria-label={`Role for ${member.email ?? member.name}`}
          >
            {ROLE_VALUES.filter((r) => canChangeRole(r) || r === member.role).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        ) : (
          <span className={cx("dir-role", elevated ? "is-elevated" : "is-staff")}>
            {ROLE_LABELS[member.role]}
          </span>
        )}
      </td>
      <td className="dir-cell">
        {member.status === "active" ? (
          <span className="dir-status is-on">
            <span className="dir-status-dot" /> Online
          </span>
        ) : member.status === "invited" ? (
          <span className="dir-status is-invited">
            <span className="dir-status-dot" /> Invited
          </span>
        ) : (
          <span className="dir-status is-off">
            <span className="dir-status-dot" /> Offline
          </span>
        )}
      </td>
      <td className="dir-cell">
        <span className="dir-tasks mono" title="Per-member task counts are not exposed by the API yet">
          —
        </span>
      </td>
      <td className="dir-cell dir-cell-actions">
        {!isSelf && member.status === "active" && canManage ? (
          <button className="dir-action" onClick={() => onDeactivate(member.userId)}>
            <IconTrash size={13} /> Remove
          </button>
        ) : isSelf ? (
          <span className="dim dir-hint">Current user</span>
        ) : !canManage ? (
          <span className="dim dir-hint">No access</span>
        ) : (
          <span className="dim dir-hint">—</span>
        )}
      </td>
    </tr>
  );
});

export default function MembersPage() {
  const { org } = useTenant();
  const { user } = useAuth();
  const toast = useToast();
  const orgId = getCurrentTenantId();
  const [search, setSearch] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [inviting, setInviting] = useState(false);
  // Last created invite — shown inline so the link can be copied/sent.
  // Links live 24h (backend-enforced); email delivery is intentionally
  // skipped, the inviter relays the link directly.
  const [lastInvite, setLastInvite] = useState<{ email: string; role: Role; url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const membersQ = useSWR<{ members: Member[] }>(
    orgId ? `members-${orgId}` : null,
    () => api.orgs.listMembers(orgId!),
  );
  const members = membersQ.data?.members ?? [];
  const currentUser = useMemo(
    () => members.find((m) => m.userId === user?.id),
    [members, user?.id]
  );
  const currentUserRole = currentUser?.role ?? "member";
  const currentUserId = currentUser?.userId;

  const activeCount = useMemo(() => members.filter((m) => m.status === "active").length, [members]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        (m.name ?? "").toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q) ||
        m.status.toLowerCase().includes(q)
    );
  }, [members, search]);

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!email || !orgId || inviting) return;
    setInviting(true);
    try {
      const res = await api.orgs.invite(orgId, { email, role: inviteRole });
      setLastInvite({ email: res.invite.email, role: res.invite.role, url: res.invitationUrl, expiresAt: res.invite.expiresAt });
      setCopied(false);
      setInviteEmail("");
      await membersQ.mutate();
      toast({ title: "Invite link ready", msg: `Send the link to ${email} — it expires in 24 hours.` });
    } catch (err) {
      toast({ title: "Invite failed", msg: err instanceof Error ? err.message : "Try again." });
    } finally {
      setInviting(false);
    }
  };

  const openInviteModal = () => {
    setLastInvite(null);
    setCopied(false);
    setShowInviteModal(true);
  };

  const handleCopyLink = async () => {
    if (!lastInvite) return;
    try {
      await navigator.clipboard.writeText(lastInvite.url);
      setCopied(true);
      toast({ title: "Copied", msg: "Invite link copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", msg: "Select the link and copy it manually." });
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
      <div className="page">
        <div className="dir-card">
          {/* Header — Stitch "Tenant Members & Team Directory" */}
          <div className="dir-head">
            <div className="dir-head-left">
              <div className="dir-head-icon">
                <IconUsers size={20} />
              </div>
              <div>
                <div className="dir-title-row">
                  <h1 className="dir-title">Tenant Members &amp; Team Directory</h1>
                  <span className="dir-badge-total">{members.length} Total</span>
                  <span className="dir-badge-active">
                    <span className="dir-pulse" />
                    {activeCount} active now
                  </span>
                </div>
                <p className="dir-sub">
                  Manage team access, permissions, seats, and workspace security roles
                  {org?.name ? ` · ${org.name}` : null}.
                </p>
              </div>
            </div>
          </div>

          {/* Toolbar — search + invite */}
          <div className="dir-toolbar">
            <div className="dir-search">
              <IconSearch size={15} />
              <input
                type="text"
                value={search}
                onChange={handleSearchChange}
                placeholder="Search members by name, role or email..."
                aria-label="Search members"
              />
            </div>
            <button className="btn btn-primary btn-sm dir-invite" onClick={openInviteModal}>
              <IconPlus size={14} /> Invite Member
            </button>
          </div>

          {/* Directory table */}
          <div className="dir-table-wrap">
            {membersQ.isLoading ? (
              <div className="loading">Loading members…</div>
            ) : filteredMembers.length === 0 ? (
              <div className="empty-state">
                <IconUsers size={32} className="dim" />
                <p>{search ? "No matching members" : "No members yet"}</p>
                {search ? null : (
                  <button className="btn btn-primary btn-sm" onClick={openInviteModal}>
                    <IconPlus size={14} /> Invite Member
                  </button>
                )}
              </div>
            ) : (
              <table className="dir-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Assigned Tasks</th>
                    <th className="dir-th-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
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
                </tbody>
              </table>
            )}
          </div>

          {/* Footer — counts */}
          <div className="dir-foot">
            <span>
              Showing {filteredMembers.length} {search ? "matching" : "active"} • {members.length} tenant
              member{members.length === 1 ? "" : "s"}
            </span>
            <span className="dim mono dir-foot-org">{org?.name ?? ""}</span>
          </div>
        </div>

        {showInviteModal ? (
          <div className="modal-backdrop" onClick={() => setShowInviteModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal aria-label="Invite member">
              <div className="modal-header dir-modal-head">
                <div className="dir-head-left">
                  <div className="dir-head-icon">
                    <IconMail size={18} />
                  </div>
                  <div>
                    <h3 className="modal-title">Invite member</h3>
                    <p className="modal-sub">They join {org?.name ?? "the workspace"} as {inviteRole}.</p>
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm btn-icon"
                  onClick={() => setShowInviteModal(false)}
                  aria-label="Close"
                >
                  <IconX size={15} />
                </button>
              </div>
              <div className="modal-body">
                {lastInvite ? (
                  <>
                    <div className="invite-success">
                      <span className="invite-success-icon">
                        <IconCheck size={16} />
                      </span>
                      <p>
                        Invite link ready for <strong>{lastInvite.email}</strong> ({lastInvite.role}).
                      </p>
                    </div>
                    <div className="form-field">
                      <label htmlFor="invite-link">Share this link — direct invite</label>
                      <div className="input-with-icon invite-link-row">
                        <IconLink size={16} />
                        <input id="invite-link" type="text" value={lastInvite.url} readOnly onFocus={(e) => e.target.select()} aria-label="Invite link" />
                        <button className="btn btn-secondary btn-sm" onClick={handleCopyLink} aria-label="Copy invite link">
                          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                          {copied ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <p className="field-hint">
                        <IconClock size={12} /> Expires{" "}
                        {new Date(lastInvite.expiresAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}{" "}
                        (24 hours). Send it to them however you like — chat, SMS, or your own email.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                <div className="form-field">
                  <label htmlFor="invite-email">Email</label>
                  <div className="input-with-icon">
                    <IconMail size={16} />
                    <input
                      id="invite-email"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="colleague@company.com"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleInvite();
                      }}
                    />
                  </div>
                </div>
                <div className="form-field">
                  <label htmlFor="invite-role">Role</label>
                  <select
                    id="invite-role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as Role)}
                    className="select"
                  >
                    {ROLE_VALUES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setShowInviteModal(false)}>
                  {lastInvite ? "Done" : "Cancel"}
                </button>
                {lastInvite ? (
                  <button className="btn btn-secondary" onClick={() => { setLastInvite(null); setCopied(false); }}>
                    <IconPlus size={14} /> Invite another
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={handleInvite} disabled={!inviteEmail.trim() || inviting}>
                    <IconMail size={14} /> {inviting ? "Creating…" : "Create invite link"}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
