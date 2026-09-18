"use client"

import * as React from "react"
import { DayPicker } from "react-day-picker"
import "react-day-picker/style.css"

import { cn } from "@/lib/utils"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

/**
 * Calendar — react-day-picker themed to the app tokens.
 * Compose inside PopoverContent for a DatePicker (see date-picker.tsx).
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  style,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      style={
        {
          "--rdp-accent-color": "var(--primary)",
          "--rdp-accent-background-color": "var(--accent)",
          "--rdp-day-width": "2.25rem",
          "--rdp-day-height": "2.25rem",
          "--rdp-day_button-width": "2.25rem",
          "--rdp-day_button-height": "2.25rem",
          "--rdp-day_button-border-radius": "var(--radius-md, 0.5rem)",
          "--rdp-today-color": "var(--primary)",
          ...style,
        } as React.CSSProperties
      }
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col gap-4",
        month: "flex flex-col gap-2",
        month_caption: "flex items-center justify-between px-1",
        caption_label: "text-sm font-medium",
        nav: "flex items-center gap-1",
        button_previous:
          "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
        button_next:
          "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "w-9 rounded-md text-center text-xs font-normal text-muted-foreground",
        weeks: "flex flex-col gap-0.5",
        week: "flex w-full",
        day: "relative p-0 text-center text-sm",
        day_button:
          "inline-flex size-9 items-center justify-center rounded-md font-normal transition-colors hover:bg-muted hover:text-foreground aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:hover:bg-primary aria-selected:hover:text-primary-foreground disabled:pointer-events-none disabled:opacity-50 data-[today]:font-semibold",
        selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
        today: "font-semibold text-primary",
        outside: "text-muted-foreground opacity-50",
        disabled: "text-muted-foreground opacity-50",
        ...classNames,
      }}
      {...props}
    />
  )
}

export { Calendar }
