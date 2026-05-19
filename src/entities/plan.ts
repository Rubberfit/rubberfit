import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { PlanId, ProfileId } from "@/src/entities/value-objects/id"
import { Money, type MoneySnapshot } from "@/src/entities/value-objects/money"

// ─── Type unions (matching DB CHECK constraints) ───────────────────────────

/**
 * Closed set of plan codes. Mirrors the DB CHECK
 *   CONSTRAINT plans_code_valid CHECK (code IN ('standard', 'pro', 'max'))
 * so adding a new code requires both a migration AND a type-union update.
 */
export type PlanCode = "standard" | "pro" | "max"

export const PLAN_CODES = ["standard", "pro", "max"] as const satisfies readonly PlanCode[]

/** Stripe-aligned billing cadence. Mirrors plans.billing_interval CHECK. */
export type BillingInterval = "month" | "year"

export const BILLING_INTERVALS = ["month", "year"] as const satisfies readonly BillingInterval[]

// ─── Constants ─────────────────────────────────────────────────────────────

const PLAN_NAME_MAX_LENGTH = 200

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreatePlanProps {
  id: PlanId
  code: PlanCode
  name: string
  /** Plan price (cents + currency). Use `Money.fromCents(amount, currency)`. */
  price: Money
  billingInterval: BillingInterval
  description?: string | null
  stripePriceId?: string | null
  seatLimit?: number | null
  isActive?: boolean // defaults to true
  isPublic?: boolean // defaults to true
  sortOrder?: number // defaults to 0
  features?: readonly string[] // defaults to []
  createdBy?: ProfileId | null
}

export interface ReconstitutePlanProps {
  id: PlanId
  code: PlanCode
  name: string
  description: string | null
  price: Money
  billingInterval: BillingInterval
  stripePriceId: string | null
  seatLimit: number | null
  isActive: boolean
  isPublic: boolean
  sortOrder: number
  features: readonly string[]
  createdAt: Date
  createdBy: ProfileId | null
  updatedAt: Date
  updatedBy: ProfileId | null
  deletedAt: Date | null
}

export interface PlanSnapshot {
  id: string
  code: PlanCode
  name: string
  description: string | null
  price: MoneySnapshot
  billingInterval: BillingInterval
  stripePriceId: string | null
  seatLimit: number | null
  isActive: boolean
  isPublic: boolean
  sortOrder: number
  features: string[]
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
  deletedAt: string | null
}

// ─── Entity ────────────────────────────────────────────────────────────────

/**
 * Subscription plan. Globally scoped (no tenant_id) — read by every
 * tenant, written only by platform admins. Source: plans table.
 *
 * Aggregate boundary: Plan stands alone. Subscription references it by
 * PlanId (cross-aggregate by ID, per the small-aggregates rule).
 *
 * Money is stored as integer cents (`priceCents: number`) per the
 * codebase convention — JS number is safe to 2^53, more than enough for
 * any realistic plan price. The DB column is `bigint`; the repository
 * narrows on read.
 *
 * Lifecycle:
 *   create(props)             → new plan, isActive=true
 *   reconstitute(props)       → DB rehydration, no validation
 *   updatePricing(...)        → change priceCents/currency/billingInterval
 *   linkStripePrice(id)       → link to a Stripe Price object
 *   setVisibility(...)        → toggle isActive / isPublic / sortOrder
 *   updateFeatures(features)  → replace the feature flag list
 *   softDelete()              → terminal; tenants on this plan keep working
 *                               but no new subscriptions can attach
 */
export class Plan {
  #id: PlanId
  #code: PlanCode
  #name: string
  #description: string | null
  #price: Money
  #billingInterval: BillingInterval
  #stripePriceId: string | null
  #seatLimit: number | null
  #isActive: boolean
  #isPublic: boolean
  #sortOrder: number
  #features: string[]
  #createdAt: Date
  #createdBy: ProfileId | null
  #updatedAt: Date
  #updatedBy: ProfileId | null
  #deletedAt: Date | null

