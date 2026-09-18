"use client";

import { useCallback, useEffect, useMemo, useRef, memo, useState, startTransition } from "react";
import { AppShell } from "@/components/app-shell";
import { useTenant } from "@/components/store";
import { Dropdown, MenuItem } from "@/components/overlay";
import { IconSearch, IconFilter, IconPulse, IconFile, IconMessageSquare, IconUsers, IconLayers, IconChevronRight } from "@/components/icons";
import { api, getCurrentTenantId, type ActivityEvent } from "@/lib/api";
import { useSWR } from "@/lib/swr";
import { Skeleton } from "@/components/ui/skeleton";
import { cx, timeAgo, hueFrom } from "@/lib/utils";

// Hoist static JSX outside component (rendering-hoist-jsx)
const ACTIVITY_TYPES = [
  { value: "all", label: "All activity", icon: IconPulse },
  { value: "task", label: "Tasks", icon: IconFile },
  { value: "comment", label: "Comments", icon: IconMessageSquare },
  { value: "project", label: "Projects", icon: IconLayers },
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
  actorLoading,
}: {
  event: ActivityEvent;
  actorName: string | null;
  actorLoading?: boolean;
}) {
  const action = ACTION_LABELS[event.action] ?? event.action;
  const tint = event.actorId ? hueFrom(event.actorId) : 0;

  return (
    <div className="activity-item">
      <div className="activity-avatar">
        {actorLoading ? (
          <Skeleton aria-hidden className="size-8 shrink-0 rounded-full" />
        ) : actorName ? (
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  // Cursor ref so fetches always use the latest page token without
  // re-creating the callback (avoids stale closures + effect loops).
  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);

  // Actor names for the current tenant (single fetch, shared by all rows).
  // Shared cache key with the shell (`ctx-members-*`): same endpoint, one request.
  const membersQ = useSWR<{ members: Array<{ userId: string; name: string | null }> }>(
    orgId ? `ctx-members-${orgId}` : null,
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
      if (!orgId || loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      if (reset) setLoadError(null);
      try {
        const params: { entityType?: string; cursor?: string; limit?: number } = { limit: 20 };
        if (filter !== "all") params.entityType = filter;
        const token = reset ? undefined : cursorRef.current ?? undefined;
        if (token) params.cursor = token;
        const page: Page = await api.activity.list(params);
        // normalizePage() in lib/api already coerces legacy `{ activity }`
        // envelopes to `{ data }`, but never trust the wire blindly — an
        // undefined list here used to poison state and blank the feed.
        const rows = page.data ?? [];
        setActivities((prev) => {
          if (reset) return rows;
          const seen = new Set(prev.map((a) => a.id));
          return [...prev, ...rows.filter((a) => !seen.has(a.id))];
        });
        cursorRef.current = page.nextCursor;
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
      } catch (err) {
        if (reset) setLoadError(err instanceof Error ? err.message : "Failed to load activity.");
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [filter, orgId],
  );

  // Initial load + reload when the org arrives late (auth hydration) or the
  // filter changes. Switching filters resets the list and page token.
  useEffect(() => {
    cursorRef.current = null;
    setCursor(null);
    setHasMore(true);
    setActivities([]);
    void fetchActivities(true);
  }, [filter, orgId, fetchActivities]);

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
            <Dropdown
              align="right"
              trigger={() => (
                <button className="btn btn-ghost btn-sm" aria-haspopup="listbox" type="button">
                  <IconFilter size={14} />
                  <span>{ACTIVITY_TYPES.find((t) => t.value === filter)?.label ?? "All"}</span>
                  <IconChevronRight size={12} />
                </button>
              )}
            >
              {(close) => (
                <>
                  {ACTIVITY_TYPES.map((t) => (
                    <MenuItem
                      key={t.value}
                      checked={filter === t.value}
                      onSelect={() => {
                        handleFilterChange(t.value);
                        close();
                      }}
                    >
                      <t.icon size={14} /> {t.label}
                    </MenuItem>
                  ))}
                </>
              )}
            </Dropdown>
          </div>
        </div>

          <div className="activity-feed">
          {loading && activities.length === 0 ? (
            <div role="status" aria-label="Loading activity" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="activity-item" aria-hidden>
                  <div className="activity-avatar">
                    <Skeleton className="size-8 shrink-0 rounded-full" />
                  </div>
                  <div className="activity-content" style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                    <Skeleton className="h-3.5 w-2/3 rounded" />
                    <Skeleton className="h-3 w-1/3 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : loadError && activities.length === 0 ? (
            <div className="empty-state">
              <IconPulse size={48} className="dim" />
              <h3>Couldn't load activity</h3>
              <p>{loadError}</p>
              <button className="btn btn-primary btn-sm" onClick={() => void fetchActivities(true)}>
                Retry
              </button>
            </div>
          ) : filteredActivities.length === 0 ? (
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
                  actorLoading={
                    membersQ.isLoading && !!event.actorId && !actorNames.get(event.actorId)
                  }
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
