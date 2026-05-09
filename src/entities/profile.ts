import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { Email } from "@/src/entities/value-objects/email"
import { ProfileId } from "@/src/entities/value-objects/id"

const PROFILE_NAME_MAX_LENGTH = 100

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface ReconstituteProfileProps {
  id: ProfileId
  firstName: string | null
  lastName: string | null
  fullName: string | null // computed by DB (STORED GENERATED column)
  email: Email | null
  isPlatformAdmin: boolean
  createdAt: Date
  updatedAt: Date
}

export interface ProfileSnapshot {
  id: string
  firstName: string | null
  lastName: string | null
  fullName: string | null
  email: string | null
  isPlatformAdmin: boolean
  createdAt: string
  updatedAt: string
}

// ─── Entity ────────────────────────────────────────────────────────────────

/**
 * User profile. One row per auth.users (shared PK). Cross-tenant identity —
 * roles are not on this entity, they live on memberships (per-tenant).
 *
 * No `create()` factory: profiles are created by Supabase's auth.users
 * INSERT trigger, not by application code. The application layer reads +
 * mutates existing profiles only.
 *
 * Note: profiles table has no created_by/updated_by columns (unlike tenants
 * and memberships) — mutations only bump updatedAt. Sensitive changes
 * (e.g., grantPlatformAdmin) are audited separately via admin.activity_log.
 *
 * Source: profiles table.
 */
export class Profile {
  #id: ProfileId
  #firstName: string | null
  #lastName: string | null
  #fullName: string | null
  #email: Email | null
  #isPlatformAdmin: boolean
  #createdAt: Date
  #updatedAt: Date

  private constructor(props: ReconstituteProfileProps) {
    this.#id = props.id
    this.#firstName = props.firstName
    this.#lastName = props.lastName
    this.#fullName = props.fullName
    this.#email = props.email
    this.#isPlatformAdmin = props.isPlatformAdmin
    this.#createdAt = props.createdAt
    this.#updatedAt = props.updatedAt
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static reconstitute(props: ReconstituteProfileProps): Profile {
    return new Profile(props)
  }

  static fromJSON(s: ProfileSnapshot): Profile {
    return Profile.reconstitute({
      id: ProfileId.fromPersistence(s.id),
      firstName: s.firstName,
      lastName: s.lastName,
      fullName: s.fullName,
      email: s.email ? Email.fromPersistence(s.email) : null,
      isPlatformAdmin: s.isPlatformAdmin,
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt),
    })
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get id(): ProfileId { return this.#id }
  get firstName(): string | null { return this.#firstName }
  get lastName(): string | null { return this.#lastName }
  get fullName(): string | null { return this.#fullName }
  get email(): Email | null { return this.#email }
  get isPlatformAdmin(): boolean { return this.#isPlatformAdmin }
  get createdAt(): Date { return this.#createdAt }
  get updatedAt(): Date { return this.#updatedAt }

  // ─── State transitions ───────────────────────────────────────────────────

  /**
   * Update first and last name. Pass null to clear either field. Trims
   * input. The DB-computed fullName updates lazily — re-fetch the profile
   * to see the new value.
   */
  updateName(
    firstName: string | null,
    lastName: string | null,
    now: Date = new Date(),
  ): void {
    const trimmedFirst = firstName?.trim() || null
    const trimmedLast = lastName?.trim() || null

    if (trimmedFirst !== null && trimmedFirst.length > PROFILE_NAME_MAX_LENGTH) {
      throw new InvalidEntityError(
        "Profile",
        `firstName must be ${PROFILE_NAME_MAX_LENGTH} characters or fewer`,
      )
    }
    if (trimmedLast !== null && trimmedLast.length > PROFILE_NAME_MAX_LENGTH) {
      throw new InvalidEntityError(
        "Profile",
        `lastName must be ${PROFILE_NAME_MAX_LENGTH} characters or fewer`,
      )
    }

    if (trimmedFirst === this.#firstName && trimmedLast === this.#lastName) {
      return // no-op
    }

    this.#firstName = trimmedFirst
    this.#lastName = trimmedLast
    this.#updatedAt = now
  }

  /**
   * Update the profile-side email mirror. Pass null to clear. The actual
   * sign-in email lives on auth.users; this column is the cached display
   * value kept in sync by an auth-side trigger or service.
   */
  updateEmail(newEmail: Email | null, now: Date = new Date()): void {
    if (newEmail === null && this.#email === null) return
    if (
      newEmail !== null &&
      this.#email !== null &&
      newEmail.equals(this.#email)
    ) {
      return
    }
    this.#email = newEmail
    this.#updatedAt = now
  }

  /**
   * Grant platform-admin status. Idempotent. The caller (use case) is
   * responsible for permission gating — only existing platform admins can
   * grant.
   */
  grantPlatformAdmin(now: Date = new Date()): void {
    if (this.#isPlatformAdmin) return
    this.#isPlatformAdmin = true
    this.#updatedAt = now
  }

  /**
   * Revoke platform-admin status. Idempotent. Cannot be self-revoked — the
   * use case enforces that to prevent platform-admin lockout.
   */
  revokePlatformAdmin(now: Date = new Date()): void {
    if (!this.#isPlatformAdmin) return
    this.#isPlatformAdmin = false
    this.#updatedAt = now
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): ProfileSnapshot {
    return {
      id: this.#id.value,
      firstName: this.#firstName,
      lastName: this.#lastName,
      fullName: this.#fullName,
      email: this.#email?.value ?? null,
      isPlatformAdmin: this.#isPlatformAdmin,
      createdAt: this.#createdAt.toISOString(),
      updatedAt: this.#updatedAt.toISOString(),
    }
  }
}
