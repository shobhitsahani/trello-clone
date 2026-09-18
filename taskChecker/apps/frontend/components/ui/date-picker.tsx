"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface DatePickerProps {
  value?: Date
  onSelect?: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
  /** dates before this day are not selectable (e.g. deadline pickers pass today) */
  minDate?: Date
  id?: string
  className?: string
}

/**
 * DatePicker — Popover + Calendar composition (single date + presets).
 *
 * ```tsx
 * const [date, setDate] = React.useState<Date>()
 * <DatePicker value={date} onSelect={setDate} />
 * ```
 */
export function DatePicker({
  value,
  onSelect,
  placeholder = "Pick a date",
  disabled,
  minDate,
  id,
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        data-empty={!value}
        render={
          <Button
            variant="outline"
            className={cn(
              "justify-start text-left font-normal data-[empty=true]:text-muted-foreground",
              !value && "text-muted-foreground",
              className,
            )}
          />
        }
      >
        <CalendarIcon />
        {value ? format(value, "PPP") : <span>{placeholder}</span>}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(date) => {
            onSelect?.(date)
            if (date) setOpen(false)
          }}
          disabled={minDate ? { before: minDate } : undefined}
        />
        <div className="flex items-center gap-1 border-t border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const today = new Date()
              onSelect?.(today)
              setOpen(false)
            }}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onSelect?.(undefined)
              setOpen(false)
            }}
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
