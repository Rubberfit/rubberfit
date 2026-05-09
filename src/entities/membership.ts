import type { AppRole } from "@/src/application/permissions"
import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import {
  MembershipId,
  ProfileId,
  TenantId,
} from "@/src/entities/value-objects/id"

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateMembershipProps {
  id: MembershipId
  tenantId: TenantId
  profileId: ProfileId
  roles: AppRole[]
  invitedBy?: ProfileId | null
  createdBy?: ProfileId | null
}

export interface ReconstituteMembershipProps {
  id: MembershipId
  tenantId: TenantId
  profileId: ProfileId
  roles: AppRole[]
  invitedBy: ProfileId | null
  createdAt: Date
  createdBy: ProfileId | null
  updatedAt: Date
  updatedBy: ProfileId | null
  deletedAt: Date | null
}

export interface MembershipSnapshot {
  id: string
  tenantId: string
  profileId: string
  roles: AppRole[]
  invitedBy: string | null
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
  deletedAt: string | null
}

// ─── Entity ────────────────────────────────────────────────────────────────

/**
 * A user's access to a tenant. Aggregate root — references Tenant and
 * Profile by ID, doesn't hold full instances.
 *
 * The roles array holds the user's roles within that tenant — a user can
 * be (cutter + supervisor) at the same time. The DB CHECK constraint
 * memberships_roles_valid enforces non-empty + valid role names.
 *
 * Source: memberships table.
 */
export class Membership {
  #id: MembershipId
  #tenantId: TenantId
  #profileId: ProfileId
  #roles: AppRole[]
  #invitedBy: ProfileId | null
  #createdAt: Date
  #createdBy: ProfileId | null
  #updatedAt: Date
  #updatedBy: ProfileId | null
  #deletedAt: Date | null

  private constructor(props: ReconstituteMembershipProps) {
    this.#id = props.id
    this.#tenantId = props.tenantId
    this.#profileId = props.profileId
    this.#roles = [...props.roles]
    this.#invitedBy = props.invitedBy
    this.#createdAt = props.createdAt
    this.#createdBy = props.createdBy
    this.#updatedAt = props.updatedAt
    this.#updatedBy = props.updatedBy
    this.#deletedAt = props.deletedAt
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  /**
   * Construct a brand-new Membership for insert. Validates the entity-level
   * invariant that roles must be non-empty (DB CHECK enforces it too —
   * failing fast in the factory gives a cleaner error path).
   */
  static create(
    props: CreateMembershipProps,
    now: Date = new Date(),
  ): Membership {
    if (props.roles.length === 0) {
      throw new InvalidEntityError("Membership", "roles must not be empty")
    }
    return new Membership({
      id: props.id,
      tenantId: props.tenantId,
      profileId: props.profileId,
      roles: [...props.roles],
      invitedBy: props.invitedBy ?? null,
      createdAt: now,
      createdBy: props.createdBy ?? null,
      updatedAt: now,
      updatedBy: null,
      deletedAt: null,
    })
  }

  static reconstitute(props: ReconstituteMembershipProps): Membership {
    return new Membership(props)
  }

  static fromJSON(s: MembershipSnapshot): Membership {
    return Membership.reconstitute({
      id: MembershipId.fromPersistence(s.id),
      tenantId: TenantId.fromPersistence(s.tenantId),
      profileId: ProfileId.fromPersistence(s.profileId),
      roles: s.roles,
      invitedBy: s.invitedBy ? ProfileId.fromPersistence(s.invitedBy) : null,
      createdAt: new Date(s.createdAt),
      createdBy: s.createdBy ? ProfileId.fromPersistence(s.createdBy) : null,
      updatedAt: new Date(s.updatedAt),
      updatedBy: s.updatedBy ? ProfileId.fromPersistence(s.updatedBy) : null,
      deletedAt: s.deletedAt ? new Date(s.deletedAt) : null,
    })
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get id(): MembershipId { return this.#id }
  get tenantId(): TenantId { return this.#tenantId }
  get profileId(): ProfileId { return this.#profileId }
  /** Read-only view of the roles array. Mutators can't observe through this. */
  get roles(): readonly AppRole[] { return this.#roles }
  get invitedBy(): ProfileId | null { return this.#invitedBy }
  get createdAt(): Date { return this.#createdAt }
  get createdBy(): ProfileId | null { return this.#createdBy }
  get updatedAt(): Date { return this.#updatedAt }
  get updatedBy(): ProfileId | null { return this.#updatedBy }
  get deletedAt(): Date | null { return this.#deletedAt }

  // ─── State queries ───────────────────────────────────────────────────────

  get isDeleted(): boolean {
    return this.#deletedAt !== null
  }

  hasRole(role: AppRole): boolean {
    return this.#roles.includes(role)
  }

  hasAnyRole(required: readonly AppRole[]): boolean {
    return this.#roles.some((r) => required.includes(r))
  }

  // ─── State transitions ───────────────────────────────────────────────────

  /**
   * Replace the roles array. Validates non-empty and de-dupes via Set
   * comparison; returns no-op if the new set equals the current set.
   *
   * Cross-aggregate invariants (e.g., "tenant must keep ≥1 admin") are not
   * enforced here — that's the use case's responsibility, since the entity
   * doesn't know about sibling memberships.
   */
  updateRoles(
    newRoles: readonly AppRole[],
    updatedBy: ProfileId,
    now: Date = new Date(),
  ): void {
    this.#assertNotDeleted("update roles")
    if (newRoles.length === 0) {
      throw new InvalidEntityError("Membership", "roles must not be empty")
    }
    if (sameRoleSet(this.#roles, newRoles)) return

    this.#roles = [...newRoles]
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Soft-delete. Sets deletedAt; the user can no longer access the tenant.
   * Idempotent. Terminal — no further mutations allowed (rejoining requires
   * a new invitation, which inserts a fresh membership row).
   */
  softDelete(updatedBy: ProfileId, now: Date = new Date()): void {
    if (this.#deletedAt !== null) return
    this.#deletedAt = now
    this.#touchAudit(updatedBy, now)
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  #touchAudit(updatedBy: ProfileId, now: Date): void {
    this.#updatedAt = now
    this.#updatedBy = updatedBy
  }

  #assertNotDeleted(operation: string): void {
    if (this.#deletedAt !== null) {
      throw new InvalidEntityError(
        "Membership",
        `cannot ${operation} on a deleted membership`,
      )
    }
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): MembershipSnapshot {
    return {
      id: this.#id.value,
      tenantId: this.#tenantId.value,
      profileId: this.#profileId.value,
      roles: [...this.#roles],
      invitedBy: this.#invitedBy?.value ?? null,
      createdAt: this.#createdAt.toISOString(),
      createdBy: this.#createdBy?.value ?? null,
      updatedAt: this.#updatedAt.toISOString(),
      updatedBy: this.#updatedBy?.value ?? null,
      deletedAt: this.#deletedAt?.toISOString() ?? null,
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sameRoleSet(
  a: readonly AppRole[],
  b: readonly AppRole[],
): boolean {
  if (a.length !== b.length) return false
  const setA = new Set(a)
  return b.every((r) => setA.has(r))
}