  private constructor(props: ReconstitutePlanProps) {
    this.#id = props.id
    this.#code = props.code
    this.#name = props.name
    this.#description = props.description
    this.#price = props.price
    this.#billingInterval = props.billingInterval
    this.#stripePriceId = props.stripePriceId
    this.#seatLimit = props.seatLimit
    this.#isActive = props.isActive
    this.#isPublic = props.isPublic
    this.#sortOrder = props.sortOrder
    this.#features = [...props.features]
    this.#createdAt = props.createdAt
    this.#createdBy = props.createdBy
    this.#updatedAt = props.updatedAt
    this.#updatedBy = props.updatedBy
    this.#deletedAt = props.deletedAt
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static create(props: CreatePlanProps, now: Date = new Date()): Plan {
    const trimmedName = props.name.trim()
    if (trimmedName.length === 0) {
      throw new InvalidEntityError("Plan", "name must not be empty")
    }
    if (trimmedName.length > PLAN_NAME_MAX_LENGTH) {
      throw new InvalidEntityError(
        "Plan",
        `name must be ${PLAN_NAME_MAX_LENGTH} characters or fewer`
      )
    }
    if (props.price.isNegative) {
      throw new InvalidEntityError("Plan", "price must be non-negative")
    }
    if (props.seatLimit !== null && props.seatLimit !== undefined) {
      if (!Number.isInteger(props.seatLimit) || props.seatLimit < 1) {
        throw new InvalidEntityError("Plan", "seatLimit must be a positive integer when set")
      }
    }

    return new Plan({
      id: props.id,
      code: props.code,
      name: trimmedName,
      description: props.description?.trim() || null,
      price: props.price,
      billingInterval: props.billingInterval,
      stripePriceId: props.stripePriceId ?? null,
      seatLimit: props.seatLimit ?? null,
      isActive: props.isActive ?? true,
      isPublic: props.isPublic ?? true,
      sortOrder: props.sortOrder ?? 0,
      features: [...(props.features ?? [])],
      createdAt: now,
      createdBy: props.createdBy ?? null,
      updatedAt: now,
      updatedBy: null,
      deletedAt: null,
    })
  }

  static reconstitute(props: ReconstitutePlanProps): Plan {
    return new Plan(props)
  }

  static fromJSON(s: PlanSnapshot): Plan {
    return Plan.reconstitute({
      id: PlanId.fromPersistence(s.id),
      code: s.code,
      name: s.name,
      description: s.description,
      price: Money.fromSnapshot(s.price),
      billingInterval: s.billingInterval,
      stripePriceId: s.stripePriceId,
      seatLimit: s.seatLimit,
      isActive: s.isActive,
      isPublic: s.isPublic,
      sortOrder: s.sortOrder,
      features: s.features,
      createdAt: new Date(s.createdAt),
      createdBy: s.createdBy ? ProfileId.fromPersistence(s.createdBy) : null,
      updatedAt: new Date(s.updatedAt),
      updatedBy: s.updatedBy ? ProfileId.fromPersistence(s.updatedBy) : null,
      deletedAt: s.deletedAt ? new Date(s.deletedAt) : null,
    })
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get id(): PlanId {
    return this.#id
  }
  get code(): PlanCode {
    return this.#code
  }
  get name(): string {
    return this.#name
  }
  get description(): string | null {
    return this.#description
  }
  get price(): Money {
    return this.#price
  }
  get billingInterval(): BillingInterval {
    return this.#billingInterval
  }
  get stripePriceId(): string | null {
    return this.#stripePriceId
  }
  get seatLimit(): number | null {
    return this.#seatLimit
  }
  get isActive(): boolean {
    return this.#isActive
  }
  get isPublic(): boolean {
    return this.#isPublic
  }
  get sortOrder(): number {
    return this.#sortOrder
  }
  get features(): readonly string[] {
    return this.#features
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

  /** True when this plan is selectable for new subscriptions (active, not deleted). */
  get isAvailable(): boolean {
    return this.#deletedAt === null && this.#isActive
  }

  get isDeleted(): boolean {
    return this.#deletedAt !== null
  }

  hasFeature(feature: string): boolean {
    return this.#features.includes(feature)
  }

  // ─── State transitions ───────────────────────────────────────────────────

  rename(newName: string, updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("rename")
    const trimmed = newName.trim()
    if (trimmed.length === 0) {
      throw new InvalidEntityError("Plan", "name must not be empty")
    }
    if (trimmed.length > PLAN_NAME_MAX_LENGTH) {
      throw new InvalidEntityError(
        "Plan",
        `name must be ${PLAN_NAME_MAX_LENGTH} characters or fewer`
      )
    }
    if (trimmed === this.#name) return
    this.#name = trimmed
    this.#touchAudit(updatedBy, now)
  }

  updateDescription(
    newDescription: string | null,
    updatedBy: ProfileId,
    now: Date = new Date()
  ): void {
    this.#assertNotDeleted("update description")
    const normalized = newDescription?.trim() || null
    if (normalized === this.#description) return
    this.#description = normalized
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Aggregated pricing edit. Plan code is intentionally NOT changeable —
   * code is a stable lookup key (referenced by billing webhooks).
   * Price (cents+currency, as a Money) and billingInterval can move
   * together when re-pricing a plan.
   */
  updatePricing(
    newPrice: Money,
    billingInterval: BillingInterval,
    updatedBy: ProfileId,
    now: Date = new Date()
  ): void {
    this.#assertNotDeleted("update pricing")
    if (newPrice.isNegative) {
      throw new InvalidEntityError("Plan", "price must be non-negative")
    }
    if (newPrice.equals(this.#price) && billingInterval === this.#billingInterval) {
      return
    }
    this.#price = newPrice
    this.#billingInterval = billingInterval
    this.#touchAudit(updatedBy, now)
  }

  linkStripePrice(
    stripePriceId: string | null,
    updatedBy: ProfileId,
    now: Date = new Date()
  ): void {
    this.#assertNotDeleted("link Stripe price")
    if (stripePriceId === this.#stripePriceId) return
    this.#stripePriceId = stripePriceId
    this.#touchAudit(updatedBy, now)
  }

  setSeatLimit(seatLimit: number | null, updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("set seat limit")
    if (seatLimit !== null) {
      if (!Number.isInteger(seatLimit) || seatLimit < 1) {
        throw new InvalidEntityError("Plan", "seatLimit must be a positive integer when set")
      }
    }
    if (seatLimit === this.#seatLimit) return
    this.#seatLimit = seatLimit
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Aggregated visibility/listing edit. Plan-admin "edit plan" form
   * changes isActive (sellable yes/no), isPublic (visible on pricing
   * page yes/no), and sortOrder together — folding them into one
   * method matches the form shape and gives one audit bump per save.
   *
   * For single-toggle UX (e.g., "disable plan" kebab menu), use the
   * convenience shortcuts `activate()` / `deactivate()` below.
   */
  setVisibility(
    isActive: boolean,
    isPublic: boolean,
    sortOrder: number,
    updatedBy: ProfileId,
    now: Date = new Date()
  ): void {
    this.#assertNotDeleted("set visibility")
    if (!Number.isInteger(sortOrder)) {
      throw new InvalidEntityError("Plan", "sortOrder must be an integer")
    }
    if (
      isActive === this.#isActive &&
      isPublic === this.#isPublic &&
      sortOrder === this.#sortOrder
    ) {
      return
    }
    this.#isActive = isActive
    this.#isPublic = isPublic
    this.#sortOrder = sortOrder
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Convenience shortcut: flip `isActive` to true without touching
   * isPublic / sortOrder. Idempotent (no-op + no audit bump if already
   * active). Use this for single-click "enable plan" UI affordances.
   */
  activate(updatedBy: ProfileId, now: Date = new Date()): void {
    this.setVisibility(true, this.#isPublic, this.#sortOrder, updatedBy, now)
  }

  /**
   * Convenience shortcut: flip `isActive` to false without touching
   * isPublic / sortOrder. Existing subscriptions on this plan keep
   * working (per ON DELETE RESTRICT) — only new subscriptions are
   * blocked. Idempotent.
   */
  deactivate(updatedBy: ProfileId, now: Date = new Date()): void {
    this.setVisibility(false, this.#isPublic, this.#sortOrder, updatedBy, now)
  }

  /** Replace the feature-flag list. De-duped via Set comparison. */
  updateFeatures(features: readonly string[], updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("update features")
    if (sameStringSet(this.#features, features)) return
    this.#features = [...features]
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Soft-delete. Existing subscriptions on this plan keep working
   * (the schema uses ON DELETE RESTRICT for subscriptions.plan_id, so
   * the plan stays referenced); new subscriptions can no longer attach
   * because `isAvailable` becomes false.
   */
  softDelete(updatedBy: ProfileId, now: Date = new Date()): void {
    if (this.#deletedAt !== null) return
    this.#deletedAt = now
    this.#isActive = false
    this.#touchAudit(updatedBy, now)
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  #touchAudit(updatedBy: ProfileId, now: Date): void {
    this.#updatedAt = now
    this.#updatedBy = updatedBy
  }

  #assertNotDeleted(operation: string): void {
    if (this.#deletedAt !== null) {
      throw new InvalidEntityError("Plan", `cannot ${operation} on a deleted plan`)
    }
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): PlanSnapshot {
    return {
      id: this.#id.value,
      code: this.#code,
      name: this.#name,
      description: this.#description,
      price: this.#price.toJSON(),
      billingInterval: this.#billingInterval,
      stripePriceId: this.#stripePriceId,
      seatLimit: this.#seatLimit,
      isActive: this.#isActive,
      isPublic: this.#isPublic,
      sortOrder: this.#sortOrder,
      features: [...this.#features],
      createdAt: this.#createdAt.toISOString(),
      createdBy: this.#createdBy?.value ?? null,
      updatedAt: this.#updatedAt.toISOString(),
      updatedBy: this.#updatedBy?.value ?? null,
      deletedAt: this.#deletedAt?.toISOString() ?? null,
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const setA = new Set(a)
  return b.every((s) => setA.has(s))
}
