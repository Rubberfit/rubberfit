import { InvalidValueObjectError } from "@/src/entities/errors/invalid-value-object.error"

const TOKEN_LENGTH = 64 // 32 bytes hex-encoded
const TOKEN_REGEX = /^[0-9a-f]+$/

/**
 * Random token embedded in invitation URLs. Generated server-side at invite
 * time as 32 bytes, hex-encoded — 64 lowercase hex characters total.
 *
 * `create()` normalizes uppercase input to lowercase so URL comparisons stay
 * stable and the unique index in invitations.token has no case-sensitivity
 * surprises. `fromPersistence()` trusts whatever the DB stored.
 */
export class InvitationToken {
  public readonly value: string

  private constructor(value: string) {
    this.value = value
  }

  static create(value: string): InvitationToken {
    const normalized = value.toLowerCase()
    if (normalized.length !== TOKEN_LENGTH) {
      throw new InvalidValueObjectError(
        "InvitationToken",
        `must be exactly ${TOKEN_LENGTH} characters (32 bytes hex)`,
        value
      )
    }
    if (!TOKEN_REGEX.test(normalized)) {
      throw new InvalidValueObjectError(
        "InvitationToken",
        "must contain only hex digits (0-9, a-f)",
        value
      )
    }
    return new InvitationToken(normalized)
  }

  static fromPersistence(value: string): InvitationToken {
    return new InvitationToken(value)
  }

  equals(other: InvitationToken | null | undefined): boolean {
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
