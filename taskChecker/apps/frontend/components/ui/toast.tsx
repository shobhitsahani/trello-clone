"use client";

import * as React from "react";
import { Toast } from "@base-ui/react/toast";
import { cn } from "@/lib/utils";
import {
  IconCheck,
  IconInfo,
  IconAlert,
  IconAlertCircle,
  IconX,
} from "@/components/icons";

// Global manager — import { toast } from "@/components/ui/toast" anywhere,
// even outside React tree. Matches Base UI `toastManager` docs.
export const toast = Toast.createToastManager();

// --- Toaster root mounted once in app/layout.tsx ---

export function Toaster() {
  return (
    <Toast.Provider toastManager={toast}>
      <ToastViewport />
    </Toast.Provider>
  );
}

function ToastViewport() {
  const { toasts } = Toast.useToastManager();

  return (
    <Toast.Portal>
      <Toast.Viewport
        data-slot="toast-viewport"
        className={cn(
          "fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4",
          "sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]"
        )}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

function ToastItem({ toast: t }: { toast: Toast.Root.ToastObject }) {
  const type = (t.type ?? "info") as string;

  return (
    <Toast.Root
      toast={t}
      data-slot="toast"
      data-type={type}
      swipeDirection={["right", "down"]}
      className={cn(
        // base
        "group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-lg border bg-white p-4 pr-8 shadow-lg transition-all",
        // stacking
        "data-[limited]:hidden",
        // animations — Base UI data attributes
        "data-[starting-style]:opacity-0 data-[starting-style]:translate-y-2",
        "data-[ending-style]:opacity-0 data-[ending-style]:translate-y-2 data-[ending-style]:scale-95",
        "data-[swipe-direction=right]:translate-x-full data-[swipe-direction=down]:translate-y-full",
        // type accents
        type === "success" && "border-green-200 bg-green-50/80 dark:border-green-900 dark:bg-green-950/50",
        type === "error" && "border-red-200 bg-red-50/80 dark:border-red-900 dark:bg-red-950/50",
        type === "warning" && "border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/50",
        type === "loading" && "border-slate-200",
        // behind stacking (collapsed)
        "[--toast-index:var(--toast-index)] [--toast-offset-y:var(--toast-offset-y)]"
      )}
      style={
        {
          // Base UI stacking vars -> translateY when expanded
          transform:
            "translateY(var(--toast-offset-y, 0)) scale(calc(1 - var(--toast-index, 0) * 0.04))",
          zIndex: `calc(100 - var(--toast-index, 0))`,
          height: "var(--toast-frontmost-height, auto)",
        } as React.CSSProperties
      }
    >
      <Toast.Content
        data-slot="toast-content"
        className="flex flex-1 items-start gap-3 data-[behind]:opacity-0 data-[expanded]:opacity-100 transition-opacity duration-200"
      >
        <span
          data-slot="toast-icon"
          className={cn(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
            type === "success" && "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300",
            type === "error" && "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300",
            type === "warning" && "bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-300",
            type === "info" && "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
            type === "loading" && "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          )}
        >
          <ToastIcon type={type} />
        </span>

        <div className="flex flex-1 flex-col gap-1">
          {t.title ? (
            <Toast.Title
              data-slot="toast-title"
              className="text-sm font-semibold leading-none tracking-tight text-slate-900 dark:text-slate-50"
            />
          ) : null}
          {t.description ? (
            <Toast.Description
              data-slot="toast-description"
              className="text-sm leading-snug text-slate-600 dark:text-slate-300"
            />
          ) : null}
        </div>
      </Toast.Content>

      {/* Action rendered via toast.actionProps */}
      <Toast.Action
        data-slot="toast-action"
        className={cn(
          "inline-flex h-7 shrink-0 items-center justify-center rounded-md border bg-transparent px-2.5 text-xs font-medium",
          "transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400",
          "hover:bg-slate-50 dark:hover:bg-slate-800",
          "empty:hidden"
        )}
      />

      <Toast.Close
        data-slot="toast-close"
        aria-label="Close"
        className="absolute right-1.5 top-1.5 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-50"
      >
        <IconX size={14} />
      </Toast.Close>
    </Toast.Root>
  );
}

function ToastIcon({ type }: { type: string }) {
  if (type === "loading") {
    return (
      <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
    );
  }
  if (type === "success") return <IconCheck size={12} />;
  if (type === "error") return <IconAlert size={12} />;
  if (type === "warning") return <IconAlertCircle size={12} />;
  // info + fallback
  return <IconInfo size={12} />;
}

// Re-export types for consumers that need them
export type { Toast };
