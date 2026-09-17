"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "default" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "xs" | "lg" | "icon";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "ui-btn ui-btn-primary",
  default: "ui-btn",
  secondary: "ui-btn ui-btn-secondary",
  ghost: "ui-btn ui-btn-ghost",
  danger: "ui-btn ui-btn-danger",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "ui-btn-sm",
  xs: "ui-btn-xs",
  lg: "ui-btn-lg",
  icon: "ui-btn-icon",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  appName?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** Shared shadcn-style button — variant/size API mirrors the frontend primitives. */
export const Button = ({
  children,
  className,
  appName,
  variant = "default",
  size,
  type = "button",
  ...rest
}: ButtonProps) => {
  void appName;
  return (
    <button
      type={type}
      className={[VARIANT_CLASS[variant], size && SIZE_CLASS[size], className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
};
