"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4002";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface Membership {
  tenant_id: string;
  role: string;
  status: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  activeTenantId: string | null;
  memberships: Membership[];
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, orgName: string) => Promise<void>;
  logout: () => Promise<void>;
  switchOrg: (orgId: string) => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  accessToken: null,
  activeTenantId: null,
  memberships: [],
  login: async () => {},
  signup: async () => {},
  logout: async () => {},
  switchOrg: async () => {},
  isAuthenticated: false,
});

const STORAGE_KEY = "teamflow.auth";

function loadState(): AuthState {
  if (typeof window === "undefined") return { user: null, accessToken: null, activeTenantId: null, memberships: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { user: null, accessToken: null, activeTenantId: null, memberships: [] };
    return JSON.parse(raw);
  } catch {
    return { user: null, accessToken: null, activeTenantId: null, memberships: [] };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(loadState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message ?? "Login failed");
    }
    const data = await res.json();
    setState({
      user: data.user,
      accessToken: data.tokens.accessToken,
      activeTenantId: data.tenant?.tenant_id ?? null,
      memberships: data.memberships ?? [],
    });
  }, []);

  const signup = useCallback(async (email: string, password: string, name: string, orgName: string) => {
    const res = await fetch(`${API_BASE}/v1/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name, orgName }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message ?? "Signup failed");
    }
    const data = await res.json();
    setState({
      user: { id: data.userId ?? "", email, name },
      accessToken: data.tokens.accessToken,
      activeTenantId: data.tenant?.tenant_id ?? null,
      memberships: data.memberships ?? [],
    });
  }, []);

  const logout = useCallback(async () => {
    setState({ user: null, accessToken: null, activeTenantId: null, memberships: [] });
  }, []);

  const switchOrg = useCallback(async (orgId: string) => {
    const res = await fetch(`${API_BASE}/v1/auth/switch-org`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.accessToken}`,
      },
      body: JSON.stringify({ orgId }),
    });
    if (!res.ok) throw new Error("Failed to switch organization");
    const data = await res.json();
    setState((prev) => ({
      ...prev,
      accessToken: data.accessToken,
      activeTenantId: orgId,
    }));
  }, [state.accessToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      signup,
      logout,
      switchOrg,
      isAuthenticated: !!state.accessToken && !!state.user,
    }),
    [state, login, signup, logout, switchOrg],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

/** Helper to get the bearer token for raw fetch calls. */
export function getAuthToken(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw).accessToken ?? null;
  } catch {
    return null;
  }
}
