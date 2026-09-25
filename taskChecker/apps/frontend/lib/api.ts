"use client";

import type { TaskStatus, Priority, Role } from "./utils";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/v1";

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Membership {
  tenantId: string;
  userId: string;
  role: Role;
  status: "invited" | "active" | "deactivated";
  invitedAt: string;
  acceptedAt: string | null;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "pro" | "business";
  status: string;
  createdAt: string;
}

export interface Team {
  tenantId: string;
  id: string;
  name: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface Project {
  tenantId: string;
  id: string;
  teamId: string | null;
  name: string;
  key: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface ListLabel {
  status: TaskStatus;
  label: string;
}

export interface Task {
  id: string;
  tenantId: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId: string | null;
  reporterId: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Comment {
  id: string;
  tenantId: string;
  taskId: string;
  authorId: string;
  body: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface ChatAttachment {
  url: string;
  name: string;
  mime: string;
  size: number;
}

export interface ChatReactionGroup {
  emoji: string;
  count: number;
  userIds: string[];
  reactedByMe: boolean;
}

export interface ChatMessage {
  id: string;
  tenantId?: string;
  authorId: string;
  body: string;
  attachments?: ChatAttachment[];
  mentions?: string[];
  reactions?: ChatReactionGroup[];
  createdAt: string;
}

export interface ChatSendPayload {
  body: string;
  attachments?: ChatAttachment[];
  mentions?: string[];
}

export interface Attachment {
  id: string;
  tenantId: string;
  taskId: string | null;
  uploaderId: string;
  fileName: string;
  objectKey: string;
  size: number;
  contentType: string;
  sha256: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface ActivityEvent {
  id: string;
  tenantId: string;
  actorId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface Webhook {
  id: string;
  tenantId: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

export interface Delivery {
  id: string;
  tenantId: string;
  endpointId: string;
  event: string;
  payload: Record<string, unknown>;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  tenantId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface Usage {
  plan: string;
  limits: Record<string, number>;
  month: Record<string, number>;
}

export interface AuditLog {
  id: string;
  tenantId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface Invite {
  id: string;
  tenantId: string;
  email: string;
  role: Role;
  expiresAt: string;
  acceptedAt: string | null;
  invitedById: string;
  createdAt: string;
}

export interface SearchResult {
  type: "task" | "comment";
  id: string;
  title?: string;
  status?: string;
  projectId?: string;
  taskId?: string;
  authorId?: string;
  score: number;
  snippet: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    request_id: string;
    retryable?: boolean;
  };
}

export type Plan = "free" | "pro" | "business";

export interface Member {
  userId: string;
  name: string | null;
  email: string | null;
  role: Role;
  status: "active" | "deactivated" | "invited";
}

interface TokenBundle {
  accessToken: string;
  refreshToken: string;
}

/** Shape returned by backend membership lookups (memberships_for_user SQL). */
export interface ActiveTenant {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  plan: "free" | "pro" | "business";
  role: Role;
  status: "invited" | "active" | "deactivated";
}

export type { Role };
export type { TokenBundle };

interface AuthTokens {
  accessToken: string | null;
  refreshToken: string | null;
}

let authTokens: AuthTokens = {
  accessToken: null,
  refreshToken: null,
};

let currentTenantId: string | null = null;

export function getAccessToken(): string | null {
  return authTokens.accessToken;
}

export function getRefreshToken(): string | null {
  return authTokens.refreshToken;
}

export function getCurrentTenantId(): string | null {
  return currentTenantId;
}

export function setAuthTokens(tokens: TokenBundle, tenantId: string): void {
  authTokens = { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  currentTenantId = tenantId;
  if (typeof window !== "undefined") {
    localStorage.setItem("tf_access_token", tokens.accessToken);
    localStorage.setItem("tf_refresh_token", tokens.refreshToken);
    localStorage.setItem("tf_tenant_id", tenantId);
  }
}

export function clearAuthTokens(): void {
  authTokens = { accessToken: null, refreshToken: null };
  currentTenantId = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem("tf_access_token");
    localStorage.removeItem("tf_refresh_token");
    localStorage.removeItem("tf_tenant_id");
  }
}

export function loadAuthFromStorage(): void {
  if (typeof window === "undefined") return;
  const accessToken = localStorage.getItem("tf_access_token");
  const refreshToken = localStorage.getItem("tf_refresh_token");
  const tenantId = localStorage.getItem("tf_tenant_id");
  if (accessToken && refreshToken && tenantId) {
    authTokens = { accessToken, refreshToken };
    currentTenantId = tenantId;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    authTokens.accessToken = data.accessToken;
    if (typeof window !== "undefined") {
      localStorage.setItem("tf_access_token", data.accessToken);
    }
    return data.accessToken;
  } catch {
    return null;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  // Public auth endpoints must never send a (possibly stale) session token and
  // must never trigger the global "Session expired" redirect — otherwise a
  // failed login masks the real backend message and reloads the sign-in form.
  const isPublicAuth =
    path.startsWith("/auth/login") ||
    path.startsWith("/auth/signup") ||
    path.startsWith("/auth/refresh") ||
    path.startsWith("/auth/logout") ||
    path.startsWith("/invites/");

  const accessToken = isPublicAuth ? null : getAccessToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (accessToken) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${accessToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
  } catch (err) {
    // Browser reports unreachable servers / blocked requests as a bare
    // TypeError ("Failed to fetch") — translate it into something actionable.
    if (err instanceof TypeError) {
      throw new Error(
        `Cannot reach the API server at ${API_BASE}. Is the backend running?`,
        { cause: err },
      );
    }
    throw err;
  }

  if (res.status === 401 && retry && !isPublicAuth && getRefreshToken()) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      (headers as Record<string, string>)["Authorization"] = `Bearer ${newToken}`;
      const retryRes = await fetch(`${API_BASE}${path}`, { ...options, headers });
      if (retryRes.ok) {
        return retryRes.json();
      }
    }
    clearAuthTokens();
    if (typeof window !== "undefined") {
      window.location.href = "/auth/sign-in";
    }
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const error: ApiError = await res.json().catch(() => ({
      error: { code: "unknown", message: res.statusText, request_id: "" },
    }));
    throw new Error(error.error.message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

export const api = {
  auth: {
    signup: (data: { email: string; password: string; name: string; orgName: string }) =>
      request<{ user: User; org: { id: string; slug: string }; tokens: TokenBundle }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    login: (data: { email: string; password: string }) =>
      request<{
        user: User;
        memberships: ActiveTenant[];
        tenant: ActiveTenant;
        tokens: TokenBundle;
      }>("/auth/login", { method: "POST", body: JSON.stringify(data) }),

    refresh: (refreshToken: string) =>
      request<{ accessToken: string }>("/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      }),

    logout: (refreshToken: string) =>
      request<{ ok: boolean }>("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      }),

    me: () =>
      request<{ user: User; memberships: ActiveTenant[]; activeTenantId: string }>("/me"),

    switchOrg: (orgId: string) =>
      request<{ tenant: ActiveTenant; accessToken: string }>("/auth/switch-org", {
        method: "POST",
        body: JSON.stringify({ orgId }),
      }),

    acceptInvite: (token: string, data: { name: string; password: string }) =>
      request<{ ok: boolean; tenantId: string }>(`/invites/${token}`, {
        method: "POST",
        body: JSON.stringify(data),
      }),

    previewInvite: (token: string) =>
      request<{ invite: { email: string; orgName: string; role: Role; expiresAt: string } }>(`/invites/${token}/preview`),
  },

  orgs: {
    create: (name: string) =>
      request<{ org: { id: string; name: string; slug: string }; tenant: ActiveTenant; accessToken: string }>(`/orgs`, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),

    listMembers: (orgId: string) =>
      request<{ members: Member[] }>(`/orgs/${orgId}/members`),

    invite: (orgId: string, data: { email: string; role: Role }) =>
      request<{
        invite: { id: string; email: string; role: Role; expiresAt: string };
        invitationUrl: string;
      }>(`/orgs/${orgId}/invites`, {
        method: "POST",
        body: JSON.stringify(data),
      }),

    updateMemberRole: (orgId: string, userId: string, role: Role) =>
      request<{ userId: string; role: Role }>(`/orgs/${orgId}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),

    deactivateMember: (orgId: string, userId: string) =>
      request<{ ok: boolean }>(`/orgs/${orgId}/members/${userId}`, { method: "DELETE" }),
  },

  teams: {
    list: (orgId: string) =>
      request<{ teams: Team[] }>(`/orgs/${orgId}/teams`),

    create: (orgId: string, name: string) =>
      request<{ team: Team }>("/teams", { method: "POST", body: JSON.stringify({ name }) }),
  },

  projects: {
    list: (orgId: string) =>
      request<{ projects: Project[] }>(`/orgs/${orgId}/projects`),

    create: (data: { teamId?: string; name: string; key: string }) =>
      request<{ project: Project }>("/projects", { method: "POST", body: JSON.stringify(data) }),

    update: (id: string, data: { name?: string; key?: string; teamId?: string | null }) =>
      request<{ ok: boolean }>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

    delete: (id: string) =>
      request<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" }),

    lists: (id: string) =>
      request<{ lists: ListLabel[] }>(`/projects/${id}/lists`),

    renameList: (id: string, status: TaskStatus, label: string) =>
      request<{ list: ListLabel }>(`/projects/${id}/lists`, {
        method: "PUT",
        body: JSON.stringify({ status, label }),
      }),
  },

  tasks: {
    list: (orgId: string, projectId: string, params?: { status?: TaskStatus; limit?: number; cursor?: string }) => {
      const searchParams = new URLSearchParams();
      if (params?.status) searchParams.set("status", params.status);
      if (params?.limit) searchParams.set("limit", String(params.limit));
      if (params?.cursor) searchParams.set("cursor", params.cursor);
      return request<PaginatedResponse<Task>>(`/orgs/${orgId}/projects/${projectId}/tasks?${searchParams}`);
    },

    get: (taskId: string) =>
      request<{ task: Task }>(`/tasks/${taskId}`),

    create: (data: { projectId: string; title: string; description?: string; status?: TaskStatus; priority?: Priority; assigneeId?: string; dueAt?: string }, idempotencyKey?: string) => {
      const headers: Record<string, string> = {};
      if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
      return request<{ task: Task; idempotentReplay: boolean }>("/tasks", {
        method: "POST",
        body: JSON.stringify(data),
        headers,
      });
    },

    update: (taskId: string, data: Partial<{ title: string; description: string; status: TaskStatus; priority: Priority; assigneeId: string | null; dueAt: string | null }>) =>
      request<{ ok: boolean; action: string }>(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(data) }),

    delete: (taskId: string) =>
      request<{ ok: boolean; deletedAt: string }>(`/tasks/${taskId}`, { method: "DELETE" }),
  },

  comments: {
    list: (taskId: string, params?: { limit?: number; cursor?: string }) => {
      const searchParams = new URLSearchParams();
      if (params?.limit) searchParams.set("limit", String(params.limit));
      if (params?.cursor) searchParams.set("cursor", params.cursor);
      return request<PaginatedResponse<Comment>>(`/tasks/${taskId}/comments?${searchParams}`);
    },

    create: (taskId: string, body: string) =>
      request<{ comment: Comment }>(`/tasks/${taskId}/comments`, { method: "POST", body: JSON.stringify({ body }) }),

    delete: (commentId: string) =>
      request<{ ok: boolean }>(`/comments/${commentId}`, { method: "DELETE" }),
  },

  chat: {
    list: (params?: { limit?: number; cursor?: string }) => {
      const searchParams = new URLSearchParams();
      if (params?.limit) searchParams.set("limit", String(params.limit));
      if (params?.cursor) searchParams.set("cursor", params.cursor);
      return request<PaginatedResponse<ChatMessage>>(`/chat/messages?${searchParams}`);
    },

    send: (bodyOrPayload: string | ChatSendPayload) => {
      const payload: ChatSendPayload =
        typeof bodyOrPayload === "string" ? { body: bodyOrPayload } : bodyOrPayload;
      return request<{ message: ChatMessage }>(`/chat/messages`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },

    remove: (messageId: string) =>
      request<{ ok: boolean }>(`/chat/messages/${messageId}`, { method: "DELETE" }),

    react: (messageId: string, emoji: string) =>
      request<{ ok: boolean; reactions: ChatReactionGroup[] }>(`/chat/messages/${messageId}/reactions`, {
        method: "POST",
        body: JSON.stringify({ emoji }),
      }),

    unreact: (messageId: string, emoji: string) =>
      request<{ ok: boolean; reactions: ChatReactionGroup[] }>(
        `/chat/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
        { method: "DELETE" },
      ),

    typing: (displayName?: string) =>
      request<{ ok: boolean }>(`/chat/typing`, {
        method: "POST",
        body: JSON.stringify(displayName ? { displayName } : {}),
      }).catch(() => ({ ok: false as const })),
  },

  attachments: {
    presign: (data: { fileName: string; contentType: string; size: number; taskId?: string }) =>
      request<{
        attachmentId: string;
        objectKey: string;
        upload: { method: string; url: string; headers: Record<string, string>; expiresInSec: number };
      }>("/attachments/presign", { method: "POST", body: JSON.stringify(data) }),

    upload: (attachmentId: string, file: Blob, objectKey: string, contentType: string) => {
      // Raw fetch (not request()) because the body is binary — but the session
      // token is still required: the backend authenticates every /v1 route.
      const headers: Record<string, string> = { "Content-Type": contentType, "X-Object-Key": objectKey };
      const token = getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      return fetch(`${API_BASE}/attachments/upload/${attachmentId}`, {
        method: "PUT",
        headers,
        body: file,
      }).then((res) => {
        if (!res.ok) throw new Error("Upload failed");
        return res.json();
      });
    },

    download: async (attachmentId: string): Promise<Blob> => {
      // Binary payload — fetch as blob, not JSON (request() would res.json()).
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/attachments/${attachmentId}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Download failed");
      return res.blob();
    },
  },

  activity: {
    list: async (params?: { entityType?: string; entityId?: string; limit?: number; cursor?: string }) => {
      const searchParams = new URLSearchParams();
      if (params?.entityType) searchParams.set("entityType", params.entityType);
      if (params?.entityId) searchParams.set("entityId", params.entityId);
      if (params?.limit) searchParams.set("limit", String(params.limit));
      if (params?.cursor) searchParams.set("cursor", params.cursor);
      const raw = await request<unknown>(`/activity?${searchParams}`);
      return normalizePage<ActivityEvent>(raw, "activity");
    },
  },

  notifications: {
    list: async (params?: { unread?: boolean; limit?: number; cursor?: string }) => {
      const searchParams = new URLSearchParams();
      if (params?.unread) searchParams.set("unread", "true");
      if (params?.limit) searchParams.set("limit", String(params.limit));
      if (params?.cursor) searchParams.set("cursor", params.cursor);
      const raw = await request<unknown>(`/notifications?${searchParams}`);
      return normalizePage<Notification>(raw, "notifications");
    },

    markRead: (notificationId: string) =>
      request<{ ok: boolean; alreadyRead?: boolean }>(`/notifications/${notificationId}/read`, { method: "POST" }),
  },

  search: {
    query: (q: string, type?: "task" | "comment" | "all", limit?: number) => {
      const searchParams = new URLSearchParams();
      searchParams.set("q", q);
      if (type) searchParams.set("type", type);
      if (limit) searchParams.set("limit", String(limit));
      return request<{ query: string; results: SearchResult[] }>(`/search?${searchParams}`);
    },
  },

  webhooks: {
    list: () => request<{ webhooks: Webhook[] }>("/webhooks"),

    create: (data: { name: string; url: string; events?: string[] }) =>
      request<{ webhook: Webhook; secret: string }>("/webhooks", { method: "POST", body: JSON.stringify(data) }),

    rotateSecret: (id: string) =>
      request<{ secret: string }>(`/webhooks/${id}/rotate-secret`, { method: "POST" }),

    getDeliveries: (id: string, limit?: number) => {
      const searchParams = new URLSearchParams();
      if (limit) searchParams.set("limit", String(limit));
      return request<{ deliveries: Delivery[] }>(`/webhooks/${id}/deliveries?${searchParams}`);
    },
  },

  apiKeys: {
    list: () => request<{ apiKeys: ApiKey[] }>("/api-keys"),

    create: (data: { name: string; scopes?: string[] }) =>
      request<{ apiKey: ApiKey; key: string }>("/api-keys", { method: "POST", body: JSON.stringify(data) }),

    revoke: (id: string) =>
      request<{ ok: boolean }>(`/api-keys/${id}`, { method: "DELETE" }),
  },

  audit: {
    list: async (limit?: number, cursor?: string) => {
      const searchParams = new URLSearchParams();
      if (limit) searchParams.set("limit", String(limit));
      if (cursor) searchParams.set("cursor", cursor);
      const raw = await request<unknown>(`/audit-logs?${searchParams}`);
      // Backend envelope is `{ logs, nextCursor, hasMore }`, not `{ data, … }`.
      return normalizePage<AuditLog>(raw, "logs");
    },
  },

  // usage: { // usage commented out
  //   get: () => request<Usage>("/usage"),
  // },
};

/**
 * Normalize cursor-paginated envelopes. Current backends return
 * `{ data, nextCursor, hasMore }`; older builds used a resource-named key
 * (`{ activity, ... }`, `{ notifications, ... }`). Accept both so a stale
 * server can never silently empty (or crash) the feed — `page.data` would
 * otherwise come back `undefined` and poison downstream state.
 */
function normalizePage<T>(raw: unknown, legacyKey: string): PaginatedResponse<T> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rows = (r.data ?? r[legacyKey] ?? r.items) as T[] | undefined;
  return {
    data: Array.isArray(rows) ? rows : [],
    nextCursor: (r.nextCursor as string | null) ?? null,
    hasMore: (r.hasMore as boolean) ?? false,
  };
}
export function getWsUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  const base = process.env.NEXT_PUBLIC_API_BASE ?? "/v1";
  const wsBase = base.replace(/^http/, "ws");
  return wsBase.endsWith("/ws") ? wsBase : `${wsBase.replace(/\/v1$/, "")}/v1/ws`;
}