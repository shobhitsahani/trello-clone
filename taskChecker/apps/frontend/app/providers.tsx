"use client";

import { ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { AuthProvider } from "@/lib/auth";
import { TenantProvider } from "@/components/store";
import { ToastProvider } from "@/components/overlay";
import { useRealtimeNotifications } from "@/lib/realtime";
import { useAuth } from "@/lib/auth";

/* Tenant + toast providers live at the ROOT so page components can call
   useTenant()/useToast() before <AppShell> mounts — Next.js prerenders pages
   top-down, and a provider nested inside AppShell is invisible to the page
   component's own hook calls (build previously failed on /app/activity). */

function RealtimeProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  useRealtimeNotifications();

  // The hook handles its own connection lifecycle based on auth state
  // This component just ensures the hook is called at the right level
  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <TenantProvider>
          <RealtimeProvider>
            <ToastProvider>{children}</ToastProvider>
          </RealtimeProvider>
        </TenantProvider>
      </AuthProvider>
    </MotionConfig>
  );
}