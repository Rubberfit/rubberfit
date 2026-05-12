import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"

/**
 * Lifecycle status of a `Project`. Mirrors the `projects.status`
 * CHECK constraint.
 *
 * Happy path:
 *   draft → active → completed
 *
 * Side transitions:
 *   • `* → cancelled` — allowed from any non-terminal state
 *
 * Both `completed` and `cancelled` are terminal.
 */
export type ProjectStatus = "draft" | "active" | "completed" | "cancelled"

export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  "draft",
  "active",
  "completed",
  "cancelled",
] as const

const ALLOWED_TRANSITIONS: Readonly<Record<ProjectStatus, readonly ProjectStatus[]>> = {
  draft: ["active", "cancelled"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
}

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value)
}

export function canProjectStatusTransitionTo(from: ProjectStatus, to: ProjectStatus): boolean {
  if (from === to) return false
  return ALLOWED_TRANSITIONS[from].includes(to)
}

/**
 * Guard for entity-layer transitions. Throws `InvalidEntityError`
 * tagged as `Project` so error messages point to the aggregate, not
 * the VO file.
 */
export function assertProjectStatusTransition(from: ProjectStatus, to: ProjectStatus): void {
  if (!canProjectStatusTransitionTo(from, to)) {
    throw new InvalidEntityError("Project", `cannot transition status from '${from}' to '${to}'`)
  }
}
