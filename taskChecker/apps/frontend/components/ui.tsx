/* Shared UI primitives — no hooks, safe in server & client components. */

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

/* ---------- button ---------- */

type ButtonVariant =
  | "primary"
  | "default"
  | "ghost"
  | "danger"
  | "ink";

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
    <button
      className={cx(
        "btn",
        variant === "primary" && "btn-primary",
        variant === "ghost" && "btn-ghost",
        variant === "danger" && "btn-danger",
        variant === "ink" && "btn-ink",
        size === "sm" && "btn-sm",
        size === "xs" && "btn-xs",
        size === "lg" && "btn-lg",
        size === "icon" && "btn-icon",
        className
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
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
        "btn",
        variant === "primary" && "btn-primary",
        variant === "ghost" && "btn-ghost",
        variant === "danger" && "btn-danger",
        variant === "ink" && "btn-ink",
        size === "sm" && "btn-sm",
        size === "xs" && "btn-xs",
        size === "lg" && "btn-lg",
        className
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

/* ---------- badges ---------- */

export function StatusBadge({
  status,
  size,
}: {
  status: TaskStatus;
  size?: "sm";
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cx("badge", "status-badge", size === "sm" && "btn-xs")}
      style={{ ["--pc" as string]: meta.color }}
    >
      <span className="badge-dot" />
      {meta.label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const meta = PRIORITY_META[priority];
  return (
    <span
      className="badge prio-badge"
      style={{ ["--pc" as string]: meta.color }}
      title={`Priority: ${meta.label}`}
    >
      <span className="prio-dot" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const meta = ROLE_META[role as keyof typeof ROLE_META] ?? ROLE_META.member;
  return (
    <span className="badge role-badge" style={{ color: meta.color }}>
      {meta.label}
    </span>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="tcard-tag">{children}</span>;
}

/* ---------- avatars ---------- */

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
    <span
      title={title ?? name}
      className={cx("avatar", `avatar-${size}`, accent && "avatar-accent")}
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
    </span>
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
    <span className="avatar-stack">
      {shown.map((n, i) => (
        <Avatar key={n + i} name={n} tint={tints?.[i] ?? 220} size="sm" />
      ))}
      {extra > 0 ? <Avatar name={`+${extra}`} size="sm" accent /> : null}
    </span>
  );
}

/* ---------- structural bits ---------- */

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}

export function Meter({
  pct,
  tone = "accent",
}: {
  pct: number;
  tone?: "accent" | "ok" | "warn" | "err";
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="meter">
      <div
        className={cx("meter-fill", tone !== "accent" && tone)}
        style={{ width: `${clamped}%` }}
      />
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
    <div className="empty">
      <div className="empty-ico">{icon}</div>
      <div className="empty-title">{title}</div>
      <p className="empty-msg">{msg}</p>
      {action}
    </div>
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
    <header className="page-head">
      <div>
        {eyebrow ? <div className="eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</div> : null}
        <h1 className="page-title">{title}</h1>
        {desc ? <p className="page-desc">{desc}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </header>
  );
}