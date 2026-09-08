"use client";

/* AppShell root: wires ⌘K palette, notification sheet, tenant + toast providers. */

import { useEffect, useState, Suspense, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth";
import { ContextBar, Rail, ScopeStrip } from "./shell-parts";
import { IconFlowMark } from "./icons";

/** Route guard — the whole /app tree requires a live session. */
function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/auth/sign-in");
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        {isLoading ? (
          <span className="dim">Loading session…</span>
        ) : (
          <a href="/auth/sign-in" className="btn btn-primary">
            <IconFlowMark size={14} /> Sign in to continue
          </a>
        )}
      </div>
    );
  }
  return <>{children}</>;
}

// Dynamic imports for heavy overlays (bundle-dynamic-imports)
const DynamicCommandPalette = dynamic(
  () => import("./command-palette").then((mod) => mod.CommandPalette),
  { loading: () => <div className="cmdk-loading">Loading…</div>, ssr: false }
);

const DynamicNotifSheet = dynamic(
  () => import("./notif-sheet").then((mod) => mod.NotifSheet),
  { loading: () => null, ssr: false }
);

// Module-level Map to deduplicate global event listeners across component instances
// (client-event-listeners - avoids N listeners for N instances)
const keyCallbacks = new Map<string, Set<() => void>>();

export function AppShell({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    // Register this instance's callback in the module-level Map
    if (!keyCallbacks.has("global-keydown")) {
      keyCallbacks.set("global-keydown", new Set());
    }
    const set = keyCallbacks.get("global-keydown")!;
    const cb = () => {
      setPaletteOpen((v) => !v);
    };
    set.add(cb);

    return () => {
      const set = keyCallbacks.get("global-keydown");
      if (set) {
        set.delete(cb);
        if (set.size === 0) {
          keyCallbacks.delete("global-keydown");
        }
      }
    };
  }, []);

  // Deduplicated global listener - one listener for all instances
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const set = keyCallbacks.get("global-keydown");
        if (set) {
          set.forEach(cb => cb());
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <AuthGate>
      <div className="app-shell">
        <Rail />
        <ContextBar />
        <div className="content">
          <ScopeStrip
            onOpenPalette={() => setPaletteOpen(true)}
            onOpenNotifs={() => setNotifOpen(true)}
          />
          {children}
        </div>
      </div>
      {paletteOpen ? (
        <Suspense fallback={<div className="cmdk-loading">Loading…</div>}>
          <DynamicCommandPalette onClose={() => setPaletteOpen(false)} />
        </Suspense>
      ) : null}
      {notifOpen ? (
        <Suspense fallback={null}>
          <DynamicNotifSheet open={notifOpen} onClose={() => setNotifOpen(false)} />
        </Suspense>
      ) : null}
    </AuthGate>
  );
}