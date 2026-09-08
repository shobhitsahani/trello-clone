"use client";

import type { CSSProperties } from "react";
import { I, type IconName } from "./icons";
import {
  PRIORITY_LABEL,
  hueOf,
  initialsOf,
  type FlowEvent,
  type Org,
  type Priority,
  type Status,
  type Ticket,
} from "./data";

const COLUMNS: { status: Status; name: string }[] = [
  { status: "backlog", name: "Backlog" },
  { status: "progress", name: "In progress" },
  { status: "review", name: "In review" },
  { status: "done", name: "Done" },
];

const STATUS_COLOR: Record<Status, string> = {
  backlog: "var(--st-backlog)",
  progress: "var(--work-light)",
  review: "var(--st-review)",
  done: "var(--st-done)",
};

const EVENT_ICON: Record<FlowEvent["kind"], IconName> = {
  move: "board",
  comment: "comment",
  assign: "users",
  send: "send",
  key: "key",
  invite: "users",
  due: "list",
  done: "check",
};

export function Board({ org, onAdmin }: { org: Org; onAdmin: () => void }) {
  return (
    <div className="board">
      <div className="stage">
        <div className="columns">
          {COLUMNS.map((c, i) => (
            <Column
              key={c.status}
              name={c.name}
              status={c.status}
              i={i}
              tickets={org.tickets.filter((t) => t.status === c.status)}
            />
          ))}
        </div>
      </div>
      <FlowRail org={org} onAdmin={onAdmin} />
    </div>
  );
}

/* ---------------- column ---------------- */

function Column({
  name,
  status,
  tickets,
  i,
}: {
  name: string;
  status: Status;
  tickets: Ticket[];
  i: number;
}) {
  const lit = status === "progress";
  return (
    <section
      className={"bcol" + (lit ? " bcol-lit" : "")}
      style={{ "--i": i } as CSSProperties}
      aria-label={`${name}, ${tickets.length} tickets`}
    >
      <header className="bcol-head">
        <span
          className="lamp"
          style={
            {
              background: STATUS_COLOR[status],
              "--glow": lit
                ? "hsl(var(--org-h) var(--org-s) var(--org-l) / 0.25)"
                : "transparent",
            } as CSSProperties
          }
          aria-hidden="true"
        />
        <h2 className="bcol-name">{name}</h2>
        <span className="mono faint">{tickets.length}</span>
        {lit && <span className="pulse-dot" aria-hidden="true" />}
      </header>

      <div className="bcol-body">
        {tickets.map((t, k) => (
          <TicketCard key={t.id} t={t} i={k} />
        ))}
      </div>

      <button className="bcol-add">
        <I name="plus" size={13} />
        Add task
      </button>
    </section>
  );
}

function TicketCard({ t, i }: { t: Ticket; i: number }) {
  return (
    <article
      className="ticket"
      style={{ "--i": i } as CSSProperties}
      tabIndex={0}
    >
      <header className="ticket-head">
        <span className="mono faint ticket-id">{t.id}</span>
        <span className="ticket-head-r">
          <span
            className="pri mono"
            style={
              { color: `var(--p-${t.priority})` } as CSSProperties
            }
          >
            {PRIORITY_LABEL[t.priority as Priority]}
          </span>
          {t.due && <span className="chip chip--dim">{t.due}</span>}
        </span>
      </header>
      <h3 className="ticket-title">{t.title}</h3>
      <footer className="ticket-foot">
        <span className="ticket-meta mono">
          {t.comments > 0 && (
            <span className="ticket-stat">
              <I name="comment" size={12} />
              {t.comments}
            </span>
          )}
          {t.clips > 0 && (
            <span className="ticket-stat">
              <I name="clip" size={12} />
              {t.clips}
            </span>
          )}
        </span>
        <span
          className="avatar avatar--sm"
          style={{ "--h": hueOf(t.who) } as CSSProperties}
          title={t.who}
        >
          {initialsOf(t.who)}
        </span>
      </footer>
    </article>
  );
}

/* ---------------- flow rail ---------------- */

function FlowRail({ org, onAdmin }: { org: Org; onAdmin: () => void }) {
  const online = org.members.filter((m) => m.online).length;
  return (
    <aside className="flow" aria-label="Live activity">
      <span className="flow-sweep" aria-hidden="true" />
      <header className="flow-head">
        <span className="pulse-dot" aria-hidden="true" />
        <h2 className="flow-name">Flow</h2>
        <span className="mono faint flow-lag">live · &lt;1 s</span>
      </header>

      <p className="flow-sub">
        Every move, comment and delivery, pushed over the socket. A dropped
        connection replays from its cursor — nothing is missed.
      </p>

      <ol className="flow-list">
        {org.events.map((e, i) => (
          <li
            key={e.t + e.text}
            className={"flow-row" + (i === 0 ? " is-new" : "")}
          >
            <span className="flow-time mono">{e.t}</span>
            <span className="flow-icon">
              <I name={EVENT_ICON[e.kind]} size={13} />
            </span>
            <p className="flow-text">{e.text}</p>
          </li>
        ))}
      </ol>

      <div className="flow-presence">
        <span className="avatar-stack">
          {org.members.slice(0, 4).map((m) => (
            <span
              key={m.name}
              className="avatar avatar--sm"
              style={{ "--h": hueOf(m.name) } as CSSProperties}
              title={`${m.name}${m.online ? " — online" : ""}`}
            >
              {initialsOf(m.name)}
            </span>
          ))}
        </span>
        <span className="mono faint">{online} online</span>
      </div>

      <div className="flow-foot">
        <button className="btn btn-ghost btn-sm" onClick={onAdmin}>
          Manage the tenant
          <I name="chevR" size={13} />
        </button>
      </div>
    </aside>
  );
}