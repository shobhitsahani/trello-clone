"use client";

import type { CSSProperties } from "react";
import { I } from "./icons";
import {
  TABS,
  hueOf,
  initialsOf,
  type Org,
  type Tab,
  type UsageCell,
} from "./data";

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function Tenant({
  org,
  tab,
  setTab,
}: {
  org: Org;
  tab: Tab;
  setTab: (t: Tab) => void;
}) {
  return (
    <div className="tenant">
      <header className="tenant-head">
        <div className="tenant-head-id">
          <p className="eyebrow">Run the tenant</p>
          <h1 className="tenant-title">{org.name}</h1>
          <p className="muted tenant-sub">
            {org.slug} · {org.plan} plan · you&apos;re the{" "}
            {org.role.toLowerCase()}
          </p>
        </div>
        <div className="tenant-tabs" role="tablist" aria-label="Tenant views">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={"tenant-tab" + (tab === t.key ? " is-on" : "")}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {tab === "usage" && <UsageView org={org} />}
      {tab === "members" && <MembersView org={org} />}
      {tab === "audit" && <AuditView org={org} />}
      {tab === "integrations" && <IntegrationsView org={org} />}
    </div>
  );
}

/* ---------------- usage ---------------- */

function UsageView({ org }: { org: Org }) {
  return (
    <div className="tenant-body">
      <div className="meters">
        {org.usage.map((u) => (
          <MeterCell key={u.label} u={u} />
        ))}
      </div>

      <section className="tier">
        <div className="tier-id">
          <p className="eyebrow">Subscription</p>
          <h2 className="tier-name">{org.plan} plan</h2>
        </div>
        <ul className="tier-feats">
          {org.feats.map((f) => (
            <li key={f}>
              <I name="check" size={13} />
              {f}
            </li>
          ))}
        </ul>
        <p className="tier-note">
          Limits are soft — nothing drops mid-flight. Over-limit requests
          return <span className="mono">429</span> with{" "}
          <span className="mono">Retry-After</span>, and queued jobs keep
          draining.
        </p>
        <div className="tier-actions">
          <button className="btn btn-primary">Upgrade plan</button>
          <button className="btn btn-ghost">Compare plans</button>
        </div>
      </section>
    </div>
  );
}

function MeterCell({ u }: { u: UsageCell }) {
  const pct = Math.round((u.used / u.cap) * 100);
  const high = pct >= 80;
  return (
    <div className="meter-cell">
      <p className="meter-label">{u.label}</p>
      <p className="meter-hero tnum">
        {fmt(u.used, u.decimals ?? 0)}
        <span className="faint">
          {" "}
          / {fmt(u.cap)}
          {u.unit ? ` ${u.unit}` : ""}
        </span>
      </p>
      <div className={"meter" + (high ? " is-high" : "")}>
        <i style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <p className={"meter-note" + (high ? " is-high" : "")}>
        {pct}% used{high ? " — nearing the cap" : ""}
      </p>
    </div>
  );
}

/* ---------------- members ---------------- */

function MembersView({ org }: { org: Org }) {
  return (
    <div className="tenant-body">
      <section className="panel">
        <header className="panel-head">
          <h2 className="panel-name">Members</h2>
          <button className="btn btn-sm btn-primary">
            <I name="plus" size={13} />
            Invite
          </button>
        </header>
        <ul className="member-list">
          {org.members.map((m) => (
            <li key={m.email} className="member-row">
              <span
                className="avatar"
                style={{ "--h": hueOf(m.name) } as CSSProperties}
              >
                {initialsOf(m.name)}
              </span>
              <span className="grow member-id">
                <span className="member-name">{m.name}</span>
                <span className="mono faint member-email">{m.email}</span>
              </span>
              <span className={"chip" + (m.role === "Owner" ? " chip--tint" : "")}>
                {m.role}
              </span>
              <span className="member-last mono faint">
                {m.online ? (
                  <span className="member-on" aria-label="online" />
                ) : null}
                {m.last ?? ""}
              </span>
            </li>
          ))}
        </ul>
        <p className="panel-note">
          Invitations carry a role. Viewers can read everything and change
          nothing.
        </p>
      </section>
    </div>
  );
}

/* ---------------- audit ---------------- */

function AuditView({ org }: { org: Org }) {
  return (
    <div className="tenant-body">
      <section className="panel">
        <header className="panel-head">
          <h2 className="panel-name">Audit log</h2>
          <button className="btn btn-sm">
            <I name="export" size={13} />
            Export
          </button>
        </header>
        <ul className="audit-list mono">
          {org.audit.map((a) => (
            <li key={a.t + a.what} className="audit-row">
              <span className="audit-time faint">{a.t}</span>
              <span className="audit-who">{a.who}</span>
              <span className="audit-what">{a.what}</span>
            </li>
          ))}
        </ul>
        <p className="panel-note">
          Every mutating and admin action, kept for 12 months.
        </p>
      </section>
    </div>
  );
}

/* ---------------- integrations ---------------- */

function IntegrationsView({ org }: { org: Org }) {
  return (
    <div className="tenant-body">
      <section className="panel">
        <header className="panel-head">
          <h2 className="panel-name">Webhooks</h2>
          <button className="btn btn-sm btn-primary">
            <I name="plus" size={13} />
            New webhook
          </button>
        </header>
        <ul className="hook-list">
          {org.hooks.map((h) => (
            <li key={h.url} className="hook-row">
              <div className="hook-line">
                <span className="hook-url mono">{h.url}</span>
                <span className="chip chip--tint">delivering</span>
              </div>
              <p className="hook-meta mono faint">
                {h.triggers} · last {h.last} · {h.since} · {h.delivered}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2 className="panel-name">API keys</h2>
          <button className="btn btn-sm">
            <I name="plus" size={13} />
            New key
          </button>
        </header>
        <ul className="key-list">
          {org.keys.map((k) => (
            <li key={k.name} className="key-row">
              <span className="key-icon">
                <I name="key" size={14} />
              </span>
              <span className="grow key-id">
                <span className="key-name">{k.name}</span>
                <span className="mono faint">
                  {k.mask} · {k.scopes}
                </span>
              </span>
              <span className="key-last mono faint">{k.last}</span>
              <button className="btn btn-xs">Rotate</button>
            </li>
          ))}
        </ul>
        <p className="panel-note">
          Keys are shown once and stored hashed. Rotation is instant and
          audited.
        </p>
      </section>
    </div>
  );
}