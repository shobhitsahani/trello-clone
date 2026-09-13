"use client";

import { useCallback, useMemo } from "react";
import { useSWR, useSWRInfinite } from "./swr";
import { api, type Task, type Comment, type Project, type Team, type Notification, type ActivityEvent, type Webhook, type Delivery, type ApiKey, type AuditLog, type Usage, type SearchResult, type Attachment, type PaginatedResponse } from "./api";
import { getCurrentTenantId } from "./api";
import type { TaskStatus, Priority, Role } from "./utils";

function getTenantPrefix(): string {
  const tenantId = getCurrentTenantId();
  return tenantId ? `/orgs/${tenantId}` : "";
}

/**
 * async-parallel: Fetch multiple independent resources in parallel using Promise.all
 * Eliminates waterfalls by starting all fetches simultaneously
 */
export function useDashboardData() {
  const tenantPrefix = getTenantPrefix();
  const orgId = tenantPrefix.replace("/orgs/", "");
  
  const projects = useSWR<{ projects: Project[] }>(
    tenantPrefix ? `${tenantPrefix}/projects` : null,
    () => api.projects.list(orgId)
  );
  
  const teams = useSWR<{ teams: Team[] }>(
    tenantPrefix ? `${tenantPrefix}/teams` : null,
    () => api.teams.list(orgId)
  );
  
  const activity = useSWR<PaginatedResponse<ActivityEvent>>(
    tenantPrefix ? `/activity?limit=10` : null,
    () => api.activity.list({ limit: 10 })
  );
  
  const notifications = useSWR<PaginatedResponse<Notification>>(
    tenantPrefix ? `/notifications?unread=true&limit=5` : null,
    () => api.notifications.list({ unread: true, limit: 5 })
  );

  // Parallelize all initial fetches using Promise.all (async-parallel)
  const isLoading = useMemo(() => 
    projects.isLoading || teams.isLoading || activity.isLoading || notifications.isLoading, 
    [projects.isLoading, teams.isLoading, activity.isLoading, notifications.isLoading]
  );
  
  const isValidating = useMemo(() => 
    projects.isValidating || teams.isValidating || activity.isValidating || notifications.isValidating, 
    [projects.isValidating, teams.isValidating, activity.isValidating, notifications.isValidating]
  );

  const error = useMemo(() => 
    projects.error || teams.error || activity.error || notifications.error, 
    [projects.error, teams.error, activity.error, notifications.error]
  );

  return {
    projects: projects.data?.projects ?? [],
    teams: teams.data?.teams ?? [],
    activity: activity.data?.data ?? [],
    notifications: notifications.data?.data ?? [],
    isLoading,
    isValidating,
    error,
    mutate: {
      projects: projects.mutate,
      teams: teams.mutate,
      activity: activity.mutate,
      notifications: notifications.mutate,
    },
  };
}

export function useProjects() {
  const tenantPrefix = getTenantPrefix();
  return useSWR<{ projects: Project[] }>(
    tenantPrefix ? `${tenantPrefix}/projects` : null,
    () => api.projects.list(tenantPrefix.replace("/orgs/", ""))
  );
}

export function useTeams() {
  const tenantPrefix = getTenantPrefix();
  return useSWR<{ teams: Team[] }>(
    tenantPrefix ? `${tenantPrefix}/teams` : null,
    () => api.teams.list(tenantPrefix.replace("/orgs/", ""))
  );
}

export function useTasks(projectId: string | null, params?: { status?: TaskStatus; limit?: number; cursor?: string }) {
  const tenantPrefix = getTenantPrefix();
  const key = tenantPrefix && projectId 
    ? `${tenantPrefix}/projects/${projectId}/tasks${params ? `?status=${params.status ?? ""}&limit=${params.limit ?? 50}&cursor=${params.cursor ?? ""}` : ""}`
    : null;
  
  return useSWR<PaginatedResponse<Task>>(
    key,
    () => tenantPrefix && projectId ? api.tasks.list(tenantPrefix.replace("/orgs/", ""), projectId, params) : Promise.resolve({ data: [], nextCursor: null, hasMore: false })
  );
}

export function useTask(taskId: string | null) {
  return useSWR<{ task: Task }>(
    taskId ? `/tasks/${taskId}` : null,
    () => taskId ? api.tasks.get(taskId) : Promise.resolve({ task: null as any })
  );
}

