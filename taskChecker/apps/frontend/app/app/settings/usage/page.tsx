"use client";

import { useMemo, memo } from "react";
import { useTenant } from "@/components/store";
import { AppShell } from "@/components/app-shell";
import { IconCreditCard, IconUsers, IconFolder, IconZap, IconCheck, IconAlertCircle, IconInfo } from "@/components/icons";
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

const METRIC_LABELS: Record<string, string> = {
  api_calls: "API calls",
  searches: "Search queries",
  attachments_uploaded: "Attachments uploaded",
  webhooks_delivered: "Webhooks delivered",
  emails_sent: "Emails sent",
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
  const { org } = useTenant();
  const orgId = getCurrentTenantId();
  const plan = (org?.plan as Plan) ?? "free";
  const catalog = PLAN_CATALOG[plan] ?? PLAN_CATALOG.free;
  const limits = catalog.limits;

  const usageQ = useSWR<{ plan: string; limits: Record<string, number>; month: Record<string, number> }>(
    orgId ? `usage-${orgId}` : null,
    () => api.usage.get(),
  );
  const usage = usageQ.data?.month ?? {};

  const currentMembersQ = useSWR<{ members: Array<{ userId: string; status: string }> }>(
    orgId ? `usage-members-${orgId}` : null,
    () => api.orgs.listMembers(orgId!),
  );
  const activeMembers = (currentMembersQ.data?.members ?? []).filter((m) => m.status === "active").length;

  const projectsQ = useSWR<{ projects: Array<{ deletedAt: string | null }> }>(
    orgId ? `usage-projects-${orgId}` : null,
    () => api.projects.list(orgId!),
  );
  const activeProjects = (projectsQ.data?.projects ?? []).filter((p) => !p.deletedAt).length;

  const metrics = [
    { key: "seats", used: activeMembers, limit: limits.seats!, label: "Seats", icon: IconUsers },
    { key: "activeProjects", used: activeProjects, limit: limits.activeProjects!, label: "Active projects", icon: IconFolder },
    { key: "apiCallsPerDay", used: usage.api_calls ?? 0, limit: limits.apiCallsPerDay!, label: "API calls (today)", icon: IconZap },
  ];

  return (
    <AppShell>
      <div className="page settings-page">
        <header className="page-header">
          <div>
            <h1 className="page-title">Usage & Plan</h1>
            <p className="page-subtitle">Current plan: {catalog.name} — ${catalog.price}/month</p>
          </div>
        </header>

        <div className="settings-content">
          <section className="settings-section">
            <h2>Current usage</h2>
            <div className="usage-grid">
              {metrics.map((m) => (
                <div key={m.key} className="usage-card">
                  <div className="usage-card-icon">
                    <m.icon size={20} />
                  </div>
                  <UsageBar
                    used={m.used}
                    limit={m.limit}
                    label={m.label}
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <h2>All metrics (this month)</h2>
            <div className="metrics-table">
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th className="numeric">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(usage).map(([key, value]) => (
                    <tr key={key}>
                      <td>{METRIC_LABELS[key] ?? key}</td>
                      <td className="numeric">{value}</td>
                    </tr>
                  ))}
                  {Object.keys(usage).length === 0 && (
                    <tr>
                      <td colSpan={2} className="dim">No usage recorded this month</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="settings-section">
            <h2>Plan comparison</h2>
            <div className="plan-comparison">
              {(["free", "pro", "business"] as Plan[]).map((p) => {
                const c = PLAN_CATALOG[p]!;
                const isCurrent = p === plan;
                return (
                  <div key={p} className={cx("plan-card", isCurrent && "current")}>
                    <div className="plan-header">
                      <h3>{c.name}</h3>
                      <div className="plan-price">
                        <span className="amount">${c.price}</span>
                        <span className="period">/month</span>
                      </div>
                      {isCurrent && <span className="current-badge">Current</span>}
                    </div>
                    <ul className="plan-features">
                      {c.features.map((f) => (
                        <li key={f}><IconCheck size={14} /> {f}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="settings-section">
            <h2>Plan details</h2>
            <div className="plan-details">
              <div className="detail-grid">
                <div className="detail-item">
                  <IconInfo size={16} />
                  <div>
                    <h4>Subscription changes</h4>
                    <p>Plan changes take effect immediately. Upgrades are prorated; downgrades apply at the next billing cycle.</p>
                  </div>
                </div>
                <div className="detail-item">
                  <IconAlertCircle size={16} />
                  <div>
                    <h4>Limit enforcement</h4>
                    <p>Hard limits block creating new resources (projects, invites, API calls). Soft limits show warnings.</p>
                  </div>
                </div>
                <div className="detail-item">
                  <IconUsers size={16} />
                  <div>
                    <h4>Seat management</h4>
                    <p>Seats count active members + pending invites. Deactivate inactive members to free seats.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}