import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"

/**
 * Lifecycle status of a `Job`. Mirrors the `jobs.status` CHECK
 * constraint.
 *
 * Happy path:
 *   draft → scheduled → in_progress → completed
 *
 * Side transitions:
 *   • `* → cancelled` — allowed from any non-terminal state.
 *
 * Both `completed` and `cancelled` are terminal.
 *
 * `scheduled` matches the dev-pattern shop-floor planning view —
 * a job that's been booked into a workflow slot but hasn't started.
 */
export type JobStatus = "draft" | "scheduled" | "in_progress" | "completed" | "cancelled"

export const JOB_STATUSES: readonly JobStatus[] = [
  "draft",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
] as const

const ALLOWED_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  draft: ["scheduled", "cancelled"],
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
}

export function isJobStatus(value: unknown): value is JobStatus {
  return typeof value === "string" && (JOB_STATUSES as readonly string[]).includes(value)
}

export function canJobStatusTransitionTo(from: JobStatus, to: JobStatus): boolean {
  if (from === to) return false
  return ALLOWED_TRANSITIONS[from].includes(to)
}

/**
 * Guard for entity-layer transitions. Throws `InvalidEntityError`
 * tagged as `Job` so error messages point to the aggregate, not the
 * VO file.
 */
export function assertJobStatusTransition(from: JobStatus, to: JobStatus): void {
  if (!canJobStatusTransitionTo(from, to)) {
    throw new InvalidEntityError("Job", `cannot transition status from '${from}' to '${to}'`)
  }
}
