import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { trimOptional } from "@/src/entities/shared/string-helpers"
import {
  PersonId,
  ProfileId,
  SupplierContactId,
  SupplierId,
  TenantId,
} from "@/src/entities/value-objects/id"

// ─── Constants (mirror DB column lengths) ──────────────────────────────────

const TITLE_MAX = 100
const ROLE_MAX = 50
const DEPARTMENT_MAX = 100

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateSupplierContactProps {
  id: SupplierContactId
  tenantId: TenantId
  supplierId: SupplierId
  personId: PersonId
  title?: string | null
  role?: string | null
  department?: string | null
  isPrimary?: boolean
  createdBy?: ProfileId | null
}

export interface ReconstituteSupplierContactProps {
  id: SupplierContactId
  tenantId: TenantId
  supplierId: SupplierId
  personId: PersonId
  title: string | null
  role: string | null
  department: string | null
  isPrimary: boolean
  isActive: boolean
  createdAt: Date
  createdBy: ProfileId | null
  updatedAt: Date
  updatedBy: ProfileId | null
  deletedAt: Date | null
}

export interface SupplierContactSnapshot {
  id: string
  tenantId: string
  supplierId: string
  personId: string
  title: string | null
  role: string | null
  department: string | null
  isPrimary: boolean
  isActive: boolean
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
  deletedAt: string | null
}

// ─── Entity ────────────────────────────────────────────────────────────────

/**
 * Junction row between a `Supplier` and a `Person`, with metadata about
 * the contact's role at that supplier (title, role, department).
 *
 * Two booleans:
 *   • `isPrimary`  — single primary contact per supplier (DB-enforced via
 *                    a partial unique index on supplier_id WHERE
 *                    is_primary AND is_active AND NOT deleted). Cross-row
 *                    "demote previous primary before promoting new one"
 *                    is a use-case concern (`IPromoteSupplierContactUseCase`),
 *                    NOT this entity's job — it can't see siblings.
 *   • `isActive`   — "we still talk to this contact at this supplier".
 *                    User-facing "remove" wires to `deactivate`, not
 *                    `softDelete`. Same pattern as `Supplier`.
 *
 * Domain rule: a non-active primary is meaningless. So `deactivate()`
 * auto-clears `isPrimary`, and `markPrimary()` rejects an inactive contact.
 *
 * Lifecycle:
 *   create(props)         → new row; trims metadata fields
 *   reconstitute(props)   → DB rehydration, no validation
 *   updateDetails(...)    → bulk-edit title/role/department
 *   markPrimary(...)      → flip isPrimary=true; throws if inactive
 *   clearPrimary(...)     → flip isPrimary=false; idempotent
 *   deactivate(...)       → flip isActive=false AND clear isPrimary
 *   reactivate(...)       → flip isActive=true; throws if soft-deleted
 *   softDelete(...)       → admin-only terminal
 *
 * Source: supplier_contacts table.
 */
export class SupplierContact {
  #id: SupplierContactId
  #tenantId: TenantId
  #supplierId: SupplierId
  #personId: PersonId
  #title: string | null
  #role: string | null
  #department: string | null
  #isPrimary: boolean
  #isActive: boolean
  #createdAt: Date
  #createdBy: ProfileId | null
  #updatedAt: Date
  #updatedBy: ProfileId | null
  #deletedAt: Date | null

