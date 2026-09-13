"use client";

/* Command palette - heavy component, loaded dynamically (bundle-dynamic-imports) */

import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue, startTransition } from "react";
import { useRouter } from "next/navigation";
import { useTenant } from "./store";
import { useToast } from "./overlay";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { IconCheck, IconFile, IconFlowMark, IconSearch, IconX } from "./icons";
import { cx, timeAgo } from "../lib/utils";

type CmdItem = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  run: () => void;
};

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { org, setOrg } = useTenant();
  const { memberships } = useAuth();
  const [query, setQuery] = useState("");
  // Use React's useDeferredValue for crisp typing while deferring expensive renders (rerender-use-deferred-value)
  const deferred = useDeferredValue(query);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Real full-text search results (Postgres FTS, tenant-scoped server-side).
  const [taskItems, setTaskItems] = useState<CmdItem[]>([]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Server-backed search once the query is long enough.
  useEffect(() => {
    const q = deferred.trim();
    if (q.length < 2) {
      setTaskItems([]);
      return;
    }
    let cancelled = false;
    api.search
      .query(q, "all", 8)
      .then((res) => {
        if (cancelled) return;
        setTaskItems(
          res.results.map((r): CmdItem => ({
            id: `sr-${r.type}-${r.id}`,
            group: "Search results",
            label: r.title ? `${r.title}` : r.snippet.slice(0, 80),
            hint: r.type === "task" ? "task" : "comment",
            run: () => router.push(r.type === "task" ? `/app/tasks/${r.id}` : `/app/tasks/${r.taskId ?? ""}`),
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setTaskItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [deferred, router]);

  const items = useMemo<CmdItem[]>(() => {
    const nav: CmdItem[] = (
      [
        ["Your work", "/app/work"],
        ["Board", "/app/board"],
        ["Projects", "/app/projects"],
        ["Teams", "/app/teams"],
        ["Activity", "/app/activity"],
        ["Settings", "/app/settings"],
        ["Members", "/app/settings/members"],
        // ["Usage & plan", "/app/settings/usage"], // usage commented out
        ["Integrations", "/app/settings/integrations"],
        ["Audit log", "/app/settings/audit"],
      ] as const satisfies readonly [string, string][]
    ).map(([label, href]): CmdItem => {
      const l = label ?? "";
      return {
        id: `nav-${href}`,
        group: "Jump to",
        label: l,
        hint: "go",
        run: () => router.push(href),
      };
    });

    // Real org memberships — switch calls the backend (new tenant-scoped JWT).
    const orgItems: CmdItem[] = memberships.map((m): CmdItem => ({
      id: `org-${m.tenant_id}`,
      group: "Switch tenant",
      label: m.tenant_name ?? "",
      hint: `org/${m.tenant_slug}`,
      run: () => {
        void setOrg(m.tenant_id);
        toast({ title: `Switched to ${m.tenant_name ?? ""}`, msg: "Scoped to this tenant now." });
      },
    }));

    const actions: CmdItem[] = [
      {
        id: "act-task",
        group: "Actions",
        label: "Create task",
        hint: "new",
        run: () => {
          toast({ title: "Create task", msg: "Open a project board and use " + '"New task".' });
          router.push("/app/board");
        },
      },
      {
        id: "act-invite",
        group: "Actions",
        label: "Invite a teammate",
        hint: "admin",
        run: () => router.push("/app/settings/members"),
      },
    ];

    return [...nav, ...orgItems, ...actions, ...taskItems];
  }, [router, setOrg, toast, memberships, taskItems]);

  const filtered = useMemo(() => {
    const q = deferred.trim().toLowerCase();
    if (!q) return items.filter((i) => i.group !== "Tasks").slice(0, 12);
    const out: CmdItem[] = [];
    for (const i of items) {
      if (out.length >= 12) break;
      const hay = `${i.label ?? ""} ${i.hint ?? ""}`.toLowerCase();
      if (hay.includes(q)) out.push(i);
    }
    return out;
  }, [deferred, items]);

  // keep selection inside bounds when the list shrinks
  useEffect(() => {
    setSel((s) => Math.min(s, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  const runAt = useCallback(
    (idx: number) => {
      const item = filtered[idx];
      if (!item) return;
      onClose();
      item.run();
    },
    [filtered, onClose]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      startTransition(() => setSel((s) => (s + 1) % Math.max(1, filtered.length)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      startTransition(() => setSel((s) => (s - 1 + filtered.length) % Math.max(1, filtered.length)));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(sel);
    }
  };
  let lastGroup = "";

  return (
    <div
      className="modal-backdrop"
      style={{ alignItems: "flex-start", background: "transparent", backdropFilter: "none" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="cmdk"
        role="dialog"
        aria-modal
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cmdk-input">
          <IconSearch size={16} className="dim" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search tasks, jump anywhere, switch tenant…"
            aria-label="Command palette input"
          />
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Close">
            <IconX size={14} />
          </button>
        </div>
        <div className="cmdk-list" role="listbox">
          {filtered.length === 0 ? (
            <div className="empty" style={{ padding: "24px 16px" }}>
              <div className="empty-title">Nothing matches "{query}"</div>
              <p className="empty-msg">
                Search covers task keys, titles, and pages in this tenant.
              </p>
            </div>
          ) : (
            filtered.map((item, idx) => {
              const showGroup = item.group !== lastGroup;
              lastGroup = item.group;
              return (
                <div key={item.id}>
                  {showGroup ? <div className="cmdk-group">{item.group}</div> : null}
                  <div
                    role="option"
                    aria-selected={idx === sel}
                    className={cx("cmdk-item", idx === sel && "cmdk-item-selected")}
                    onMouseEnter={() => setSel(idx)}
                    onClick={() => runAt(idx)}
                  >
                    <IconFile size={13} className="dim" />
                    <span
                      className="grow"
                      style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {item.label}
                    </span>
                    {item.hint ? <span className="cmdk-hint">{item.hint}</span> : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="cmdk-foot">
          <span>Scoped to {org?.name ?? "your organization"}</span>
          <span className="kbd-group">
            <span>↑↓ move</span>
            <span>⏎ open</span>
            <span>esc close</span>
          </span>
        </div>
      </div>
    </div>
  );
}