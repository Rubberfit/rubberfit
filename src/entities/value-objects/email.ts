import { InvalidValueObjectError } from "@/src/entities/errors/invalid-value-object.error"

const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
const EMAIL_MAX_LENGTH = 320 // matches varchar(320) on profiles.email + invitations.email

/**
 * Email address. Format mirrors the DB CHECK constraint applied to
 * profiles.email and invitations.email so app-side validation matches
 * DB-side rejection exactly.
 *
 * Lifecycle:
 *   create(input)          → user-supplied; validated and trimmed
 *   fromPersistence(value) → DB-sourced; trusted, no validation
 *
 * Stored case-preserved. Use `toLowercase()` when comparing or looking up —
 * RFC 5321 makes the local part technically case-sensitive but every mail
 * provider treats it case-insensitive in practice.
 */
export class Email {
  public readonly value: string

  private constructor(value: string) {
    this.value = value
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  /**
   * Validate and construct an Email from user-supplied input. Trims input;
   * throws InvalidValueObjectError on empty / too-long / malformed values.
   */
  static create(input: string): Email {
    const trimmed = input.trim()
    if (trimmed.length === 0) {
      throw new InvalidValueObjectError("Email", "must not be empty", input)
    }
    if (trimmed.length > EMAIL_MAX_LENGTH) {
      throw new InvalidValueObjectError(
        "Email",
        `must be ${EMAIL_MAX_LENGTH} characters or fewer`,
        input,
      )
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      throw new InvalidValueObjectError("Email", "invalid format", input)
    }
    return new Email(trimmed)
  }

  /**
   * Reconstitute an Email from a persisted value. NO validation — the DB is
   * the source of truth; the column-level CHECK constraint enforces format.
   * Called only by repository hydration mappers.
   */
  static fromPersistence(value: string): Email {
    return new Email(value)
  }

  // ─── Operations ──────────────────────────────────────────────────────────

  /** Value-equality. Null/undefined-safe for ergonomic comparisons. */
  equals(other: Email | null | undefined): boolean {
    if (!other) return false
    return this.value === other.value
  }

  /** Lowercase form for case-insensitive comparison/lookup. */
  toLowercase(): Email {
    return new Email(this.value.toLowerCase())
  }

  /** Domain part of the email (everything after the @). */
  get domain(): string {
    return this.value.slice(this.value.indexOf("@") + 1)
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toString(): string {
    return this.value
  }

  /**
   * Boundary serialization. Returns the raw string so JSON.stringify(email)
   * produces "user@example.com", not '{"value":"user@example.com"}'.
   *
   * Symmetric inverse: Email.fromPersistence(JSON.parse(...))
   */
  toJSON(): string {
    return this.value
  }
}
