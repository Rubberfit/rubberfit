"use client"

import { CalendarIcon } from "lucide-react"
import { DateRange } from "react-day-picker"

import { useUserPreferences } from "@/app/dashboard/_components/user-preferences-provider"
import { cn } from "@/app/lib/utils"
import { Button } from "@/app/components/ui/button"
import { Calendar } from "@/app/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/app/components/ui/popover"
import { formatUserDate } from "@/src/application/preferences/user-date-format"

/**
 * react-day-picker yields `Date` objects at the **browser's** local
 * midnight, not the operator's `preferences.timeZone`. Passing those
 * straight through `formatUserDate(date, prefs)` would re-derive
 * year/month/day in the prefs zone via `Intl`, which can shift the
 * displayed day by one when the two zones disagree (e.g. browser in
 * Pacific, prefs in Asia/Tokyo: pick May 14 → render "May 15").
 *
 * The picker is a calendar-date control — what the user clicked is
 * the calendar date, not an instant — so normalize to a SQL DATE
 * string and route through the helper's date-only fast path, which
 * preserves the calendar date verbatim regardless of zone.
 */
function toCalendarDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

interface DateRangePickerProps {
  dateRange: {
    from: Date
    to: Date
  }
  onDateRangeChange: (range: { from: Date; to: Date }) => void
}

export function DateRangePicker({ dateRange, onDateRangeChange }: DateRangePickerProps) {
  const preferences = useUserPreferences()
  const handleSelect = (range: DateRange | undefined) => {
    if (range?.from && range?.to) {
      onDateRangeChange({ from: range.from, to: range.to })
    } else if (range?.from) {
      onDateRangeChange({ from: range.from, to: range.from })
    }
  }

  return (
    <div className="grid gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="outline"
            className={cn(
              "w-[300px] justify-start text-left font-normal",
              !dateRange && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateRange?.from ? (
              dateRange.to ? (
                <>
                  {formatUserDate(toCalendarDateString(dateRange.from), preferences)} -{" "}
                  {formatUserDate(toCalendarDateString(dateRange.to), preferences)}
                </>
              ) : (
                formatUserDate(toCalendarDateString(dateRange.from), preferences)
              )
            ) : (
              <span>Pick a date</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={dateRange?.from}
            selected={dateRange}
            onSelect={handleSelect}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
