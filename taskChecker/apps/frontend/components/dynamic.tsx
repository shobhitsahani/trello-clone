"use client";

import dynamic from "next/dynamic";

/**
 * bundle-dynamic-imports: Heavy components loaded on demand
 * Reduces initial bundle size by code-splitting
 */

// Board page - heavy with drag/drop, multiple columns, task cards
export const DynamicBoardPage = dynamic(
  () => import("@/app/app/board/page").then((mod) => mod.default),
  {
    loading: () => <div className="page-skeleton">Loading board…</div>,
    ssr: false,
  }
);

// Task detail page - comments, activity, sidebar
export const DynamicTaskDetailPage = dynamic(
  () => import("@/app/app/tasks/[id]/page").then((mod) => mod.default),
  {
    loading: () => <div className="page-skeleton">Loading task…</div>,
    ssr: false,
  }
);

// Integrations page - webhook forms, API key management
export const DynamicIntegrationsPage = dynamic(
  () => import("@/app/app/settings/integrations/page").then((mod) => mod.default),
  {
    loading: () => <div className="page-skeleton">Loading integrations…</div>,
    ssr: false,
  }
);

// Activity page - infinite scroll, filtering
export const DynamicActivityPage = dynamic(
  () => import("@/app/app/activity/page").then((mod) => mod.default),
  {
    loading: () => <div className="page-skeleton">Loading activity…</div>,
    ssr: false,
  }
);

// Audit log page - large data tables
export const DynamicAuditPage = dynamic(
  () => import("@/app/app/settings/audit/page").then((mod) => mod.default),
  {
    loading: () => <div className="page-skeleton">Loading audit log…</div>,
    ssr: false,
  }
);

// Members page - role management, invitations
export const DynamicMembersPage = dynamic(
  () => import("@/app/app/settings/members/page").then((mod) => mod.default),
  {
    loading: () => <div className="page-skeleton">Loading members…</div>,
    ssr: false,
  }
);

// Command palette - heavy with search, filtering, keyboard navigation
export const DynamicCommandPalette = dynamic(
  () => import("@/components/command-palette").then((mod) => mod.CommandPalette),
  {
    loading: () => <div className="cmdk-loading">Loading command palette…</div>,
    ssr: false,
  }
);

// Notification sheet
export const DynamicNotifSheet = dynamic(
  () => import("@/components/notif-sheet").then((mod) => mod.NotifSheet),
  {
    loading: () => null,
    ssr: false,
  }
);