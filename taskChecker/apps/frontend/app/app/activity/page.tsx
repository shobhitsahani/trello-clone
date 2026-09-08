"use client";

import { useCallback, useEffect, useMemo, memo, useState, startTransition } from "react";
import { AppShell } from "@/components/app-shell";
import { useTenant } from "@/components/store";
import { IconSearch, IconFilter, IconPulse, IconFile, IconMessageSquare, IconUsers, IconFolder, IconChevronRight } from "@/components/icons";
import { api, getCurrentTenantId, type ActivityEvent } from "@/lib/api";
import { useSWR } from "@/lib/swr";
import { cx, timeAgo, hueFrom } from "@/lib/utils";

// Hoist static JSX outside component (rendering-hoist-jsx)
const ACTIVITY_TYPES = [
  { value: "all", label: "All activity", icon: IconPulse },
  { value: "task", label: "Tasks", icon: IconFile },
  { value: "comment", label: "Comments", icon: IconMessageSquare },
  { value: "project", label: "Projects", icon: IconFolder },
  { value: "team", label: "Teams", icon: IconUsers },
] as const;

const ACTION_LABELS: Record<string, string> = {
  created: "created",
  updated: "updated",
  status_changed: "changed status of",
  commented: "commented on",
  deleted: "deleted",
};

/**
 * rerender-memo: Memoize ActivityItem to prevent unnecessary re-renders
 */
const ActivityItem = memo(function ActivityItem({
  event,
  actorName,
}: {
  event: ActivityEvent;
  actorName: string | null;
}) {
  const action = ACTION_LABELS[event.action] ?? event.action;
  const tint = event.actorId ? hueFrom(event.actorId) : 0;

  return (
    <div className="activity-item">
      <div className="activity-avatar">
        {actorName ? (
          <span style={{ background: `hsl(${tint} 60% 50%)` }}>{actorName.slice(0, 1)}</span>
        ) : (
          <IconPulse size={16} className="dim" />
        )}
      </div>
      <div className="activity-content">
        <div className="activity-header">
          <span className="activity-actor">{actorName ?? "Someone"}</span>
          <span className="activity-action">{action}</span>
          <span className="activity-target">
            {event.entityType} {event.entityId.slice(0, 8)}
          </span>
        </div>
        {event.meta && Object.keys(event.meta).length > 0 ? (
          <div className="activity-meta">
            {Object.entries(event.meta).map(([k, v]) => (
              <span key={k} className="meta-tag">
                {k}: {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </span>
            ))}
          </div>
        ) : null}
        <span className="activity-time">{timeAgo(event.createdAt)}</span>
      </div>
    </div>
  );
});

type Page = { data: ActivityEvent[]; nextCursor: string | null; hasMore: boolean };

export default function ActivityPage() {
  const { org } = useTenant();
  const orgId = getCurrentTenantId();
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Actor names for the current tenant (single fetch, shared by all rows).
  const membersQ = useSWR<{ members: Array<{ userId: string; name: string | null }> }>(
    orgId ? `activity-members-${orgId}` : null,
    () => api.orgs.listMembers(orgId!),
  );
  const actorNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of membersQ.data?.members ?? []) {
      if (m.name) map.set(m.userId, m.name);
    }
    return map;
  }, [membersQ.data]);

  // Live feed: GET /v1/activity (tenant-scoped by the backend, cursor-paginated).
  const fetchActivities = useCallback(
    async (reset = false) => {
      if (!orgId) return;
      setLoading(true);
      try {
        const params: { entityType?: string; cursor?: string; limit?: number } = { limit: 20 };
        if (filter !== "all") params.entityType = filter;
        if (!reset && cursor) params.cursor = cursor;
        const page: Page = await api.activity.list(params);
        setActivities((prev) => (reset ? page.data : [...prev, ...page.data]));
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
      } catch (err) {
        console.error("Failed to fetch activities:", err);
      } finally {
        setLoading(false);
      }
    },
    [filter, cursor, orgId],
  );

  useEffect(() => {
    void fetchActivities(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const handleLoadMore = () => {
    void fetchActivities(false);
  };

  // Memoize filtered activities to avoid re-filtering on every render
  const filteredActivities = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return activities;
    return activities.filter((a) => {
      const actor = a.actorId ? actorNames.get(a.actorId) ?? "" : "";
      const haystack = `${actor} ${a.action} ${a.entityType} ${a.entityId}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [activities, search, actorNames]);

  // Use startTransition for non-urgent search updates (rerender-transitions)
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    startTransition(() => {
      setSearch(e.target.value);
    });
  };

  const handleFilterChange = (value: string) => {
    startTransition(() => {
      setFilter(value);
    });
  };

  return (
    <AppShell>
      <div className="page">
        <header className="page-header">
          <div>
            <h1 className="page-title">Activity</h1>
            <p className="page-subtitle">Recent activity across {org?.name ?? "your organization"}</p>
          </div>
        </header>

        <div className="activity-toolbar">
          <div className="search-box">
            <IconSearch size={16} />
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder="Search activity…"
            />
          </div>
          <div className="filter-dropdown">
            <button className="btn btn-ghost btn-sm" aria-haspopup="listbox">
              <IconFilter size={14} />
              <span>{ACTIVITY_TYPES.find(t => t.value === filter)?.label ?? "All"}</span>
              <IconChevronRight size={12} />
            </button>
          </div>
        </div>

        <div className="activity-feed">
          {filteredActivities.length === 0 ? (
            <div className="empty-state">
              <IconPulse size={48} className="dim" />
              <h3>No activity</h3>
              <p>{search ? "No matching activity found" : "Activity will appear here as your team works"}</p>
            </div>
          ) : (
            <>
              {filteredActivities.map((event) => (
                <ActivityItem
                  key={event.id}
                  event={event}
                  actorName={event.actorId ? actorNames.get(event.actorId) ?? null : null}
                />
              ))}
              {hasMore && !loading ? (
                <button className="load-more" onClick={handleLoadMore}>
                  Load more
                </button>
              ) : null}
              {loading ? <div className="loading">Loading…</div> : null}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