export function useComments(taskId: string | null, params?: { limit?: number; cursor?: string }) {
  const key = taskId ? `/tasks/${taskId}/comments${params ? `?limit=${params.limit ?? 50}&cursor=${params.cursor ?? ""}` : ""}` : null;
  
  return useSWR<PaginatedResponse<Comment>>(
    key,
    () => taskId ? api.comments.list(taskId, params) : Promise.resolve({ data: [], nextCursor: null, hasMore: false })
  );
}

export interface OrgMember {
  userId: string;
  name: string | null;
  email: string | null;
  role: Role;
  status: string;
}

export function useMembers() {
  const tenantPrefix = getTenantPrefix();
  return useSWR<{ members: OrgMember[] }>(
    tenantPrefix ? `${tenantPrefix}/members` : null,
    () => tenantPrefix ? api.orgs.listMembers(tenantPrefix.replace("/orgs/", "")) : Promise.resolve({ members: [] })
  );
}

export function useNotifications(params?: { unread?: boolean; limit?: number; cursor?: string }) {
  const key = `/notifications${params ? `?unread=${params.unread ?? false}&limit=${params.limit ?? 50}&cursor=${params.cursor ?? ""}` : ""}`;
  
  return useSWR<PaginatedResponse<Notification>>(
    key,
    () => api.notifications.list(params)
  );
}

export function useActivity(params?: { entityType?: string; entityId?: string; limit?: number; cursor?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.entityType) searchParams.set("entityType", params.entityType);
  if (params?.entityId) searchParams.set("entityId", params.entityId);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.cursor) searchParams.set("cursor", params.cursor);
  const key = `/activity?${searchParams.toString()}`;
  
  return useSWR<PaginatedResponse<ActivityEvent>>(
    key,
    () => api.activity.list(params)
  );
}

export function useWebhooks() {
  return useSWR<{ webhooks: Webhook[] }>(
    "/webhooks",
    () => api.webhooks.list()
  );
}

export function useWebhookDeliveries(webhookId: string | null, limit?: number) {
  return useSWR<{ deliveries: Delivery[] }>(
    webhookId ? `/webhooks/${webhookId}/deliveries?limit=${limit ?? 50}` : null,
    () => webhookId ? api.webhooks.getDeliveries(webhookId, limit) : Promise.resolve({ deliveries: [] })
  );
}

export function useApiKeys() {
  return useSWR<{ apiKeys: ApiKey[] }>(
    "/api-keys",
    () => api.apiKeys.list?.() ?? Promise.resolve({ apiKeys: [] })
  );
}

export function useAuditLogs(limit?: number, cursor?: string) {
  const key = `/audit-logs?limit=${limit ?? 50}&cursor=${cursor ?? ""}`;
  
  return useSWR<PaginatedResponse<AuditLog>>(
    key,
    () => api.audit.list(limit, cursor)
  );
}

// export function useUsage() { // usage commented out
//   return useSWR<Usage>(
//     "/usage",
//     () => api.usage.get(),
//     { refreshInterval: 60000 }
//   );
// }

export function useSearch(q: string, type?: "task" | "comment" | "all", limit?: number) {
  const key = q.length >= 2 ? `/search?q=${encodeURIComponent(q)}&type=${type ?? "all"}&limit=${limit ?? 20}` : null;
  
  return useSWR<{ query: string; results: SearchResult[] }>(
    key,
    () => api.search.query(q, type, limit),
    { revalidateOnFocus: false, dedupingInterval: 5000 }
  );
}

export function useInfiniteTasks(projectId: string | null, params?: { status?: string; limit?: number }) {
  const tenantPrefix = getTenantPrefix();
  
  const getKey = useCallback(
    (pageIndex: number, previousPageData: PaginatedResponse<Task> | null) => {
      if (!tenantPrefix || !projectId) return null;
      if (pageIndex === 0) return `${tenantPrefix}/projects/${projectId}/tasks?limit=${params?.limit ?? 50}&status=${params?.status ?? ""}`;
      if (!previousPageData?.hasMore || !previousPageData.nextCursor) return null;
      return `${tenantPrefix}/projects/${projectId}/tasks?limit=${params?.limit ?? 50}&status=${params?.status ?? ""}&cursor=${previousPageData.nextCursor}`;
    },
    [tenantPrefix, projectId, params]
  );

  return useSWRInfinite<PaginatedResponse<Task>>(
    getKey,
    (key) => api.tasks.list(tenantPrefix.replace("/orgs/", ""), projectId!, { cursor: new URL(key).searchParams.get("cursor") ?? undefined, status: params?.status as any, limit: params?.limit })
  );
}

