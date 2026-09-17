/* Shared UI primitives — shadcn-backed, legacy class API preserved. */

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import {
  PRIORITY_META,
  ROLE_META,
  STATUS_META,
  cx,
  initials,
  type Priority,
  type TaskStatus,
} from "../lib/utils";
import { Button as ShadcnButton, buttonVariants } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Avatar as ShadcnAvatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "./ui/avatar";
import { Separator } from "./ui/separator";
import { Empty, EmptyTitle, EmptyDescription } from "./ui/empty";

/* ---------- button (shadcn-backed, legacy API preserved) ---------- */

type ButtonVariant =
  | "primary"
  | "default"
  | "secondary"
  | "ghost"
  | "danger"
  | "destructive"
  | "outline"
  | "link"
  | "ink";

const LEGACY_VARIANT_MAP: Record<ButtonVariant, "default" | "secondary" | "ghost" | "destructive" | "outline" | "link"> = {
  primary: "default",
  default: "secondary",
  secondary: "secondary",
  ghost: "ghost",
  danger: "destructive",
  destructive: "destructive",
  outline: "outline",
  link: "link",
  ink: "secondary",
};

const LEGACY_SIZE_MAP = {
  xs: "xs",
  sm: "sm",
  lg: "lg",
  icon: "icon",
} as const;

export function Button({
  children,
  variant = "default",
  size,
  className,
  icon,
  ...rest
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "xs" | "lg" | "icon";
  className?: string;
  icon?: ReactNode;
} & Omit<ComponentProps<"button">, "className">) {
  return (
    <ShadcnButton
      variant={LEGACY_VARIANT_MAP[variant]}
      size={size ? LEGACY_SIZE_MAP[size] : "default"}
      className={className}
      {...rest}
    >
      {icon}
      {children}
    </ShadcnButton>
  );
}

export function ButtonLink({
  children,
  href,
  variant = "default",
  size,
  className,
  icon,
}: {
  children: ReactNode;
  href: string;
  variant?: ButtonVariant;
  size?: "sm" | "xs" | "lg";
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cx(
        buttonVariants({
          variant: LEGACY_VARIANT_MAP[variant],
          size: size ? LEGACY_SIZE_MAP[size] : "default",
        }),
        className
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

/* ---------- badges (shadcn Badge, project status colors preserved) ---------- */

const STATUS_VARIANT: Record<TaskStatus, "secondary" | "default" | "outline"> = {
  backlog: "secondary",
  todo: "outline",
  in_progress: "default",
  done: "secondary",
};

export function StatusBadge({
  status,
  size,
}: {
  status: TaskStatus;
  size?: "sm";
}) {
  const meta = STATUS_META[status];
  return (
    <Badge variant={STATUS_VARIANT[status]}>
      <span
        aria-hidden
        style={{ width: 6, height: 6, borderRadius: 9999, background: meta.color }}
      />
      {meta.label}
    </Badge>
  );
}

const PRIORITY_VARIANT: Record<Priority, "destructive" | "default" | "secondary" | "outline" | "ghost"> = {
  critical: "destructive",
  high: "default",
  medium: "secondary",
  low: "outline",
  none: "ghost",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const meta = PRIORITY_META[priority];
  return (
    <Badge variant={PRIORITY_VARIANT[priority]} title={`Priority: ${meta.label}`}>
      <span
        aria-hidden
        style={{ width: 6, height: 6, borderRadius: 9999, background: "currentColor" }}
      />
      {meta.label}
    </Badge>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const meta = ROLE_META[role as keyof typeof ROLE_META] ?? ROLE_META.member;
  const elevated = role === "owner" || role === "admin";
  return (
    <Badge variant={elevated ? "default" : "secondary"}>
      {meta.label}
    </Badge>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return <Badge variant="secondary">{children}</Badge>;
}

/* ---------- avatars (shadcn Avatar, hue fallback preserved) ---------- */

export function Avatar({
  name,
  tint = 220,
  size = "md",
  accent,
  title,
}: {
  name: string;
  tint?: number;
  size?: "sm" | "md" | "lg";
  accent?: boolean;
  title?: string;
}) {
  return (
    <ShadcnAvatar
      title={title ?? name}
      size={size === "md" ? "default" : size}
      className={cx(accent && "bg-primary text-primary-foreground")}
    >
      <AvatarFallback
        style={
          accent
            ? undefined
            : {
                background: `hsl(${tint} 45% 20%)`,
                color: `hsl(${tint} 80% 78%)`,
                borderColor: `hsl(${tint} 40% 30%)`,
              }
        }
      >
        {initials(name)}
      </AvatarFallback>
    </ShadcnAvatar>
  );
}

export function AvatarStack({
  names,
  tints,
  max = 4,
}: {
  names: string[];
  tints?: number[];
  max?: number;
}) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <AvatarGroup>
      {shown.map((n, i) => (
        <Avatar key={n + i} name={n} tint={tints?.[i] ?? 220} size="sm" />
      ))}
      {extra > 0 ? <AvatarGroupCount>+{extra}</AvatarGroupCount> : null}
    </AvatarGroup>
  );
}

/* ---------- structural bits ---------- */

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="pointer-events-none inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground select-none">
      {children}
    </kbd>
  );
}

export function Meter({
  pct,
  tone = "accent",
}: {
  pct: number;
  tone?: "accent" | "ok" | "warn" | "err";
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  const bar =
    tone === "ok"
      ? "bg-emerald-500"
      : tone === "warn"
        ? "bg-amber-500"
        : tone === "err"
          ? "bg-destructive"
          : "bg-primary";
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
      <div className={cx("h-full rounded-full transition-all", bar)} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  msg,
  action,
}: {
  icon: ReactNode;
  title: string;
  msg: string;
  action?: ReactNode;
}) {
  return (
    <Empty>
      <span className="text-muted-foreground/50">{icon}</span>
      <EmptyTitle>{title}</EmptyTitle>
      <EmptyDescription>{msg}</EmptyDescription>
      {action}
    </Empty>
  );
}

export function PageHead({
  title,
  desc,
  actions,
  eyebrow,
}: {
  title: string;
  desc?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">{eyebrow}</p> : null}
        <h1 className="text-xl font-semibold tracking-tight text-foreground" style={{ fontFamily: "var(--stack-display)" }}>{title}</h1>
        {desc ? <p className="mt-1 text-sm text-muted-foreground">{desc}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Divider({ className }: { className?: string }) {
  return <Separator className={className} />;
}