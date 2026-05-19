import type { AppRole } from "@/src/application/permissions"
import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { Email } from "@/src/entities/value-objects/email"
import { InvitationId, ProfileId, TenantId } from "@/src/entities/value-objects/id"
import { InvitationToken } from "@/src/entities/value-objects/invitation-token"

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateInvitationProps {
  id: InvitationId
  tenantId: TenantId
  email: Email
  roles: AppRole[]
  token: InvitationToken
  expiresAt: Date
  invitedBy?: ProfileId | null
}

export interface ReconstituteInvitationProps {
  id: InvitationId
  tenantId: TenantId
  email: Email
  roles: AppRole[]
  token: InvitationToken
  expiresAt: Date
  invitedBy: ProfileId | null
  acceptedAt: Date | null
  revokedAt: Date | null
  lastSendAttemptAt: Date | null
  lastSendError: string | null
  createdAt: Date
}

export interface InvitationSnapshot {
  id: string
  tenantId: string
  email: string
  roles: AppRole[]
  token: string
  expiresAt: string
  invitedBy: string | null
  acceptedAt: string | null
  revokedAt: string | null
  lastSendAttemptAt: string | null
  lastSendError: string | null
  createdAt: string
}

// ─── Entity ────────────────────────────────────────────────────────────────

/**
 * Email-based invitation to join a tenant. Aggregate root — references
 * Tenant by ID. Closed-signup model (per ARC-25 plan v3 decision #5):
 * new users only enter the system via an accepted invitation; signups
 * without a token route to /no-access.
 *
 * Terminal states are tracked by timestamps rather than an enum:
 *   acceptedAt set → user clicked accept (use markAccepted)
 *   revokedAt  set → admin canceled before acceptance (use revoke)
 *   expiresAt past + neither set → silently expired (no mutation needed)
 *
 * The DB CHECK invitations_not_both_terminal forbids acceptedAt and
 * revokedAt being non-null simultaneously.
 *
 * Note: invitations table has no updated_at/updated_by columns — the
 * specific timestamps (acceptedAt, revokedAt, lastSendAttemptAt) tell the
 * full audit story. recordSendSuccess/Failure update lastSendAttemptAt and
 * the error message; the other transitions only touch their own field.
 *
 * Source: invitations table.
 */
export class Invitation {
  #id: InvitationId
  #tenantId: TenantId
  #email: Email
  #roles: AppRole[]
  #token: InvitationToken
  #expiresAt: Date
  #invitedBy: ProfileId | null
  #acceptedAt: Date | null
  #revokedAt: Date | null
  #lastSendAttemptAt: Date | null
  #lastSendError: string | null
  #createdAt: Date

