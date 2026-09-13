// "use client"; // usage page commented out
// usage page disabled — uncomment to re-enable
"use client";

import { memo } from "react";
import { useTenant } from "@/components/store";
import { AppShell } from "@/components/app-shell";
import { IconUsers, IconFolder, IconZap, IconAlertCircle } from "@/components/icons";
import { api, getCurrentTenantId, type Plan } from "@/lib/api";
import { useSWR } from "@/lib/swr";
import { cx } from "@/lib/utils";

const PLAN_CATALOG: Record<Plan, { name: string; price: number; features: string[]; limits: Record<string, number> }> = {
  free: {
    name: "Free",
    price: 0,
    features: [
      "Up to 10 seats",
      "2 active projects",
      "1k API calls / day",
      "5 GB attachments",
      "Email notifications",
    ],
    limits: { seats: 10, activeProjects: 2, apiCallsPerDay: 1000, attachmentStorageGb: 5 },
  },
  pro: {
    name: "Pro",
    price: 29,
    features: [
      "Up to 50 seats",
      "50 active projects",
      "10k API calls / day",
      "100 GB attachments",
      "Webhooks + API keys",
      "Full-text search",
      "Realtime WebSocket notifications",
    ],
    limits: { seats: 50, activeProjects: 50, apiCallsPerDay: 10000, attachmentStorageGb: 100 },
  },
  business: {
    name: "Business",
    price: 99,
    features: [
      "Up to 1,000 seats",
      "1,000 active projects",
      "100k API calls / day",
      "1 TB attachments",
      "SSO (OIDC / SAML)",
      "Audit export + archive",
      "Priority webhook delivery",
    ],
    limits: { seats: 1000, activeProjects: 1000, apiCallsPerDay: 100000, attachmentStorageGb: 1024 },
  },
};

const UsageBar = memo(function UsageBar({ used, limit, label, unit = "" }: { used: number; limit: number; label: string; unit?: string }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const isOver = used > limit;
  const isNear = pct >= 80 && !isOver;

  return (
    <div className="usage-bar-row">
      <div className="usage-label">
        <span>{label}</span>
        <span className={cx("usage-value", isOver && "over", isNear && "near")}>
          {used.toLocaleString()}{unit} / {limit.toLocaleString()}{unit}
        </span>
      </div>
      <div className="usage-bar-track">
        <div
          className={cx("usage-bar-fill", isOver && "over", isNear && "near")}
          style={{ width: `${pct}%` }}
        />
      </div>
      {isOver && <IconAlertCircle size={14} className="usage-warning" title="Limit exceeded" />}
    </div>
  );
});

export default function UsagePage() {
  // // usage commented out — page returns placeholder
  // const { org } = useTenant();
  // const orgId = org?.id ?? getCurrentTenantId();
  // const plan = (org?.plan as Plan) ?? "free";
  // ... entire usage logic commented out ...
  return (
    <AppShell>
      <div className="page settings-page">
        <header className="page-header">
          <div>
            <h1 className="page-title">Usage</h1>
            <p className="page-subtitle">Usage tracking is currently disabled.</p>
          </div>
        </header>
        <div className="settings-content">
          <section className="settings-section">
            <h2>Current usage</h2>
            <p style={{ color: "var(--slate-500)" }}>Usage metering is commented out. Re-enable in <code>apps/backend/src/lib/usage.ts</code> and <code>apps/frontend/app/app/settings/usage/page.tsx</code>.</p>
          </section>
        </div>
      </div>
    </AppShell>
  );
  // original implementation commented out below for easy restore:
  // const { org } = useTenant();
  // const orgId = org?.id ?? getCurrentTenantId();
  // const plan = (org?.plan as Plan) ?? "free";
  // const catalog = PLAN_CATALOG[plan] ?? PLAN_CATALOG.free;
  // const limits = catalog.limits;
  // const usageQ = useSWR<{ plan: string; limits: Record<string, number>; month: Record<string, number> }>(
  //   orgId ? `usage-${orgId}` : null,
  //   () => api.usage.get(),
  // );
  // const usage = usageQ.data?.month ?? {};
  // const currentMembersQ = useSWR<{ members: Array<{ userId: string; status: string }> }>(
  //   orgId ? `usage-members-${orgId}` : null,
  //   () => api.orgs.listMembers(orgId!),
  // );
  // const activeMembers = (currentMembersQ.data?.members ?? []).filter((m) => m.status === "active").length;
  // const projectsQ = useSWR<{ projects: Array<{ deletedAt: string | null }> }>(
  //   orgId ? `usage-projects-${orgId}` : null,
  //   () => api.projects.list(orgId!),
  // );
  // const activeProjects = (projectsQ.data?.projects ?? []).filter((p) => !p.deletedAt).length;
  // const metrics = [
  //   { key: "seats", used: activeMembers, limit: limits.seats!, label: "Seats", icon: IconUsers },
  //   { key: "activeProjects", used: activeProjects, limit: limits.activeProjects!, label: "Active projects", icon: IconFolder },
  //   { key: "apiCallsPerDay", used: usage.api_calls ?? 0, limit: limits.apiCallsPerDay!, label: "API calls (today)", icon: IconZap },
  // ];
  // return ( <AppShell> ... </AppShell> );
}