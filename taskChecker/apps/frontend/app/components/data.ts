/* TeamFlow — demo data for the design comp. Static, typed, per-tenant. */

export type Status = "backlog" | "progress" | "review" | "done";
export type Priority = "urgent" | "high" | "medium" | "low";
export type Role = "Owner" | "Admin" | "Member" | "Viewer";
export type Tab = "usage" | "members" | "audit" | "integrations";
export type EventKind =
  | "move"
  | "comment"
  | "assign"
  | "send"
  | "key"
  | "invite"
  | "due"
  | "done";

export interface Ticket {
  id: string;
  title: string;
  status: Status;
  priority: Priority;
  due?: string;
  comments: number;
  clips: number;
  who: string;
}

export interface FlowEvent {
  t: string;
  kind: EventKind;
  text: string;
}

export interface Member {
  name: string;
  email: string;
  role: Role;
  online?: boolean;
  last?: string;
}

export interface UsageCell {
  label: string;
  used: number;
  cap: number;
  unit?: string;
  decimals?: number;
}

export interface AuditRow {
  t: string;
  who: string;
  what: string;
}

export interface Org {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: Role;
  hue: number;
  sat: number;
  lig: number;
  teams: { name: string; active: number }[];
  project: { name: string; key: string; desc: string; stage: string };
  tickets: Ticket[];
  events: FlowEvent[];
  members: Member[];
  usage: UsageCell[];
  feats: string[];
  audit: AuditRow[];
  hooks: {
    url: string;
    triggers: string;
    last: string;
    since: string;
    delivered: string;
  }[];
  keys: { name: string; mask: string; scopes: string; last: string }[];
}

export const ME = "Priya Raman";

export const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Med",
  low: "Low",
};

