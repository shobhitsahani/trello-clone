"use client";

/* Tenant store — current org (tenant identity) + notification state.
   Backed by the real auth session (AuthProvider) and the live notifications
   API. Switching org calls POST /auth/switch-org so the backend JWT/tenant
   context changes too. Org accent hue derived deterministically from the
   tenant id so each org keeps a stable color without a hue column. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth";
import { api, type Notification } from "../lib/api";
import { useSWR } from "../lib/swr";
import { hueFrom } from "../lib/utils";

const LS_KEY = "tf.org.v1"; // versioned localStorage schema (client-localstorage-schema)

export type Org = {
  id: string;
  name: string;
  slug: string;
  hue: number;
  plan: string;
  role: string;
  createdAt: string;
};

type TenantCtx = {
  org: Org | null;
  orgs: Org[];
  setOrg: (id: string) => Promise<void>;
  createOrg: (name: string) => Promise<Org | null>;
  creatingOrg: boolean;
  notifications: Notification[];
  unread: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  mutateNotifications: (
    data?:
      | PaginatedNotifications
      | Promise<PaginatedNotifications>
      | ((current: PaginatedNotifications | undefined) => PaginatedNotifications | Promise<PaginatedNotifications>),
    opts?: { revalidate?: boolean },
  ) => Promise<PaginatedNotifications | undefined>;
};

const Ctx = createContext<TenantCtx | null>(null);

export function useTenant(): TenantCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTenant must be used inside TenantProvider");
  return ctx;
}

type PaginatedNotifications = {
  data: Notification[];
  nextCursor: string | null;
  hasMore: boolean;
};

export function TenantProvider({ children }: { children: ReactNode }) {
  const { memberships, activeTenantId, isAuthenticated, refreshUser, switchOrg, createOrg: createOrgAuth } = useAuth();
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const [creatingOrg, setCreatingOrg] = useState(false);

  // Remember last-used org locally; the backend session (activeTenantId) wins.
  const [preferredOrgId, setPreferredOrgId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS_KEY);
      if (typeof raw === "string" && raw) setPreferredOrgId(JSON.parse(raw) as string);
    } catch {
      // corrupted value — backend session decides
    }
  }, []);

  const orgs = useMemo<Org[]>(
    () =>
      memberships.map((m) => ({
        id: m.tenant_id,
        name: m.tenant_name,
        slug: m.tenant_slug,
        hue: hueFrom(m.tenant_slug || m.tenant_id),
        plan: m.plan,
        role: m.role,
        createdAt: "",
      })),
    [memberships],
  );

  const org = useMemo(
    () =>
      orgs.find((o) => o.id === activeTenantId) ??
      orgs.find((o) => o.id === preferredOrgId) ??
      orgs[0] ??
      null,
    [orgs, activeTenantId, preferredOrgId],
  );

  // Keep the shell accent in sync with the active org hue.
  useEffect(() => {
    if (org) document.documentElement.style.setProperty("--accent-h", String(org.hue));
  }, [org]);

  // Notifications for the current user (tenant-scoped server-side by JWT).
  const notificationsQ = useSWR<PaginatedNotifications>(
    isAuthenticated && activeTenantId ? "/notifications?limit=20" : null,
    () => api.notifications.list({ limit: 20 }),
    { refreshInterval: 30_000 },
  );
  const notifications = notificationsQ.data?.data ?? [];
  const unread = notifications.reduce((acc, n) => acc + (n.readAt ? 0 : 1), 0);
  const mutateNotifications = notificationsQ.mutate;

  const markRead = useCallback(
    (id: string) => {
      // optimistic — flip readAt locally, then confirm server-side
      void mutateNotifications(
        (current) => {
          if (!current) {
            return { data: [], nextCursor: null, hasMore: false };
          }
          return {
            ...current,
            data: current.data.map((n) =>
              n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n,
            ),
          };
        },
        { revalidate: false },
      );
      api.notifications
        .markRead(id)
        .then(() => mutateNotifications())
        .catch(() => mutateNotifications());
    },
    [mutateNotifications],
  );

  const markAllRead = useCallback(() => {
    const unreadIds = notifications.filter((n) => !n.readAt).map((n) => n.id);
    for (const id of unreadIds) markRead(id);
  }, [notifications, markRead]);

  const setOrg = useCallback(
    async (id: string) => {
      if (!isAuthenticated || switching) return;
      setSwitching(true);
      try {
        // authContext.switchOrg rotates the stored access token to the new
        // tenant — calling api.auth.switchOrg directly would leave the old
        // tenant's JWT in place and break every later request.
        await switchOrg(id);
        setPreferredOrgId(id);
        try {
          window.localStorage.setItem(LS_KEY, JSON.stringify(id));
        } catch {
          // storage unavailable — session-only choice
        }
        await refreshUser();
        router.refresh();
      } finally {
        setSwitching(false);
      }
    },
    [isAuthenticated, switching, refreshUser, router, switchOrg],
  );

  const createOrg = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || !isAuthenticated || creatingOrg) return null;
      setCreatingOrg(true);
      try {
        const tenant = await createOrgAuth(trimmed);
        setPreferredOrgId(tenant.tenant_id);
        try {
          window.localStorage.setItem(LS_KEY, JSON.stringify(tenant.tenant_id));
        } catch {
          // storage unavailable — session-only choice
        }
        await refreshUser();
        router.refresh();
        return {
          id: tenant.tenant_id,
          name: tenant.tenant_name,
          slug: tenant.tenant_slug,
          hue: hueFrom(tenant.tenant_slug || tenant.tenant_id),
          plan: tenant.plan,
          role: tenant.role,
          createdAt: "",
        } satisfies Org;
      } finally {
        setCreatingOrg(false);
      }
    },
    [isAuthenticated, creatingOrg, createOrgAuth, refreshUser, router],
  );

  return (
    <Ctx.Provider value={{ org, orgs, setOrg, createOrg, creatingOrg, notifications, unread, markRead, markAllRead, mutateNotifications }}>
      {children}
    </Ctx.Provider>
  );
}