/**
 * async-parallel: Fetch task details (task, comments, activity) in parallel
 * Eliminates waterfall when loading task detail page
 */
export function useTaskDetail(taskId: string | null) {
  const task = useSWR<{ task: Task }>(
    taskId ? `/tasks/${taskId}` : null,
    () => taskId ? api.tasks.get(taskId) : Promise.resolve({ task: null as any })
  );
  
  const comments = useSWR<PaginatedResponse<Comment>>(
    taskId ? `/tasks/${taskId}/comments?limit=50` : null,
    () => taskId ? api.comments.list(taskId, { limit: 50 }) : Promise.resolve({ data: [], nextCursor: null, hasMore: false })
  );
  
  const activity = useSWR<PaginatedResponse<ActivityEvent>>(
    taskId ? `/activity?entityType=task&entityId=${taskId}&limit=20` : null,
    () => taskId ? api.activity.list({ entityType: "task", entityId: taskId, limit: 20 }) : Promise.resolve({ data: [], nextCursor: null, hasMore: false })
  );

  const isLoading = useMemo(() => 
    task.isLoading || comments.isLoading || activity.isLoading, 
    [task.isLoading, comments.isLoading, activity.isLoading]
  );
  
  const isValidating = useMemo(() => 
    task.isValidating || comments.isValidating || activity.isValidating, 
    [task.isValidating, comments.isValidating, activity.isValidating]
  );

  const error = useMemo(() => 
    task.error || comments.error || activity.error, 
    [task.error, comments.error, activity.error]
  );

  return {
    task: task.data?.task ?? null,
    comments: comments.data?.data ?? [],
    activity: activity.data?.data ?? [],
    isLoading,
    isValidating,
    error,
    mutate: {
      task: task.mutate,
      comments: comments.mutate,
      activity: activity.mutate,
    },
  };
}

/**
 * async-parallel: Fetch organization settings data in parallel
 */
export function useOrgSettings(orgId: string | null) {
  const members = useSWR<{ members: OrgMember[] }>(
    orgId ? `/orgs/${orgId}/members` : null,
    () => orgId ? api.orgs.listMembers(orgId) : Promise.resolve({ members: [] })
  );
  
  const webhooks = useSWR<{ webhooks: Webhook[] }>(
    orgId ? `/webhooks` : null,
    () => api.webhooks.list()
  );
  
  const apiKeys = useSWR<{ apiKeys: ApiKey[] }>(
    orgId ? `/api-keys` : null,
    () => api.apiKeys.list?.() ?? Promise.resolve({ apiKeys: [] })
  );
  
  // const usage = useSWR<Usage>( // usage commented out
  //   orgId ? `/usage` : null,
  //   () => api.usage.get()
  // );
  
  const auditLogs = useSWR<PaginatedResponse<AuditLog>>(
    orgId ? `/audit-logs?limit=50` : null,
    () => api.audit.list(50)
  );

  const isLoading = useMemo(() => 
    members.isLoading || webhooks.isLoading || apiKeys.isLoading || auditLogs.isLoading, 
    [members.isLoading, webhooks.isLoading, apiKeys.isLoading, auditLogs.isLoading]
  );
  
  const isValidating = useMemo(() => 
    members.isValidating || webhooks.isValidating || apiKeys.isValidating || auditLogs.isValidating, 
    [members.isValidating, webhooks.isValidating, apiKeys.isValidating, auditLogs.isValidating]
  );
 
  const error = useMemo(() => 
    members.error || webhooks.error || apiKeys.error || auditLogs.error, 
    [members.error, webhooks.error, apiKeys.error, auditLogs.error]
  );

  return {
    members: members.data?.members ?? [],
    webhooks: webhooks.data?.webhooks ?? [],
    apiKeys: apiKeys.data?.apiKeys ?? [],
    // usage: usage.data, // usage commented out
    auditLogs: auditLogs.data?.data ?? [],
    isLoading,
    isValidating,
    error,
    mutate: {
      members: members.mutate,
      webhooks: webhooks.mutate,
      apiKeys: apiKeys.mutate,
      // usage: usage.mutate, // usage commented out
      auditLogs: auditLogs.mutate,
    },
  };
}