export const TABS: {
  key: Tab;
  label: string;
  icon: "zap" | "users" | "list" | "webhook";
}[] = [
  { key: "usage", label: "Usage", icon: "zap" },
  { key: "members", label: "Members", icon: "users" },
  { key: "audit", label: "Audit log", icon: "list" },
  { key: "integrations", label: "Webhooks & keys", icon: "webhook" },
];

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function hueOf(name: string): number {
  let h = 7;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/* ---------------- tenants ---------------- */

export const ORGS: Org[] = [
 {
    id: "northwind",
    name: "Northwind Studio",
    slug: "northwind",
    plan: "Pro",
    role: "Owner",
    hue: 38,
    sat: 100,
    lig: 56,
    teams: [
      { name: "Design systems", active: 2 },
      { name: "Platform", active: 3 },
      { name: "Growth", active: 1 },
    ],
    project: {
      name: "Aurora",
      key: "AUR",
      desc: "Design system v2",
      stage: "On track",
    },
    tickets: [
      { id: "AUR-214", title: "Token pipeline export to Figma variables", status: "progress", priority: "high", due: "Fri", comments: 3, clips: 1, who: "Priya Raman" },
      { id: "AUR-221", title: "Contrast audit: AA on mid-tone pairs", status: "progress", priority: "high", comments: 5, clips: 0, who: "Marco Ibarra" },
      { id: "AUR-198", title: "Migrate legacy palette tokens", status: "review", priority: "medium", comments: 11, clips: 2, who: "Sofia Alvarez" },
      { id: "AUR-207", title: "Dark-mode elevation ramp", status: "review", priority: "medium", comments: 4, clips: 0, who: "Jules Park" },
      { id: "AUR-232", title: "Typography scale v3 proposal", status: "backlog", priority: "medium", comments: 2, clips: 0, who: "Marco Ibarra" },
      { id: "AUR-240", title: "Motion token debugger", status: "backlog", priority: "high", comments: 1, clips: 0, who: "Priya Raman" },
      { id: "AUR-209", title: "Icon set: optical fixes at 24px", status: "backlog", priority: "low", comments: 0, clips: 0, who: "Jules Park" },
      { id: "AUR-187", title: "Publish migration guide", status: "done", priority: "low", comments: 6, clips: 1, who: "Omar Virtanen" },
      { id: "AUR-233", title: "Retire deprecated aliases", status: "done", priority: "medium", comments: 3, clips: 0, who: "Sofia Alvarez" },
    ],
    events: [
      { t: "09:41", kind: "move", text: "AUR-221 moved to In progress — Priya" },
      { t: "09:38", kind: "comment", text: "Sofia commented on AUR-198" },
      { t: "09:31", kind: "assign", text: "AUR-232 assigned to Marco — Omar" },
      { t: "09:24", kind: "send", text: "Webhook task.updated delivered · 200 in 84 ms" },
      { t: "09:12", kind: "invite", text: "Marco joined Aurora — invite accepted" },
      { t: "09:04", kind: "key", text: "API key ci-deploy rotated — Priya" },
      { t: "08:58", kind: "due", text: "AUR-214 due date set to Fri — Priya" },
    ],
    members: [
      { name: "Priya Raman", email: "priya@northwind.studio", role: "Owner", online: true, last: "now" },
      { name: "Sofia Alvarez", email: "sofia@northwind.studio", role: "Admin", online: true, last: "2 m" },
      { name: "Marco Ibarra", email: "marco@northwind.studio", role: "Member", online: true, last: "6 m" },
      { name: "Jules Park", email: "jules@northwind.studio", role: "Member", last: "1 h" },
      { name: "Omar Virtanen", email: "omar@northwind.studio", role: "Viewer", last: "3 h" },
    ],
    usage: [
      { label: "API calls", used: 4214, cap: 5000 },
      { label: "Queued jobs", used: 1204, cap: 10000 },
      { label: "Storage", used: 12.6, cap: 20, unit: "GB", decimals: 1 },
    ],
    feats: [
      "5,000 API calls / mo",
      "20 GB attachments",
      "Priority event delivery",
      "Audit log — 12-month retention",
    ],
    audit: [
      { t: "09:41", who: "P. Raman", what: "Moved AUR-221 to In progress" },
      { t: "09:38", who: "S. Alvarez", what: "Commented on AUR-198" },
      { t: "09:31", who: "O. Virtanen", what: "Assigned AUR-232 to M. Ibarra" },
      { t: "09:12", who: "P. Raman", what: "Invite accepted — M. Ibarra joined" },
      { t: "09:04", who: "P. Raman", what: "Rotated API key “ci-deploy”" },
      { t: "08:58", who: "P. Raman", what: "Set due date AUR-214 → Fri" },
    ],
    hooks: [
      {
        url: "https://hooks.northwind.studio/engine",
        triggers: "task.updated · comment.created",
        last: "200 in 84 ms",
        since: "2 m ago",
        delivered: "3.2k this month",
      },
    ],
    keys: [
      { name: "ci-deploy", mask: "tfk_live_••••3f2a", scopes: "tasks.write · comments.read", last: "20 m ago" },
      { name: "staging", mask: "tfk_live_••••c90b", scopes: "read-only", last: "never used" },
    ],
  },
{
    id: "relay",
    name: "Relay Systems",
    slug: "relay-systems",
    plan: "Business",
    role: "Admin",
    hue: 187,
    sat: 92,
    lig: 56,
    teams: [
      { name: "Core", active: 3 },
      { name: "Integrations", active: 2 },
      { name: "Fleet", active: 1 },
    ],
    project: {
      name: "Signal",
      key: "SIG",
      desc: "Edge device fleet API",
      stage: "At risk",
    },
    tickets: [
      { id: "SIG-118", title: "Reconnect policy: backoff ladder", status: "progress", priority: "high", due: "Thu", comments: 8, clips: 0, who: "Aiko Tanaka" },
      { id: "SIG-121", title: "Ingest schema v3 migration", status: "review", priority: "high", comments: 14, clips: 1, who: "Ben Okafor" },
      { id: "SIG-104", title: "Rate-limit 429 response contract", status: "backlog", priority: "medium", comments: 3, clips: 0, who: "Cass Reyes" },
      { id: "SIG-129", title: "OTLP exporter for fleet events", status: "backlog", priority: "low", comments: 0, clips: 0, who: "Aiko Tanaka" },
      { id: "SIG-097", title: "Ship 2.4 changelog", status: "done", priority: "medium", comments: 2, clips: 0, who: "Ben Okafor" },
    ],
    events: [
      { t: "10:02", kind: "assign", text: "SIG-118 reassigned to Aiko — Priya" },
      { t: "09:55", kind: "comment", text: "Cass commented on SIG-104" },
      { t: "09:47", kind: "send", text: "Webhook identity.events delivered · 202 in 61 ms" },
      { t: "09:40", kind: "key", text: "API key fleet-read created — Aiko" },
      { t: "09:22", kind: "done", text: "SIG-097 moved to Done — Ben" },
      { t: "09:03", kind: "invite", text: "Priya accepted invitation — role Admin" },
    ],
    members: [
      { name: "Aiko Tanaka", email: "aiko@relaysys.io", role: "Owner", online: true, last: "now" },
      { name: "Priya Raman", email: "priya@relaysys.io", role: "Admin", online: true, last: "now" },
      { name: "Ben Okafor", email: "ben@relaysys.io", role: "Member", online: true, last: "4 m" },
      { name: "Cass Reyes", email: "cass@relaysys.io", role: "Viewer", last: "22 m" },
    ],
    usage: [
      { label: "API calls", used: 8940, cap: 10000 },
      { label: "Queued jobs", used: 6221, cap: 25000 },
      { label: "Storage", used: 18.1, cap: 40, unit: "GB", decimals: 1 },
    ],
    feats: [
      "10,000 API calls / mo",
      "40 GB attachments",
      "SSO + SCIM provisioning",
      "Per-tenant aggregate rate limits",
    ],
    audit: [
      { t: "10:02", who: "P. Raman", what: "Reassigned SIG-118 to A. Tanaka" },
      { t: "09:55", who: "C. Reyes", what: "Commented on SIG-104" },
      { t: "09:40", who: "A. Tanaka", what: "Created API key “fleet-read”" },
      { t: "09:22", who: "B. Okafor", what: "Moved SIG-097 to Done" },
      { t: "09:03", who: "A. Tanaka", what: "Set role Admin for P. Raman" },
    ],
    hooks: [
      {
        url: "https://ops.relaysys.io/hooks/teamflow",
        triggers: "task.updated · task.deleted",
        last: "202 in 61 ms",
        since: "15 m ago",
        delivered: "9.8k this month",
      },
    ],
    keys: [
      { name: "fleet-read", mask: "tfk_live_••••81ce", scopes: "tasks.read", last: "9 m ago" },
      { name: "ingest-ci", mask: "tfk_live_••••40d2", scopes: "tasks.write", last: "1 h ago" },
    ],
  },
{
    id: "mantle",
    name: "Mantle Health",
    slug: "mantle-health",
    plan: "Pro",
    role: "Member",
    hue: 258,
    sat: 82,
    lig: 66,
    teams: [
      { name: "Care ops", active: 2 },
      { name: "Data", active: 2 },
    ],
    project: {
      name: "Referral flow",
      key: "REF",
      desc: "Clinic referral pipeline",
      stage: "On track",
    },
    tickets: [
      { id: "REF-034", title: "Pending referral timeout nudges", status: "progress", priority: "high", due: "Wed", comments: 4, clips: 0, who: "Dana Whitfield" },
      { id: "REF-041", title: "Scheduling conflict guard", status: "progress", priority: "medium", comments: 2, clips: 1, who: "Eli Voss" },
      { id: "REF-033", title: "SMS fallback when email bounces", status: "backlog", priority: "high", comments: 6, clips: 0, who: "Dana Whitfield" },
      { id: "REF-027", title: "Bulk import: FHIR CSV", status: "backlog", priority: "low", comments: 1, clips: 0, who: "Eli Voss" },
      { id: "REF-021", title: "Launch checklist sign-off", status: "done", priority: "low", comments: 9, clips: 2, who: "Kira Ngo" },
    ],
    events: [
      { t: "08:57", kind: "comment", text: "Eli commented on REF-041" },
      { t: "08:49", kind: "move", text: "REF-034 moved to In progress — Dana" },
      { t: "08:31", kind: "send", text: "Webhook referral.opened delivered · 200 in 43 ms" },
      { t: "08:18", kind: "due", text: "REF-033 due date set to next Tue — Kira" },
      { t: "07:52", kind: "done", text: "REF-021 moved to Done — Kira" },
    ],
    members: [
      { name: "Dana Whitfield", email: "dana@mantlehealth.org", role: "Owner", online: true, last: "12 m" },
      { name: "Eli Voss", email: "eli@mantlehealth.org", role: "Member", online: true, last: "3 m" },
      { name: "Kira Ngo", email: "kira@mantlehealth.org", role: "Member", last: "1 d" },
      { name: "Priya Raman", email: "priya@mantlehealth.org", role: "Member", online: true, last: "now" },
    ],
    usage: [
      { label: "API calls", used: 1102, cap: 5000 },
      { label: "Queued jobs", used: 340, cap: 10000 },
      { label: "Storage", used: 3.2, cap: 20, unit: "GB", decimals: 1 },
    ],
    feats: [
      "5,000 API calls / mo",
      "20 GB attachments",
      "Priority event delivery",
      "Audit log — 12-month retention",
    ],
    audit: [
      { t: "08:57", who: "E. Voss", what: "Commented on REF-041" },
      { t: "08:49", who: "D. Whitfield", what: "Moved REF-034 to In progress" },
      { t: "08:18", who: "K. Ngo", what: "Set due date REF-033" },
      { t: "07:52", who: "K. Ngo", what: "Moved REF-021 to Done" },
      { t: "Yesterday", who: "D. Whitfield", what: "Invited P. Raman — role Member" },
    ],
    hooks: [
      {
        url: "https://ehr.mantlehealth.org/hooks/referrals",
        triggers: "comment.created",
        last: "200 in 43 ms",
        since: "26 m ago",
        delivered: "740 this month",
      },
    ],
    keys: [
      { name: "referral-sync", mask: "tfk_live_••••aa17", scopes: "tasks.read · comments.read", last: "2 h ago" },
    ],
  },
];