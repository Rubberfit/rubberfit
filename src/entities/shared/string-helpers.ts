import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"

/**
 * Trim whitespace; reject if empty after trim or longer than `max`.
 * Throws InvalidEntityError tagged with `entityName` so the error path
 * points at the calling entity.
 *
 * Used at factory + state-transition boundaries to enforce DB-aligned
 * varchar length limits without per-entity duplication.
 */
export function trimRequired(
  value: string,
  field: string,
  max: number,
  entityName: string,
): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new InvalidEntityError(entityName, `${field} must not be empty`)
  }
  if (trimmed.length > max) {
    throw new InvalidEntityError(
      entityName,
      `${field} must be ${max} characters or fewer`,
    )
  }
  return trimmed
}

/**
 * Trim whitespace; treat empty / null / undefined as null. Reject if
 * longer than `max`.
 *
 * Pass `max = null` to skip the length check — useful for `text` columns
 * with no DB-side cap (e.g., `notes`).
 */
export function trimOptional(
  value: string | null | undefined,
  field: string,
  max: number | null,
  entityName: string,
): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (max !== null && trimmed.length > max) {
    throw new InvalidEntityError(
      entityName,
      `${field} must be ${max} characters or fewer`,
    )
  }
  return trimmed
}
