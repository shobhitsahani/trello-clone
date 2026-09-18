"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "./theme-provider";
import { cx } from "@/lib/utils";

/**
 * Theme toggle built on the shadcn Switch + Label primitives:
 *
 *   <div className="flex items-center space-x-2">
 *     <Switch id="airplane-mode" />
 *     <Label htmlFor="airplane-mode">Airplane Mode</Label>
 *   </div>
 *
 * Checked = dark mode. Persists via ThemeProvider (localStorage) and
 * follows the OS preference until the user picks explicitly.
 */
export function ThemeToggle({
  id = "theme-mode",
  showLabel = true,
  className,
}: {
  id?: string;
  showLabel?: boolean;
  className?: string;
}) {
  const { isDark, toggle } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <div className={cx("flex items-center space-x-2", className)}>
      <Switch
        id={id}
        checked={mounted ? isDark : false}
        onCheckedChange={() => toggle()}
        disabled={!mounted}
        aria-label="Toggle dark mode"
        title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      />
      {showLabel ? (
        <Label
          htmlFor={id}
          className="flex cursor-pointer items-center gap-1.5 text-xs font-medium"
        >
          {isDark ? (
            <>
              <Moon size={13} aria-hidden /> Dark
            </>
          ) : (
            <>
              <Sun size={13} aria-hidden /> Light
            </>
          )}
        </Label>
      ) : null}
    </div>
  );
}

/** Drop-in replacement name for the shadcn SwitchDemo snippet. */
export function SwitchDemo() {
  return <ThemeToggle id="airplane-mode" />;
}
