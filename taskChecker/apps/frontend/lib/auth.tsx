"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { api, type User, type ActiveTenant, type TokenBundle, loadAuthFromStorage, clearAuthTokens, getCurrentTenantId, setAuthTokens } from "./api";

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

  const login = async (email: string, password: string) => {
    clearAuthTokens();
    const data = await api.auth.login({ email, password });
    setAuthTokens(data.tokens, data.tenant.tenant_id);
    setUser(data.user);
    setMemberships(data.memberships);
    setActiveTenantId(data.tenant.tenant_id);
  };

  const signup = async (email: string, password: string, name: string, orgName: string) => {
    clearAuthTokens();
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
