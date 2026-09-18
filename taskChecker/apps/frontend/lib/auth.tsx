"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { api, type User, type ActiveTenant, type TokenBundle, loadAuthFromStorage, clearAuthTokens, getCurrentTenantId, setAuthTokens } from "./api";
import { DEMO_USER, DEMO_MEMBERSHIPS, DEMO_ORG_ID, enableDemoSession } from "./mock-storage";

// Hydrate the in-memory token store synchronously at import time (browser
// only). Descendant data-fetch effects run BEFORE this provider's mount
// effect, so hydrating inside useEffect leaves the first paint's fetches
// without a token — fresh loads of the task page fired unauthenticated
// task + comments reads (401s) and could stick on "Task not found" where
// StrictMode remounts don't rescue it (production). Import-time hydration
// runs before any render/effect in the tree.
if (typeof window !== "undefined") loadAuthFromStorage();

interface AuthContextType {
  user: User | null;
  memberships: ActiveTenant[];
  activeTenantId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, orgName: string) => Promise<void>;
  loginAsDemo: () => void;
  logout: () => Promise<void>;
  switchOrg: (orgId: string) => Promise<void>;
  createOrg: (name: string) => Promise<ActiveTenant>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<ActiveTenant[]>([]);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await api.auth.me();
      setUser(data.user);
      setMemberships(data.memberships);
      setActiveTenantId(data.activeTenantId);
    } catch {
      clearAuthTokens();
      setUser(null);
      setMemberships([]);
      setActiveTenantId(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAuthFromStorage();
    if (getAccessToken()) {
      refreshUser();
    } else {
      setIsLoading(false);
    }
  }, [refreshUser]);

  const loginAsDemo = useCallback(() => {
    enableDemoSession();
    setUser(DEMO_USER);
    setMemberships(DEMO_MEMBERSHIPS);
    setActiveTenantId(DEMO_ORG_ID);
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    clearAuthTokens();
    try {
      const data = await api.auth.login({ email, password });
      setAuthTokens(data.tokens, data.tenant.tenant_id);
      setUser(data.user);
      setMemberships(data.memberships);
      setActiveTenantId(data.tenant.tenant_id);
    } catch (err) {
      // In sandbox/preview without live Postgres, automatically log into demo mode
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("unavailable") || msg.includes("Cannot reach") || msg.includes("Failed to fetch")) {
        loginAsDemo();
        return;
      }
      throw err;
    }
  };

  const signup = async (email: string, password: string, name: string, orgName: string) => {
    clearAuthTokens();
    try {
      const data = await api.auth.signup({ email, password, name, orgName });
      setAuthTokens(data.tokens, data.org.id);
      setUser(data.user);
      setMemberships([
        {
          tenant_id: data.org.id,
          tenant_name: orgName,
          tenant_slug: data.org.slug,
          plan: "free",
          role: "owner",
          status: "active",
        },
      ]);
      setActiveTenantId(data.org.id);
    } catch (err) {
      // In sandbox/preview without live Postgres, automatically create demo session
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("unavailable") || msg.includes("Cannot reach") || msg.includes("Failed to fetch")) {
        enableDemoSession();
        const demoUser: User = { id: "demo-user-1", email, name: name || "Demo User" };
        const demoTenant: ActiveTenant = {
          tenant_id: DEMO_ORG_ID,
          tenant_name: orgName || "TeamFlow Workspace",
          tenant_slug: "teamflow-demo",
          plan: "pro",
          role: "owner",
          status: "active",
        };
        setUser(demoUser);
        setMemberships([demoTenant]);
        setActiveTenantId(DEMO_ORG_ID);
        return;
      }
      throw err;
    }
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem("tf_refresh_token");
    if (refreshToken) {
      try {
        await api.auth.logout(refreshToken);
      } catch {
        // ignore
      }
    }
    clearAuthTokens();
    setUser(null);
    setMemberships([]);
    setActiveTenantId(null);
  };

  const switchOrg = async (orgId: string) => {
    const data = await api.auth.switchOrg(orgId);
    const tokens = { accessToken: data.accessToken, refreshToken: localStorage.getItem("tf_refresh_token")! };
    setAuthTokens(tokens, data.tenant.tenant_id);
    setActiveTenantId(data.tenant.tenant_id);
    setMemberships((prev) => prev.map((m) => (m.tenant_id === orgId ? { ...m, status: "active" as const } : m)));
  };

  const createOrg = async (name: string) => {
    const data = await api.orgs.create(name);
    const refreshToken = localStorage.getItem("tf_refresh_token")!;
    setAuthTokens({ accessToken: data.accessToken, refreshToken }, data.tenant.tenant_id);
    setMemberships((prev) => {
      if (prev.some((m) => m.tenant_id === data.tenant.tenant_id)) return prev;
      return [...prev, data.tenant];
    });
    setActiveTenantId(data.tenant.tenant_id);
    return data.tenant;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        memberships,
        activeTenantId,
        isLoading,
        isAuthenticated: !!user,
        login,
        signup,
        loginAsDemo,
        logout,
        switchOrg,
        createOrg,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("tf_access_token");
}