  private constructor(props: ReconstituteSupplierContactProps) {
    this.#id = props.id
    this.#tenantId = props.tenantId
    this.#supplierId = props.supplierId
    this.#personId = props.personId
    this.#title = props.title
    this.#role = props.role
    this.#department = props.department
    this.#isPrimary = props.isPrimary
    this.#isActive = props.isActive
    this.#createdAt = props.createdAt
    this.#createdBy = props.createdBy
    this.#updatedAt = props.updatedAt
    this.#updatedBy = props.updatedBy
    this.#deletedAt = props.deletedAt
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static create(props: CreateSupplierContactProps, now: Date = new Date()): SupplierContact {
    const title = trimOptional(props.title, "title", TITLE_MAX, "SupplierContact")
    const role = trimOptional(props.role, "role", ROLE_MAX, "SupplierContact")
    const department = trimOptional(
      props.department,
      "department",
      DEPARTMENT_MAX,
      "SupplierContact"
    )

    return new SupplierContact({
      id: props.id,
      tenantId: props.tenantId,
      supplierId: props.supplierId,
      personId: props.personId,
      title,
      role,
      department,
      isPrimary: props.isPrimary ?? false,
      isActive: true,
      createdAt: now,
      createdBy: props.createdBy ?? null,
      updatedAt: now,
      updatedBy: null,
      deletedAt: null,
    })
  }

  static reconstitute(props: ReconstituteSupplierContactProps): SupplierContact {
    return new SupplierContact(props)
  }

  static fromJSON(s: SupplierContactSnapshot): SupplierContact {
    return SupplierContact.reconstitute({
      id: SupplierContactId.fromPersistence(s.id),
      tenantId: TenantId.fromPersistence(s.tenantId),
      supplierId: SupplierId.fromPersistence(s.supplierId),
      personId: PersonId.fromPersistence(s.personId),
      title: s.title,
      role: s.role,
      department: s.department,
      isPrimary: s.isPrimary,
      isActive: s.isActive,
      createdAt: new Date(s.createdAt),
      createdBy: s.createdBy ? ProfileId.fromPersistence(s.createdBy) : null,
      updatedAt: new Date(s.updatedAt),
      updatedBy: s.updatedBy ? ProfileId.fromPersistence(s.updatedBy) : null,
      deletedAt: s.deletedAt ? new Date(s.deletedAt) : null,
    })
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get id(): SupplierContactId {
    return this.#id
  }
  get tenantId(): TenantId {
    return this.#tenantId
  }
  get supplierId(): SupplierId {
    return this.#supplierId
  }
  get personId(): PersonId {
    return this.#personId
  }
  get title(): string | null {
    return this.#title
  }
  get role(): string | null {
    return this.#role
  }
  get department(): string | null {
    return this.#department
  }
  get isPrimary(): boolean {
    return this.#isPrimary
  }
  get isActive(): boolean {
    return this.#isActive
  }
  get createdAt(): Date {
    return this.#createdAt
  }
  get createdBy(): ProfileId | null {
    return this.#createdBy
  }
  get updatedAt(): Date {
    return this.#updatedAt
  }
  get updatedBy(): ProfileId | null {
    return this.#updatedBy
  }
  get deletedAt(): Date | null {
    return this.#deletedAt
  }

  // ─── State queries ───────────────────────────────────────────────────────

  get isDeleted(): boolean {
    return this.#deletedAt !== null
  }

  // ─── State transitions ───────────────────────────────────────────────────

  /**
   * Bulk-edit the metadata fields. No-op if every field is unchanged.
   * Does NOT touch `isPrimary` or `isActive` — those have dedicated
   * transitions.
   */
  updateDetails(
    title: string | null,
    role: string | null,
    department: string | null,
    updatedBy: ProfileId,
    now: Date = new Date()
  ): void {
    this.#assertNotDeleted("update details")

    const newTitle = trimOptional(title, "title", TITLE_MAX, "SupplierContact")
    const newRole = trimOptional(role, "role", ROLE_MAX, "SupplierContact")
    const newDepartment = trimOptional(department, "department", DEPARTMENT_MAX, "SupplierContact")

    if (newTitle === this.#title && newRole === this.#role && newDepartment === this.#department) {
      return
    }

    this.#title = newTitle
    this.#role = newRole
    this.#department = newDepartment
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Promote to primary contact. Throws if inactive — a non-active primary
   * is meaningless. Cross-row "demote any other primary on this supplier"
   * is the use-case caller's responsibility.
   * Idempotent on a contact that is already primary.
   */
  markPrimary(updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("mark primary")
    if (!this.#isActive) {
      throw new InvalidEntityError("SupplierContact", "cannot mark an inactive contact as primary")
    }
    if (this.#isPrimary) return
    this.#isPrimary = true
    this.#touchAudit(updatedBy, now)
  }

  /** Demote from primary. Idempotent. */
  clearPrimary(updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("clear primary")
    if (!this.#isPrimary) return
    this.#isPrimary = false
    this.#touchAudit(updatedBy, now)
  }

  /**
   * User-facing "remove" action. Flips `isActive` to false AND clears
   * `isPrimary` in one step (a non-active primary is meaningless).
   * Idempotent.
   */
  deactivate(updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("deactivate")
    if (!this.#isActive) return
    this.#isActive = false
    this.#isPrimary = false
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Bring a deactivated contact back. Does NOT auto-restore primary —
   * promotion is an explicit step. Idempotent; throws if soft-deleted.
   */
  reactivate(updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("reactivate")
    if (this.#isActive) return
    this.#isActive = true
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Admin-only soft delete. Existing references stay; row stays in the
   * table for historical reads. Idempotent.
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
        "SupplierContact",
        `cannot ${operation} on a deleted supplier contact`
      )
    }
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): SupplierContactSnapshot {
    return {
      id: this.#id.value,
      tenantId: this.#tenantId.value,
      supplierId: this.#supplierId.value,
      personId: this.#personId.value,
      title: this.#title,
      role: this.#role,
      department: this.#department,
      isPrimary: this.#isPrimary,
      isActive: this.#isActive,
      createdAt: this.#createdAt.toISOString(),
      createdBy: this.#createdBy?.value ?? null,
      updatedAt: this.#updatedAt.toISOString(),
      updatedBy: this.#updatedBy?.value ?? null,
      deletedAt: this.#deletedAt?.toISOString() ?? null,
    }
  }
}
