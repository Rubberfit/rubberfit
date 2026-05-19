import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { Email } from "@/src/entities/value-objects/email"
import { ProfileId, TenantId } from "@/src/entities/value-objects/id"
import { TenantSlug } from "@/src/entities/value-objects/tenant-slug"

export type TenantStatus = "active" | "suspended" | "trial" | "cancelled"

export const TENANT_STATUSES = [
  "active",
  "suspended",
  "trial",
  "cancelled",
] as const satisfies readonly TenantStatus[]

const TENANT_NAME_MAX_LENGTH = 200

// ─── DTOs ──────────────────────────────────────────────────────────────────

/** Input shape for `Tenant.create` — building a brand-new tenant. */
export interface CreateTenantProps {
  id: TenantId
  name: string
  slug: TenantSlug
  logoUrl?: string | null
  status?: TenantStatus
  trialEndsAt?: Date | null
  billingEmail?: Email | null
  stripeCustomerId?: string | null
  createdBy?: ProfileId | null
}

/** Input shape for `Tenant.reconstitute` — rehydration from a persisted row. */
export interface ReconstituteTenantProps {
  id: TenantId
  name: string
  slug: TenantSlug
  logoUrl: string | null
  status: TenantStatus
  trialEndsAt: Date | null
  billingEmail: Email | null
  stripeCustomerId: string | null
  createdAt: Date
  createdBy: ProfileId | null
  updatedAt: Date
  updatedBy: ProfileId | null
  deletedAt: Date | null
}

/**
 * Plain-object snapshot. Used at serialization boundaries:
 *   • Server-action return values (RSC marshalling drops methods)
 *   • React Query cache entries
 *   • RSC props passed to client components
 *
 * VOs are unwrapped to primitive strings; dates are ISO-8601 strings so
 * JSON.stringify is lossless.
 */
export interface TenantSnapshot {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  status: TenantStatus
  trialEndsAt: string | null
  billingEmail: string | null
  stripeCustomerId: string | null
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
  deletedAt: string | null
}

// ─── Entity ────────────────────────────────────────────────────────────────

/**
 * Organization/workspace. Tenant isolation unit — every data row outside
 * the global reference tables (plans, tax_rates) carries a tenant_id
 * pointing here.
 *
 * Aggregate boundary: just Tenant. Memberships, invitations, and (later)
 * the operational data tables are separate aggregates that reference this
 * one by TenantId.
 *
 * Lifecycle:
 *   create(props)       → new tenant, status='active' (or 'trial' with date)
 *   reconstitute(props) → rehydrated from DB row, no invariant checks
 *   suspend()           → active|trial → suspended (reversible)
 *   reactivate()        → suspended → active
 *   softDelete()        → any → cancelled (terminal, deletedAt set)
 *
 * All state transitions bump updatedAt + updatedBy via the private
 * #touchAudit() helper.
 *
 * Source: tenants table.
 */
export class Tenant {
  #id: TenantId
  #name: string
  #slug: TenantSlug
  #logoUrl: string | null
  #status: TenantStatus
  #trialEndsAt: Date | null
  #billingEmail: Email | null
  #stripeCustomerId: string | null
  #createdAt: Date
  #createdBy: ProfileId | null
  #updatedAt: Date
  #updatedBy: ProfileId | null
  #deletedAt: Date | null

