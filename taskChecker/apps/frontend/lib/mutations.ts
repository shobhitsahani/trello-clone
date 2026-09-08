"use client";

import { useCallback } from "react";
import { api, type Task, type Comment, type Project, type Team, type PaginatedResponse } from "./api";
import { useSWR } from "./swr";
import { getCurrentTenantId } from "./api";
import type { TaskStatus, Priority } from "./utils";

function getTenantId(): string {
  return getCurrentTenantId() ?? "";
}

export function useCreateProject() {
  const { mutate: mutateProjects } = useSWR<{ projects: Project[] }>("/projects", () => ({ projects: [] }));
  const { mutate: mutateTeams } = useSWR<{ teams: Team[] }>("/teams", () => ({ teams: [] }));

  return useCallback(
    async (data: { teamId?: string; name: string; key: string }) => {
      const tenantId = getTenantId();
      const result = await api.projects.create(data);
      
      await mutateProjects(
        (current) => current ? { projects: [result.project, ...current.projects] } : { projects: [result.project] },
        { revalidate: false }
      );
      
      return result;
    },
    [mutateProjects]
  );
}

export function useCreateTeam() {
  const { mutate: mutateTeams } = useSWR<{ teams: Team[] }>("/teams", () => ({ teams: [] }));

  return useCallback(
    async (name: string) => {
      const tenantId = getTenantId();
      const result = await api.teams.create(tenantId, name);
      
      await mutateTeams(
        (current) => current ? { teams: [result.team, ...current.teams] } : { teams: [result.team] },
        { revalidate: false }
      );
      
      return result;
    },
    [mutateTeams]
  );
}

export function useCreateTask(projectId: string) {
  const { mutate: mutateTasks } = useSWR<PaginatedResponse<Task>>(
    `/orgs/${getTenantId()}/projects/${projectId}/tasks`,
    () => ({ data: [], nextCursor: null, hasMore: false })
  );

  return useCallback(
    async (data: { title: string; description?: string; status?: TaskStatus; priority?: Priority; assigneeId?: string; dueAt?: string }, idempotencyKey?: string) => {
      const result = await api.tasks.create({ projectId, ...data }, idempotencyKey);
      
      await mutateTasks(
        (current) => current ? { ...current, data: [result.task, ...current.data] } : { data: [result.task], nextCursor: null, hasMore: false },
        { revalidate: false }
      );
      
      return result;
    },
    [mutateTasks, projectId]
  );
}

export function useUpdateTask() {
  const { mutate: mutateTasks } = useSWR<PaginatedResponse<Task>>(
    `/tasks/list`,
    () => ({ data: [], nextCursor: null, hasMore: false })
  );

  return useCallback(
    async (taskId: string, data: Partial<Task>, projectId: string) => {
      const result = await api.tasks.update(taskId, data);
      
      await mutateTasks(
        (current) => {
          if (!current) return { data: [], nextCursor: null, hasMore: false };
          return {
            ...current,
            data: current.data.map((t) => (t.id === taskId ? { ...t, ...data } : t)),
          };
        },
        { revalidate: false }
      );
      
      return result;
    },
    [mutateTasks]
  );
}

export function useDeleteTask() {
  const { mutate: mutateTasks } = useSWR<PaginatedResponse<Task>>(
    `/tasks/list`,
    () => ({ data: [], nextCursor: null, hasMore: false })
  );

  return useCallback(
    async (taskId: string, projectId: string) => {
      const result = await api.tasks.delete(taskId);
      
      await mutateTasks(
        (current) => {
          if (!current) return { data: [], nextCursor: null, hasMore: false };
          return {
            ...current,
            data: current.data.filter((t) => t.id !== taskId),
          };
        },
        { revalidate: false }
      );
      
      return result;
    },
    [mutateTasks]
  );
}

export function useCreateComment(taskId: string) {
  const { mutate: mutateComments } = useSWR<PaginatedResponse<Comment>>(
    `/tasks/${taskId}/comments`,
    () => ({ data: [], nextCursor: null, hasMore: false })
  );

  return useCallback(
    async (body: string) => {
      const result = await api.comments.create(taskId, body);
      
      await mutateComments(
        (current) => current ? { ...current, data: [result.comment, ...current.data] } : { data: [result.comment], nextCursor: null, hasMore: false },
        { revalidate: false }
      );
      
      return result;
    },
    [mutateComments, taskId]
  );
}

export function useDeleteComment() {
  return useCallback(
    async (commentId: string) => {
      return api.comments.delete(commentId);
    },
    []
  );
}