  private constructor(props: ReconstituteInvitationProps) {
    this.#id = props.id
    this.#tenantId = props.tenantId
    this.#email = props.email
    this.#roles = [...props.roles]
    this.#token = props.token
    this.#expiresAt = props.expiresAt
    this.#invitedBy = props.invitedBy
    this.#acceptedAt = props.acceptedAt
    this.#revokedAt = props.revokedAt
    this.#lastSendAttemptAt = props.lastSendAttemptAt
    this.#lastSendError = props.lastSendError
    this.#createdAt = props.createdAt
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  /**
   * Construct a brand-new Invitation for insert. Sets all terminal-state
   * fields (acceptedAt, revokedAt, lastSendAttemptAt, lastSendError) to
   * null. Throws if expiresAt is not in the future or roles is empty.
   */
  static create(props: CreateInvitationProps, now: Date = new Date()): Invitation {
    if (props.roles.length === 0) {
      throw new InvalidEntityError("Invitation", "roles must not be empty")
    }
    if (props.expiresAt.getTime() <= now.getTime()) {
      throw new InvalidEntityError("Invitation", "expiresAt must be in the future")
    }
    return new Invitation({
      id: props.id,
      tenantId: props.tenantId,
      email: props.email,
      roles: [...props.roles],
      token: props.token,
      expiresAt: props.expiresAt,
      invitedBy: props.invitedBy ?? null,
      acceptedAt: null,
      revokedAt: null,
      lastSendAttemptAt: null,
      lastSendError: null,
      createdAt: now,
    })
  }

  static reconstitute(props: ReconstituteInvitationProps): Invitation {
    return new Invitation(props)
  }

  static fromJSON(s: InvitationSnapshot): Invitation {
    return Invitation.reconstitute({
      id: InvitationId.fromPersistence(s.id),
      tenantId: TenantId.fromPersistence(s.tenantId),
      email: Email.fromPersistence(s.email),
      roles: s.roles,
      token: InvitationToken.fromPersistence(s.token),
      expiresAt: new Date(s.expiresAt),
      invitedBy: s.invitedBy ? ProfileId.fromPersistence(s.invitedBy) : null,
      acceptedAt: s.acceptedAt ? new Date(s.acceptedAt) : null,
      revokedAt: s.revokedAt ? new Date(s.revokedAt) : null,
      lastSendAttemptAt: s.lastSendAttemptAt ? new Date(s.lastSendAttemptAt) : null,
      lastSendError: s.lastSendError,
      createdAt: new Date(s.createdAt),
    })
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get id(): InvitationId {
    return this.#id
  }
  get tenantId(): TenantId {
    return this.#tenantId
  }
  get email(): Email {
    return this.#email
  }
  get roles(): readonly AppRole[] {
    return this.#roles
  }
  get token(): InvitationToken {
    return this.#token
  }
  get expiresAt(): Date {
    return this.#expiresAt
  }
  get invitedBy(): ProfileId | null {
    return this.#invitedBy
  }
  get acceptedAt(): Date | null {
    return this.#acceptedAt
  }
  get revokedAt(): Date | null {
    return this.#revokedAt
  }
  get lastSendAttemptAt(): Date | null {
    return this.#lastSendAttemptAt
  }
  get lastSendError(): string | null {
    return this.#lastSendError
  }
  get createdAt(): Date {
    return this.#createdAt
  }

  // ─── State queries ───────────────────────────────────────────────────────

  get isAccepted(): boolean {
    return this.#acceptedAt !== null
  }
  get isRevoked(): boolean {
    return this.#revokedAt !== null
  }
  get hasTerminalState(): boolean {
    return this.isAccepted || this.isRevoked
  }

  isExpired(now: Date = new Date()): boolean {
    return this.#expiresAt.getTime() <= now.getTime()
  }

  /**
   * An invitation is "active" when it can still be accepted: not yet
   * accepted, not revoked, and not past its expiration date.
   *
   * The DB partial unique index `invitations_active_unique` matches the
   * first two conditions but not expiry — expired invitations remain in
   * the table so admins can see and resend them. Use this predicate to
   * gate the accept-page validity check.
   */
  isActive(now: Date = new Date()): boolean {
    return !this.hasTerminalState && !this.isExpired(now)
  }

  // ─── State transitions ───────────────────────────────────────────────────

  /**
   * Mark the invitation as accepted. Should be called from inside the
   * accept_invitation Postgres RPC's transactional boundary so the
   * invitation update + membership insert happen atomically.
   *
   * Idempotent if already accepted. Throws on revoked or expired.
   */
  markAccepted(now: Date = new Date()): void {
    if (this.isAccepted) return
    if (this.isRevoked) {
      throw new InvalidEntityError("Invitation", "cannot accept a revoked invitation")
    }
    if (this.isExpired(now)) {
      throw new InvalidEntityError("Invitation", "cannot accept an expired invitation")
    }
    this.#acceptedAt = now
  }

  /**
   * Revoke the invitation (admin canceled before acceptance). Idempotent
   * if already revoked. Throws if already accepted.
   */
  revoke(now: Date = new Date()): void {
    if (this.isRevoked) return
    if (this.isAccepted) {
      throw new InvalidEntityError("Invitation", "cannot revoke an accepted invitation")
    }
    this.#revokedAt = now
  }

  /**
   * Record a successful email send. Updates lastSendAttemptAt and clears
   * any prior error message.
   */
  recordSendSuccess(now: Date = new Date()): void {
    this.#lastSendAttemptAt = now
    this.#lastSendError = null
  }

  /**
   * Record a failed email send. Updates lastSendAttemptAt and stores the
   * error message for the admin to see in the team-management UI.
   */
  recordSendFailure(error: string, now: Date = new Date()): void {
    this.#lastSendAttemptAt = now
    this.#lastSendError = error
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): InvitationSnapshot {
    return {
      id: this.#id.value,
      tenantId: this.#tenantId.value,
      email: this.#email.value,
      roles: [...this.#roles],
      token: this.#token.value,
      expiresAt: this.#expiresAt.toISOString(),
      invitedBy: this.#invitedBy?.value ?? null,
      acceptedAt: this.#acceptedAt?.toISOString() ?? null,
      revokedAt: this.#revokedAt?.toISOString() ?? null,
      lastSendAttemptAt: this.#lastSendAttemptAt?.toISOString() ?? null,
      lastSendError: this.#lastSendError,
      createdAt: this.#createdAt.toISOString(),
    }
  }
}
