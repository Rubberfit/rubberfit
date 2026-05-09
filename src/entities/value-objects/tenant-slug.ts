import { InvalidValueObjectError } from "@/src/entities/errors/invalid-value-object.error"

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/
const SLUG_MIN_LENGTH = 2
const SLUG_MAX_LENGTH = 100

/**
 * URL-safe tenant identifier. Matches the DB CHECK constraint
 *   tenants_slug_format: ^[a-z0-9][a-z0-9-]*[a-z0-9]$
 *
 * Lowercase alphanumeric + hyphens. Must start and end with alphanumeric
 * (no leading/trailing dashes). Minimum 2 characters; maximum 100
 * (varchar(100) on tenants.slug).
 */
export class TenantSlug {
  public readonly value: string

  private constructor(value: string) {
    this.value = value
  }

  static create(value: string): TenantSlug {
    if (value.length < SLUG_MIN_LENGTH) {
      throw new InvalidValueObjectError(
        "TenantSlug",
        `must be at least ${SLUG_MIN_LENGTH} characters`,
        value,
      )
    }
    if (value.length > SLUG_MAX_LENGTH) {
      throw new InvalidValueObjectError(
        "TenantSlug",
        `must be ${SLUG_MAX_LENGTH} characters or fewer`,
        value,
      )
    }
    if (!SLUG_REGEX.test(value)) {
      throw new InvalidValueObjectError(
        "TenantSlug",
        "must be lowercase alphanumeric with hyphens (cannot start or end with a hyphen)",
        value,
      )
    }
    return new TenantSlug(value)
  }

  static fromPersistence(value: string): TenantSlug {
    return new TenantSlug(value)
  }

  equals(other: TenantSlug | null | undefined): boolean {
    if (!other) return false
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }

  toJSON(): string {
    return this.value
  }
}