  private constructor(props: ReconstituteTenantProps) {
    this.#id = props.id
    this.#name = props.name
    this.#slug = props.slug
    this.#logoUrl = props.logoUrl
    this.#status = props.status
    this.#trialEndsAt = props.trialEndsAt
    this.#billingEmail = props.billingEmail
    this.#stripeCustomerId = props.stripeCustomerId
    this.#createdAt = props.createdAt
    this.#createdBy = props.createdBy
    this.#updatedAt = props.updatedAt
    this.#updatedBy = props.updatedBy
    this.#deletedAt = props.deletedAt
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  /**
   * Construct a brand-new Tenant. Validates entity invariants (name
   * length, trial requires trialEndsAt). Audit timestamps seeded to `now`.
   */
  static create(props: CreateTenantProps, now: Date = new Date()): Tenant {
    const trimmedName = props.name.trim()
    if (trimmedName.length === 0) {
      throw new InvalidEntityError("Tenant", "name must not be empty")
    }
    if (trimmedName.length > TENANT_NAME_MAX_LENGTH) {
      throw new InvalidEntityError(
        "Tenant",
        `name must be ${TENANT_NAME_MAX_LENGTH} characters or fewer`
      )
    }

    const status = props.status ?? "active"
    if (status === "trial" && !props.trialEndsAt) {
      throw new InvalidEntityError("Tenant", "trial status requires trialEndsAt")
    }

    return new Tenant({
      id: props.id,
      name: trimmedName,
      slug: props.slug,
      logoUrl: props.logoUrl ?? null,
      status,
      trialEndsAt: props.trialEndsAt ?? null,
      billingEmail: props.billingEmail ?? null,
      stripeCustomerId: props.stripeCustomerId ?? null,
      createdAt: now,
      createdBy: props.createdBy ?? null,
      updatedAt: now,
      updatedBy: null,
      deletedAt: null,
    })
  }

  /**
   * Rehydrate a Tenant from a persisted row. NO invariant validation — the
   * DB is the source of truth for previously-saved state. Called only by
   * the repository's hydration mapper.
   */
  static reconstitute(props: ReconstituteTenantProps): Tenant {
    return new Tenant(props)
  }

  /**
   * Inverse of `toJSON()`. Used on the client when receiving a snapshot
   * via a server-action return value.
   */
  static fromJSON(snapshot: TenantSnapshot): Tenant {
    return Tenant.reconstitute({
      id: TenantId.fromPersistence(snapshot.id),
      name: snapshot.name,
      slug: TenantSlug.fromPersistence(snapshot.slug),
      logoUrl: snapshot.logoUrl,
      status: snapshot.status,
      trialEndsAt: snapshot.trialEndsAt ? new Date(snapshot.trialEndsAt) : null,
      billingEmail: snapshot.billingEmail ? Email.fromPersistence(snapshot.billingEmail) : null,
      stripeCustomerId: snapshot.stripeCustomerId,
      createdAt: new Date(snapshot.createdAt),
      createdBy: snapshot.createdBy ? ProfileId.fromPersistence(snapshot.createdBy) : null,
      updatedAt: new Date(snapshot.updatedAt),
      updatedBy: snapshot.updatedBy ? ProfileId.fromPersistence(snapshot.updatedBy) : null,
      deletedAt: snapshot.deletedAt ? new Date(snapshot.deletedAt) : null,
    })
  }

  // ─── Property getters ────────────────────────────────────────────────────

  get id(): TenantId {
    return this.#id
  }
  get name(): string {
    return this.#name
  }
  get slug(): TenantSlug {
    return this.#slug
  }
  get logoUrl(): string | null {
    return this.#logoUrl
  }
  get status(): TenantStatus {
    return this.#status
  }
  get trialEndsAt(): Date | null {
    return this.#trialEndsAt
  }
  get billingEmail(): Email | null {
    return this.#billingEmail
  }
  get stripeCustomerId(): string | null {
    return this.#stripeCustomerId
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

  /** True when members can sign in (active or in trial, not deleted). */
  get isActive(): boolean {
    return this.#deletedAt === null && (this.#status === "active" || this.#status === "trial")
  }

  get isSuspended(): boolean {
    return this.#status === "suspended"
  }

  get isDeleted(): boolean {
    return this.#deletedAt !== null
  }

  /** True when in trial AND the trial period hasn't elapsed. */
  isInActiveTrial(now: Date = new Date()): boolean {
    return (
      this.#status === "trial" &&
      this.#trialEndsAt !== null &&
      this.#trialEndsAt.getTime() > now.getTime()
    )
  }

  // ─── State transitions ───────────────────────────────────────────────────

  /** Rename the tenant. Validates length invariant and trims input. */
  rename(newName: string, updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("rename")
    const trimmed = newName.trim()
    if (trimmed.length === 0) {
      throw new InvalidEntityError("Tenant", "name must not be empty")
    }
    if (trimmed.length > TENANT_NAME_MAX_LENGTH) {
      throw new InvalidEntityError(
        "Tenant",
        `name must be ${TENANT_NAME_MAX_LENGTH} characters or fewer`
      )
    }
    if (trimmed === this.#name) return
    this.#name = trimmed
    this.#touchAudit(updatedBy, now)
  }

  /** Change or clear the logo URL. */
  changeLogoUrl(newLogoUrl: string | null, updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("change logo")
    if (newLogoUrl === this.#logoUrl) return
    this.#logoUrl = newLogoUrl
    this.#touchAudit(updatedBy, now)
  }

  /** Change or clear the billing email. */
  changeBillingEmail(newEmail: Email | null, updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("change billing email")
    if (newEmail === null && this.#billingEmail === null) return
    if (newEmail !== null && this.#billingEmail !== null && newEmail.equals(this.#billingEmail)) {
      return
    }
    this.#billingEmail = newEmail
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Link the tenant to a Stripe customer (called by billing flow on first
   * subscription). Pass null to unlink.
   */
  linkStripeCustomer(
    stripeCustomerId: string | null,
    updatedBy: ProfileId,
    now: Date = new Date()
  ): void {
    this.#assertNotDeleted("link stripe customer")
    if (stripeCustomerId === this.#stripeCustomerId) return
    this.#stripeCustomerId = stripeCustomerId
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Suspend the tenant. Members can no longer sign in but data is
   * preserved. Idempotent. Reversible via `reactivate()`.
   */
  suspend(updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("suspend")
    if (this.#status === "suspended") return
    this.#status = "suspended"
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Reactivate a suspended tenant. Idempotent if already active. Refuses
   * to act on tenants in 'trial' or 'cancelled' state.
   */
  reactivate(updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("reactivate")
    if (this.#status === "active") return
    if (this.#status !== "suspended") {
      throw new InvalidEntityError(
        "Tenant",
        `cannot reactivate from status "${this.#status}" — only suspended tenants can be reactivated`
      )
    }
    this.#status = "active"
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Soft-delete (cancel) the tenant. Sets status='cancelled' and
   * deletedAt. Terminal — no further mutations allowed. Idempotent.
   */
  softDelete(updatedBy: ProfileId, now: Date = new Date()): void {
    if (this.#deletedAt !== null) return
    this.#status = "cancelled"
    this.#deletedAt = now
    this.#touchAudit(updatedBy, now)
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  /**
   * Bump audit fields. Called by every state-transition method so
   * updatedAt and updatedBy stay in sync without per-method duplication.
   */
  #touchAudit(updatedBy: ProfileId, now: Date): void {
    this.#updatedAt = now
    this.#updatedBy = updatedBy
  }

  /**
   * Refuse to mutate a soft-deleted tenant. The DB CHECK won't catch this —
   * deleted rows are still UPDATE-able at the DB level — so the entity
   * enforces it.
   */
  #assertNotDeleted(operation: string): void {
    if (this.#deletedAt !== null) {
      throw new InvalidEntityError("Tenant", `cannot ${operation} a deleted tenant`)
    }
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  /**
   * Plain-object snapshot for serialization boundaries. VOs unwrap to
   * raw strings; dates become ISO-8601 strings.
   */
  toJSON(): TenantSnapshot {
    return {
      id: this.#id.value,
      name: this.#name,
      slug: this.#slug.value,
      logoUrl: this.#logoUrl,
      status: this.#status,
      trialEndsAt: this.#trialEndsAt?.toISOString() ?? null,
      billingEmail: this.#billingEmail?.value ?? null,
      stripeCustomerId: this.#stripeCustomerId,
      createdAt: this.#createdAt.toISOString(),
      createdBy: this.#createdBy?.value ?? null,
      updatedAt: this.#updatedAt.toISOString(),
      updatedBy: this.#updatedBy?.value ?? null,
      deletedAt: this.#deletedAt?.toISOString() ?? null,
    }
  }
}