export function useMarkNotificationRead() {
  const { mutate: mutateNotifications } = useSWR<PaginatedResponse<any>>(
    `/notifications`,
    () => ({ data: [], nextCursor: null, hasMore: false })
  );

  return useCallback(
    async (notificationId: string) => {
      const result = await api.notifications.markRead(notificationId);
      
      await mutateNotifications(
        (current) => {
          if (!current) return { data: [], nextCursor: null, hasMore: false };
          return {
            ...current,
            data: current.data.map((n: any) => (n.id === notificationId ? { ...n, readAt: new Date().toISOString() } : n)),
          };
        },
        { revalidate: false }
      );
      
      return result;
    },
    [mutateNotifications]
  );
}

export function useInviteMember() {
  const { mutate: mutateMembers } = useSWR<{ members: any[] }>(
    `/members`,
    () => ({ members: [] })
  );

  return useCallback(
    async (orgId: string, email: string, role: string) => {
      const result = await api.orgs.invite(orgId, { email, role: role as any });
      
      await mutateMembers(
        (current) => current ? { members: [...current.members, { email, role, status: "invited" }] } : { members: [{ email, role, status: "invited" }] },
        { revalidate: false }
      );
      
      return result;
    },
    [mutateMembers]
  );
}

export function useUpdateMemberRole() {
  const { mutate: mutateMembers } = useSWR<{ members: any[] }>(
    `/members`,
    () => ({ members: [] })
  );

  return useCallback(
    async (orgId: string, userId: string, role: string) => {
      const result = await api.orgs.updateMemberRole(orgId, userId, role as any);
      
      await mutateMembers(
        (current) => {
          if (!current) return { members: [] };
          return {
            ...current,
            members: current.members.map((m: any) => (m.userId === userId ? { ...m, role } : m)),
          };
        },
        { revalidate: false }
      );
      
      return result;
    },
    [mutateMembers]
  );
}

export function useDeactivateMember() {
  const { mutate: mutateMembers } = useSWR<{ members: any[] }>(
    `/members`,
    () => ({ members: [] })
  );

  return useCallback(
    async (orgId: string, userId: string) => {
      const result = await api.orgs.deactivateMember(orgId, userId);
      
      await mutateMembers(
        (current) => {
          if (!current) return { members: [] };
          return {
            ...current,
            members: current.members.map((m: any) => (m.userId === userId ? { ...m, status: "deactivated" } : m)),
          };
        },
        { revalidate: false }
      );
      
      return result;
    },
    [mutateMembers]
  );
}

export function useCreateWebhook() {
  const { mutate: mutateWebhooks } = useSWR<{ webhooks: any[] }>(
    `/webhooks`,
    () => ({ webhooks: [] })
  );

  return useCallback(
    async (data: { name: string; url: string; events?: string[] }) => {
      const result = await api.webhooks.create(data);
      
      await mutateWebhooks(
        (current) => current ? { webhooks: [result.webhook, ...current.webhooks] } : { webhooks: [result.webhook] },
        { revalidate: false }
      );
      
      return result;
    },
    [mutateWebhooks]
  );
}

export function useRotateWebhookSecret() {
  return useCallback(
    async (webhookId: string) => {
      return api.webhooks.rotateSecret(webhookId);
    },
    []
  );
}

export function useCreateApiKey() {
  const { mutate: mutateApiKeys } = useSWR<{ apiKeys: any[] }>(
    `/api-keys`,
    () => ({ apiKeys: [] })
  );

  return useCallback(
    async (data: { name: string; scopes?: string[] }) => {
      const result = await api.apiKeys.create(data);
      
      await mutateApiKeys(
        (current) => current ? { apiKeys: [result.apiKey, ...current.apiKeys] } : { apiKeys: [result.apiKey] },
        { revalidate: false }
      );
      
      return result;
    },
    [mutateApiKeys]
  );
}

export function useRevokeApiKey() {
  const { mutate: mutateApiKeys } = useSWR<{ apiKeys: any[] }>(
    `/api-keys`,
    () => ({ apiKeys: [] })
  );

  return useCallback(
    async (id: string) => {
      const result = await api.apiKeys.revoke(id);
      
      await mutateApiKeys(
        (current) => {
          if (!current) return { apiKeys: [] };
          return {
            ...current,
            apiKeys: current.apiKeys.map((k: any) => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k)),
          };
        },
        { revalidate: false }
      );
      
      return result;
    },
    [mutateApiKeys]
  );
}

export function useUploadAttachment() {
  return useCallback(
    async (data: { fileName: string; contentType: string; size: number; taskId?: string }) => {
      const presignResult = await api.attachments.presign(data);
      return presignResult;
    },
    []
  );
}

export function useUploadAttachmentFile() {
  return useCallback(
    async (attachmentId: string, file: File, objectKey: string) => {
      return api.attachments.upload(attachmentId, file, objectKey, file.type);
    },
    []
  );
}