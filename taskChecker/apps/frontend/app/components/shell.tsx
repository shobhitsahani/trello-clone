"use client";

import { useState, type CSSProperties } from "react";
import { I } from "./icons";
import { ME, ORGS, TABS, hueOf, initialsOf, type Org, type Tab } from "./data";
import { Board } from "./board";
import { Tenant } from "./tenant";

function orgVars(org: Org): CSSProperties {
  return {
    "--org-h": org.hue,
    "--org-s": `${org.sat}%`,
    "--org-l": `${org.lig}%`,
  } as CSSProperties;
}

export function App() {
  const [orgId, setOrgId] = useState(ORGS[0]?.id ?? "northwind");
  const [view, setView] = useState<"board" | "tenant">("board");
  const [tab, setTab] = useState<Tab>("usage");
  const [menu, setMenu] = useState<"org" | "bell" | null>(null);
  const [read, setRead] = useState(false);

  const org = ORGS.find((o) => o.id === orgId) ?? ORGS[0]!;
  const unread = read ? 0 : org.events.length;

  const openTenant = (t: Tab) => {
    setView("tenant");
    setTab(t);
    setMenu(null);
  };

  return (
    <div className="app" style={orgVars(org)}>
      <Rail
        view={view}
        onBoard={() => {
          setView("board");
          setMenu(null);
        }}
        onBell={() => setMenu(menu === "bell" ? null : "bell")}
        onSearch={() => document.getElementById("workspace-search")?.focus()}
        unread={unread}
      />
      <ContextNav
        org={org}
        view={view}
        tab={tab}
        onSwitcher={() => setMenu(menu === "org" ? null : "org")}
        onBoard={() => setView("board")}
        onTenant={openTenant}
      />

      <main className="main">
        <Topbar
          org={org}
          view={view}
          unread={unread}
          onBell={() => setMenu(menu === "bell" ? null : "bell")}
        />
        <div className="view" key={view + org.id}>
          {view === "board" ? (
            <Board org={org} onAdmin={() => openTenant("audit")} />
          ) : (
            <Tenant org={org} tab={tab} setTab={setTab} />
          )}
        </div>
      </main>

      {menu === "org" && (
        <OrgMenu
          org={org}
          onPick={(id) => {
            setOrgId(id);
            setRead(false);
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      )}
      {menu === "bell" && (
        <BellMenu
          org={org}
          read={read}
          onRead={() => setRead(true)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

/* ---------------- rail ---------------- */

function Rail({
  view,
  onBoard,
  onBell,
  onSearch,
  unread,
}: {
  view: "board" | "tenant";
  onBoard: () => void;
  onBell: () => void;
  onSearch: () => void;
  unread: number;
}) {
  return (
    <nav className="rail" aria-label="Workspace">
      <button
        className="rail-logo"
        onClick={onBoard}
        aria-label="TeamFlow home"
        title="TeamFlow"
      >
        <span className="lampmark" aria-hidden="true" />
      </button>
      <span className="rail-sep" aria-hidden="true" />
      <button
        className={"rail-btn" + (view === "board" ? " is-on" : "")}
        onClick={onBoard}
        aria-label="Board"
        title="Board"
      >
        <I name="board" />
      </button>
      <button
        className="rail-btn"
        onClick={onBell}
        aria-label={unread > 0 ? `Inbox, ${unread} unread` : "Inbox"}
        title="Inbox"
      >
        <I name="inbox" />
        {unread > 0 && <span className="rail-badge mono">{unread}</span>}
      </button>
      <button
        className="rail-btn"
        onClick={onSearch}
        aria-label="Search"
        title="Search  (⌘K)"
      >
        <I name="search" />
      </button>
      <span className="grow" />
      <button
        className="rail-btn rail-me"
        aria-label="Account — Priya Raman, Owner"
        title="Priya Raman — Owner"
      >
        <span
          className="avatar avatar--sm"
          style={{ "--h": hueOf(ME) } as CSSProperties}
        >
          {initialsOf(ME)}
        </span>
      </button>
    </nav>
  );
}

/* ---------------- context nav ---------------- */

function ContextNav({
  org,
  view,
  tab,
  onSwitcher,
  onBoard,
  onTenant,
}: {
  org: Org;
  view: "board" | "tenant";
  tab: Tab;
  onSwitcher: () => void;
  onBoard: () => void;
  onTenant: (t: Tab) => void;
}) {
  return (
    <aside className="ctx">
      <button
        className="ctx-org"
        onClick={onSwitcher}
        aria-label={`Organization ${org.name} — switch`}
      >
        <span className="ctx-org-swatch" aria-hidden="true" />
        <span className="grow ctx-org-name">{org.name}</span>
        <I name="chev" size={14} />
      </button>

      <div className="ctx-meta">
        <span className="chip chip--tint">{org.plan} plan</span>
        <span className="chip">
          You&apos;re the {org.role.toLowerCase()}
        </span>
      </div>

      <section className="ctx-group">
        <h2 className="ctx-label">Teams</h2>
        {org.teams.map((t) => (
          <div className="ctx-row" key={t.name}>
            <span className="ctx-dot" aria-hidden="true" />
            <span className="grow">{t.name}</span>
            <span className="mono faint">{t.active}</span>
          </div>
        ))}
      </section>

      <section className="ctx-group">
        <h2 className="ctx-label">Projects</h2>
        <button
          className={"ctx-row" + (view === "board" ? " is-active" : "")}
          onClick={onBoard}
        >
          <span className="ctx-key mono">{org.project.key}</span>
          <span className="grow">{org.project.name}</span>
          <span className="mono faint">
            {org.tickets.filter((t) => t.status === "progress").length}
          </span>
        </button>
      </section>

      <section className="ctx-group">
        <h2 className="ctx-label">Run the tenant</h2>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={
              "ctx-row" +
              (view === "tenant" && tab === t.key ? " is-active" : "")
            }
            onClick={() => onTenant(t.key)}
          >
            <I name={t.icon} size={14} />
            <span className="grow">{t.label}</span>
          </button>
        ))}
      </section>
    </aside>
  );
}

/* ---------------- topbar ---------------- */

function Topbar({
  org,
  view,
  unread,
  onBell,
}: {
  org: Org;
  view: "board" | "tenant";
  unread: number;
  onBell: () => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        {view === "board" ? (
          <>
            <h1 className="tf-display">{org.project.name}</h1>
            <span className="topbar-meta mono">
              {org.project.key} · {org.project.desc} ·{" "}
              <span className="topbar-stage">{org.project.stage}</span>
            </span>
          </>
        ) : (
          <>
            <h1 className="tf-display">Run the tenant</h1>
            <span className="topbar-meta mono">
              {org.slug} · {org.plan} plan
            </span>
          </>
        )}
      </div>

      <button
        className="search"
        id="workspace-search"
        aria-label="Search tasks, comments, people"
      >
        <I name="search" size={15} />
        <span className="grow search-ph">Search tasks, comments, people…</span>
        <span className="kbd">⌘K</span>
      </button>

      <div className="topbar-right">
        <button
          className="topbar-bell"
          onClick={onBell}
          aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
        >
          <I name="bell" size={17} />
          {unread > 0 && <span className="bell-badge mono">{unread}</span>}
        </button>
        <span className="topbar-me">
          <span
            className="avatar"
            style={{ "--h": hueOf(ME) } as CSSProperties}
          >
            {initialsOf(ME)}
          </span>
          <span className="topbar-me-name">{ME}</span>
          <span className="chip chip--tint">{org.role}</span>
        </span>
      </div>
    </header>
  );
}

/* ---------------- popovers ---------------- */

function OrgMenu({
  org,
  onPick,
  onClose,
}: {
  org: Org;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <button className="overlay" aria-label="Close" onClick={onClose} />
      <div className="pop pop-org" role="dialog" aria-label="Switch organization">
        <p className="eyebrow">Switch organization</p>
        <div className="pop-orgs">
          {ORGS.map((o) => (
            <button
              key={o.id}
              className={"pop-org-row" + (o.id === org.id ? " is-on" : "")}
              onClick={() => onPick(o.id)}
            >
              <span
                className="pop-swatch"
                style={
                  {
                    background: `hsl(${o.hue} ${o.sat}% ${o.lig}%)`,
                  } as CSSProperties
                }
                aria-hidden="true"
              />
              <span className="grow pop-org-name">{o.name}</span>
              <span className="chip chip--dim">{o.plan}</span>
              {o.id === org.id && (
                <span className="pop-check">
                  <I name="check" size={13} />
                </span>
              )}
            </button>
          ))}
        </div>
        <p className="pop-note">
          Each org is its own silo — separate members, roles, data and keys.
          Nothing crosses the wall.
        </p>
      </div>
    </>
  );
}

function BellMenu({
  org,
  read,
  onRead,
  onClose,
}: {
  org: Org;
  read: boolean;
  onRead: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <button className="overlay" aria-label="Close" onClick={onClose} />
      <div className="pop pop-bell" role="dialog" aria-label="Notifications">
        <div className="row-between">
          <p className="eyebrow">Notifications</p>
          {!read && (
            <button className="btn btn-ghost btn-xs" onClick={onRead}>
              Mark all read
            </button>
          )}
        </div>
        {read ? (
          <p className="pop-clear">
            <I name="check" size={14} />
            All clear — you&apos;re up to date.
          </p>
        ) : (
          <ul className="pop-list">
            {org.events.slice(0, 4).map((e) => (
              <li key={e.t + e.text} className="pop-row">
                <span className="mono faint">{e.t}</span>
                <span className="grow">{e.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}