import type { JobStatus } from "@/src/infrastructure/models/supabase"

/**
 * Single source of truth for the job-status visual + label tokens
 * used by the jobs list (`page.tsx`) and detail drawer
 * (`job-detail-drawer.tsx`). Extracted so a new `JobStatus` value
 * added to one consumer can't silently diverge from the other.
 */

export const STATUS_TONE: Record<JobStatus, string> = {
  draft: "border-border-subtle bg-muted/60 text-muted-foreground",
  scheduled: "border-info-border bg-info-bg text-info-foreground",
  in_progress: "border-warning-border bg-warning-bg text-warning-foreground",
  completed: "border-success-border bg-success-bg text-success-foreground",
  cancelled: "border-border-subtle bg-muted text-muted-foreground",
}

export const STATUS_LABEL: Record<JobStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
}

export function formatDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString()
}
