import * as React from "react"
import { cn } from "@/lib/utils"

function InputGroup({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & { variant?: "default" | "search" }) {
  const isSearch = variant === "search";

  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        isSearch
          ? "group/input-group relative flex items-center gap-2 rounded-lg bg-transparent px-3 transition-colors outline-none"
          : "group/input-group border-input dark:bg-input/30 relative flex h-9 w-full items-center gap-1.5 rounded-lg border bg-transparent px-2.5 shadow-xs transition-colors outline-none",
        isSearch
          ? "has-[[data-slot=input-group-control]:focus-visible]:border-brand-600 has-[[data-slot=input-group-control]:focus-visible]:bg-white has-[[data-slot=input-group-control]:focus-visible]:shadow-[0_0_0_3px_rgba(12,102,228,0.15)]"
          : "has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-3 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50",
        isSearch
          ? ""
          : "has-[[data-slot=input-group-control][aria-invalid=true]]:border-destructive has-[[data-slot=input-group-control][aria-invalid=true]]:ring-destructive/20 dark:has-[[data-slot=input-group-control][aria-invalid=true]]:ring-destructive/40",
        isSearch && "bg-slate-50 border border-slate-200",
        isSearch && "hover:border-slate-300",
        className
      )}
      {...props}
    />
  )
}

function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: React.ComponentProps<"div"> & {
  align?: "inline-start" | "inline-end"
}) {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(
        "text-muted-foreground flex shrink-0 items-center gap-1 text-sm [&_svg:not([class*='size-'])]:size-4",
        align === "inline-start" && "order-first",
        align === "inline-end" && "order-last",
        className
      )}
      {...props}
    />
  )
}

function InputGroupInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input-group-control"
      className={cn(
        "h-full min-w-0 flex-1 bg-transparent text-sm outline-none select-text placeholder:text-muted-foreground disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { InputGroup, InputGroupAddon, InputGroupInput }
