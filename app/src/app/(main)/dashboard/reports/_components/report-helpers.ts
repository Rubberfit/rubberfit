import { format, subDays, subWeeks, subMonths } from "date-fns"
import {
  STANDARD_REPORT_COLORS,
  DYNAMIC_COLOR_PALETTE,
  hashString,
  type ReportTemplate,
} from "./report-templates"

export function getTypeColor(type: string, dynamicTypeColorMap: Map<string, string>): string {
  // First check if it's a standard type with a predefined color
  if (STANDARD_REPORT_COLORS[type.toLowerCase()]) {
    return STANDARD_REPORT_COLORS[type.toLowerCase()]
  }

  // For dynamic types, check if we've already assigned a color
  if (dynamicTypeColorMap.has(type)) {
    return dynamicTypeColorMap.get(type)!
  }

  // Assign a new color for this dynamic type
  const typeHash = hashString(type)
  const colorIndex = typeHash % DYNAMIC_COLOR_PALETTE.length
  const assignedColor = DYNAMIC_COLOR_PALETTE[colorIndex]

  // Store the assignment for consistency during this session
  dynamicTypeColorMap.set(type, assignedColor)

  return assignedColor
}

export function getFrequencyColor(_frequency: ReportTemplate["frequency"]): "outline" {
  // Using consistent outline variant for all frequencies - less prominent than type badges
  return "outline"
}

export function getPeriodDateRange(
  reportPeriod: "daily" | "weekly" | "monthly" | "quarterly"
): string {
  const endDate = new Date()
  let startDate: Date

  switch (reportPeriod) {
    case "daily":
      startDate = subDays(endDate, 1)
      return `${format(startDate, "MMM dd")} - ${format(endDate, "MMM dd, yyyy")}`
    case "weekly":
      startDate = subWeeks(endDate, 1)
      return `${format(startDate, "MMM dd")} - ${format(endDate, "MMM dd, yyyy")}`
    case "monthly":
      startDate = subMonths(endDate, 1)
      return `${format(startDate, "MMM dd")} - ${format(endDate, "MMM dd, yyyy")}`
    case "quarterly":
      startDate = subMonths(endDate, 3)
      return `${format(startDate, "MMM dd")} - ${format(endDate, "MMM dd, yyyy")}`
    default:
      return ""
  }
}

export function getPeriodLabel(reportPeriod: "daily" | "weekly" | "monthly" | "quarterly"): string {
  return reportPeriod.charAt(0).toUpperCase() + reportPeriod.slice(1)
}
