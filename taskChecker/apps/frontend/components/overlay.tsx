"use client";

/* Client overlays: toasts + shadcn-backed compat for legacy Modal/Dropdown/Switch. */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { cn } from "../lib/utils";
import { toast as baseToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CheckIcon } from "lucide-react";
import { Switch as ShadcnSwitch } from "@/components/ui/switch";

/* ---------- toasts (compat) ---------- */
// Legacy `useToast` API kept for existing call sites — forwards to the
// new Base UI toast manager (`@/components/ui/toast`) so all toasts render
// through the single `Toaster` in `app/layout.tsx` (base-nova style).
// New code should `import { toast } from "@/components/ui/toast"` and call
// `toast.add({ title, description, type, actionProps })` directly.

type ToastKind = "ok" | "err";
const ToastCtx = createContext<(t: { title: string; msg?: string; kind?: ToastKind }) => void>(
  () => undefined
);

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const push = useCallback(
    ({ title, msg, kind = "ok" }: { title: string; msg?: string; kind?: ToastKind }) => {
      baseToast.add({
        title,
        description: msg,
        type: kind === "err" ? "error" : kind === "ok" ? "success" : "info",
      });
    },
    []
  );

  return <ToastCtx.Provider value={push}>{children}</ToastCtx.Provider>;
}

/* ---------- modal (shadcn Dialog, legacy open/onClose/title API) ---------- */

export function Modal({
  open,
  onClose,
  title,
  sub,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent aria-label={title}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {sub ? <DialogDescription>{sub}</DialogDescription> : null}
        </DialogHeader>
        <div>{children}</div>
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- dropdown menu (shadcn Menu, legacy trigger/align API) ---------- */

export function Dropdown({
  trigger,
  children,
  align = "left",
  width,
}: {
  trigger: (open: boolean) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "left" | "right";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        // Trigger content is arbitrary (often its own <button>), so don't
        // force a native <button> wrapper — Base UI adds role + keyboard
        // handling to the span instead, with no a11y warning.
        nativeButton={false}
        render={(props, state) => (
          <span {...props} style={{ display: "inline-flex" }}>
            {trigger(state.open)}
          </span>
        )}
      />
      <DropdownMenuContent
        align={align === "right" ? "end" : "start"}
        sideOffset={6}
        style={width ? { width } : undefined}
      >
        {typeof children === "function" ? children(close) : children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MenuItem({
  children,
  onSelect,
  checked,
  hint,
}: {
  children: ReactNode;
  onSelect?: () => void;
  checked?: boolean;
  hint?: string;
}) {
  return (
    <DropdownMenuItem
      closeOnClick
      onClick={onSelect}
      className={cn(checked && "bg-accent/60")}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {hint ? (
        <span className="ml-auto text-xs text-muted-foreground">{hint}</span>
      ) : null}
      {checked ? <CheckIcon className="size-3.5 text-primary" /> : null}
    </DropdownMenuItem>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenuLabel>{children}</DropdownMenuLabel>;
}

export function MenuSeparator() {
  return <DropdownMenuSeparator />;
}

/* ---------- switch (shadcn Switch, legacy on/onChange API) ---------- */

export function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <ShadcnSwitch
      checked={on}
      onCheckedChange={onChange}
      aria-label={label}
    />
  );
}

export { Button };