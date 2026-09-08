"use client";

import { useCallback, useMemo, useState, memo } from "react";
import { useTenant } from "@/components/store";
import { AppShell } from "@/components/app-shell";
import { IconFileText, IconSearch, IconFilter, IconChevronRight, IconUser, IconClock, IconArrowLeft, IconArrowRight } from "@/components/icons";
import { api, getCurrentTenantId, type AuditLog } from "@/lib/api";
import { useSWR } from "@/lib/swr";
import { cx, timeAgo } from "@/lib/utils";

const AuditRow = memo(function AuditRow({ log }: { log: AuditLog }) {
  return (
    <div className="audit-row">
      <div className="audit-time">{timeAgo(log.createdAt)}</div>
      <div className="audit-action">{log.action}</div>
      <div className="audit-entity">
        <span className="entity-type">{log.entityType}</span>
        {log.entityId && <span className="entity-id">{log.entityId.slice(0, 8)}</span>}
      </div>
      <div className="audit-actor">
        <IconUser size={12} />
        <span>{log.actorId.slice(0, 8)}</span>
      </div>
      <div className="audit-details">
        {log.before && (
          <details className="audit-diff">
            <summary>Changes</summary>
            <pre>{JSON.stringify({ before: log.before, after: log.after }, null, 2)}</pre>
          </details>
        )}
      </div>
    </div>
  );
});

export default function AuditPage() {
  const orgId = getCurrentTenantId();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [filterAction, setFilterAction] = useState("");
  const [search, setSearch] = useState("");

  const fetchLogs = useCallback(async (reset = false) => {
    if (!orgId) return;
    setLoading(true);
    try {
      const params: { limit?: number; cursor?: string } = { limit: 50 };
      if (!reset && cursor) params.cursor = cursor;
      const page = await api.audit.list(params.limit, params.cursor);
      setLogs((prev) => (reset ? page.data : [...prev, ...page.data]));
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    } finally {
      setLoading(false);
    }
  }, [orgId, cursor]);

  // Initial load
  if (logs.length === 0 && !loading) {
    void fetchLogs(true);
  }

  const filteredLogs = useMemo(() => {
    let result = logs;
    if (filterAction) {
      result = result.filter((l) => l.action === filterAction);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((l) =>
        l.action.toLowerCase().includes(q) ||
        l.entityType.toLowerCase().includes(q) ||
        (l.entityId?.toLowerCase().includes(q) ?? false) ||
        l.actorId.toLowerCase().includes(q)
      );
    }
    return result;
  }, [logs, filterAction, search]);

  const actions = useMemo(
    () => [...new Set(logs.map((l) => l.action))].sort(),
    [logs]
  );

  return (
    <AppShell>
      <div className="page settings-page">
        <header className="page-header">
          <div>
            <h1 className="page-title">Audit log</h1>
            <p className="page-subtitle">Security and admin activity trail</p>
          </div>
        </header>

        <div className="settings-content">
          <div className="audit-toolbar">
            <div className="search-box">
              <IconSearch size={16} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search audit log…"
              />
            </div>
            <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} className="select">
              <option value="">All actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div className="audit-table">
            <div className="audit-header">
              <span className="audit-col-time">Time</span>
              <span className="audit-col-action">Action</span>
              <span className="audit-col-entity">Entity</span>
              <span className="audit-col-actor">Actor</span>
              <span className="audit-col-details">Details</span>
            </div>
            {filteredLogs.length === 0 ? (
              <div className="empty-state inline">
                <IconFileText size={32} className="dim" />
                <p>{search || filterAction ? "No matching entries" : "No audit entries yet"}</p>
              </div>
            ) : (
              <>
                {filteredLogs.map((log) => (
                  <AuditRow key={log.id} log={log} />
                ))}
                {hasMore && !loading ? (
                  <button className="load-more" onClick={() => void fetchLogs(false)}>
                    Load more
                  </button>
                ) : null}
                {loading && <div className="loading">Loading…</div>}
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}