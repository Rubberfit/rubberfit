import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { PlanId, ProfileId, SubscriptionId, TenantId } from "@/src/entities/value-objects/id"

// ─── Type unions (mirror DB CHECK + Stripe statuses) ───────────────────────

/**
 * Subscription status. Mirrors Stripe's lifecycle exactly:
 *   incomplete  — initial; first payment hasn't succeeded yet
 *   trialing    — inside the trial period
 *   active      — paid, in good standing
 *   past_due    — payment failed, in grace period
 *   unpaid      — past_due grace period exhausted; access usually blocked
 *   canceled    — terminal; access ends at currentPeriodEnd (or immediately)
 */
export type SubscriptionStatus =
  | "incomplete"
  | "trialing"
  | "active"
  | "past_due"
  | "unpaid"
  | "canceled"

export const SUBSCRIPTION_STATUSES = [
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "canceled",
] as const satisfies readonly SubscriptionStatus[]

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateSubscriptionProps {
  id: SubscriptionId
  tenantId: TenantId
  planId: PlanId
  status: SubscriptionStatus
  stripeSubscriptionId?: string | null
  currentPeriodStart?: Date | null
  currentPeriodEnd?: Date | null
  cancelAt?: Date | null
  createdBy?: ProfileId | null
}

export interface ReconstituteSubscriptionProps {
  id: SubscriptionId
  tenantId: TenantId
  planId: PlanId
  stripeSubscriptionId: string | null
  status: SubscriptionStatus
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
  cancelAt: Date | null
  canceledAt: Date | null
  createdAt: Date
  createdBy: ProfileId | null
  updatedAt: Date
  updatedBy: ProfileId | null
  deletedAt: Date | null
}

export interface SubscriptionSnapshot {
  id: string
  tenantId: string
  planId: string
  stripeSubscriptionId: string | null
  status: SubscriptionStatus
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAt: string | null
  canceledAt: string | null
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
  deletedAt: string | null
}

// ─── Entity ────────────────────────────────────────────────────────────────

/**
 * Tenant subscription to a Plan. Mirror of the Stripe subscription lifecycle —
 * mutations here mostly correspond to webhook events from Stripe.
 *
 * Aggregate boundary: just Subscription. References Tenant, Plan, and
 * Profile by ID (small aggregates).
 *
 * The DB partial unique index `subscriptions_one_active_per_tenant`
 * enforces "one active subscription per tenant" across rows. The entity
 * cannot enforce that invariant alone (it doesn't know about siblings) —
 * that's a use-case-layer concern.
 *
 * Two cancellation timestamps, intentionally independent:
 *   cancelAt    — scheduled cancellation (e.g., "cancel at period end").
 *                 Setting this does NOT change status; the subscription
 *                 keeps working until the period ends.
 *   canceledAt  — actual cancellation moment. Set by `cancel()` together
 *                 with status='canceled'.
 *
 * Source: subscriptions table.
 */
export class Subscription {
  #id: SubscriptionId
  #tenantId: TenantId
  #planId: PlanId
  #stripeSubscriptionId: string | null
  #status: SubscriptionStatus
  #currentPeriodStart: Date | null
  #currentPeriodEnd: Date | null
  #cancelAt: Date | null
  #canceledAt: Date | null
  #createdAt: Date
  #createdBy: ProfileId | null
  #updatedAt: Date
  #updatedBy: ProfileId | null
  #deletedAt: Date | null

  private constructor(props: ReconstituteSubscriptionProps) {
    this.#id = props.id
    this.#tenantId = props.tenantId
    this.#planId = props.planId
    this.#stripeSubscriptionId = props.stripeSubscriptionId
    this.#status = props.status
    this.#currentPeriodStart = props.currentPeriodStart
    this.#currentPeriodEnd = props.currentPeriodEnd
    this.#cancelAt = props.cancelAt
    this.#canceledAt = props.canceledAt
    this.#createdAt = props.createdAt
    this.#createdBy = props.createdBy
    this.#updatedAt = props.updatedAt
    this.#updatedBy = props.updatedBy
    this.#deletedAt = props.deletedAt
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  /**
   * Construct a brand-new Subscription. Initial status is whatever Stripe
   * tells us (`incomplete` if first payment failed, `trialing` if a trial
   * was set, `active` if immediately paid). We don't try to infer it.
   */
  static create(props: CreateSubscriptionProps, now: Date = new Date()): Subscription {
    if (props.status === "canceled") {
      throw new InvalidEntityError(
        "Subscription",
        "cannot create a Subscription that's already canceled"
      )
    }
    Subscription.#assertPeriodOrdering(
      props.currentPeriodStart ?? null,
      props.currentPeriodEnd ?? null
    )
    return new Subscription({
      id: props.id,
      tenantId: props.tenantId,
      planId: props.planId,
      stripeSubscriptionId: props.stripeSubscriptionId ?? null,
      status: props.status,
      currentPeriodStart: props.currentPeriodStart ?? null,
      currentPeriodEnd: props.currentPeriodEnd ?? null,
      cancelAt: props.cancelAt ?? null,
      canceledAt: null,
      createdAt: now,
      createdBy: props.createdBy ?? null,
      updatedAt: now,
      updatedBy: null,
      deletedAt: null,
    })
  }

  static reconstitute(props: ReconstituteSubscriptionProps): Subscription {
    return new Subscription(props)
  }

  static fromJSON(s: SubscriptionSnapshot): Subscription {
    return Subscription.reconstitute({
      id: SubscriptionId.fromPersistence(s.id),
      tenantId: TenantId.fromPersistence(s.tenantId),
      planId: PlanId.fromPersistence(s.planId),
      stripeSubscriptionId: s.stripeSubscriptionId,
      status: s.status,
      currentPeriodStart: s.currentPeriodStart ? new Date(s.currentPeriodStart) : null,
      currentPeriodEnd: s.currentPeriodEnd ? new Date(s.currentPeriodEnd) : null,
      cancelAt: s.cancelAt ? new Date(s.cancelAt) : null,
      canceledAt: s.canceledAt ? new Date(s.canceledAt) : null,
      createdAt: new Date(s.createdAt),
      createdBy: s.createdBy ? ProfileId.fromPersistence(s.createdBy) : null,
      updatedAt: new Date(s.updatedAt),
      updatedBy: s.updatedBy ? ProfileId.fromPersistence(s.updatedBy) : null,
      deletedAt: s.deletedAt ? new Date(s.deletedAt) : null,
    })
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get id(): SubscriptionId {
    return this.#id
  }
  get tenantId(): TenantId {
    return this.#tenantId
  }
  get planId(): PlanId {
    return this.#planId
  }
  get stripeSubscriptionId(): string | null {
    return this.#stripeSubscriptionId
  }
  get status(): SubscriptionStatus {
    return this.#status
  }
  get currentPeriodStart(): Date | null {
    return this.#currentPeriodStart
  }
  get currentPeriodEnd(): Date | null {
    return this.#currentPeriodEnd
  }
  get cancelAt(): Date | null {
    return this.#cancelAt
  }
  get canceledAt(): Date | null {
    return this.#canceledAt
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

  /** True when the tenant should have product access (trialing or active). */
  get isActive(): boolean {
    return this.#status === "trialing" || this.#status === "active"
  }

  get isPastDue(): boolean {
    return this.#status === "past_due"
  }
  get isUnpaid(): boolean {
    return this.#status === "unpaid"
  }
  get isCanceled(): boolean {
    return this.#status === "canceled"
  }

  /** True when the UI should show a "fix payment" banner. */
  get isPaymentBlocking(): boolean {
    return this.#status === "past_due" || this.#status === "unpaid" || this.#status === "incomplete"
  }

  get hasScheduledCancellation(): boolean {
    return this.#cancelAt !== null && !this.isCanceled
  }

  isInCurrentPeriod(now: Date = new Date()): boolean {
    if (this.#currentPeriodStart === null || this.#currentPeriodEnd === null) {
      return false
    }
    const t = now.getTime()
    return t >= this.#currentPeriodStart.getTime() && t <= this.#currentPeriodEnd.getTime()
  }

  /** True when a scheduled cancellation is now due to execute. */
  isCancellationDue(now: Date = new Date()): boolean {
    return (
      this.hasScheduledCancellation &&
      this.#cancelAt !== null &&
      this.#cancelAt.getTime() <= now.getTime()
    )
  }

  // ─── State transitions ───────────────────────────────────────────────────

  /**
   * Generic status setter — minimal FSM. Permissive: any non-canceled
   * status can move to any other status, idempotent on no change.
   *
   * The single hard rule: `canceled` is terminal — once set, status
   * cannot change again. `softDelete()` is the row-level terminal and
   * is independent of status.
   *
   * Setting status to `"canceled"` also stamps `canceledAt`.
   *
   * NOTE: This is intentionally minimal until the Stripe integration
   * lands. When we wire up real webhook handlers, expect to add named
   * transitions (e.g., `activate`, `markPastDue`) that wrap this with
   * stricter from-state allow-lists for bug-catching.
   */
  setStatus(newStatus: SubscriptionStatus, updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("change status")
    if (this.#status === newStatus) return
    if (this.#status === "canceled") {
      throw new InvalidEntityError(
        "Subscription",
        `cannot transition out of terminal status "canceled" to "${newStatus}"`
      )
    }
    this.#status = newStatus
    if (newStatus === "canceled") {
      this.#canceledAt = now
    }
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Cancel immediately. Convenience shortcut for `setStatus("canceled", …)` —
   * sets status='canceled' and stamps canceledAt. Idempotent.
   */
  cancel(updatedBy: ProfileId, now: Date = new Date()): void {
    this.setStatus("canceled", updatedBy, now)
  }

  /**
   * Schedule cancellation for a future date (Stripe "cancel at period end").
   * Does NOT change status — the sub keeps working until the date passes
   * and `cancel()` is called by the period-end webhook.
   */
  scheduleCancellation(at: Date, updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("schedule cancellation")
    if (this.#status === "canceled") {
      throw new InvalidEntityError(
        "Subscription",
        "cannot schedule cancellation on an already-canceled subscription"
      )
    }
    if (at.getTime() <= now.getTime()) {
      throw new InvalidEntityError(
        "Subscription",
        "scheduled cancellation must be in the future (use cancel() for immediate)"
      )
    }
    if (this.#cancelAt !== null && this.#cancelAt.getTime() === at.getTime()) {
      return
    }
    this.#cancelAt = at
    this.#touchAudit(updatedBy, now)
  }

  /** Undo a scheduled cancellation (Stripe "subscription resumed"). */
  clearScheduledCancellation(updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("clear scheduled cancellation")
    if (this.#cancelAt === null) return
    this.#cancelAt = null
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Switch to a different plan (upgrade/downgrade). Stripe handles the
   * proration; we just record the new plan reference. Idempotent.
   * Allowed even on canceled subs — supports back-office data correction.
   */
  changePlan(newPlanId: PlanId, updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("change plan")
    if (newPlanId.equals(this.#planId)) return
    this.#planId = newPlanId
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Sync the billing period from Stripe (start/end timestamps move on
   * each renewal). Pass null for both to clear (rare). Validates ordering.
   */
  updateBillingPeriod(
    start: Date | null,
    end: Date | null,
    updatedBy: ProfileId,
    now: Date = new Date()
  ): void {
    this.#assertNotDeleted("update billing period")
    Subscription.#assertPeriodOrdering(start, end)
    const sameStart =
      (start === null && this.#currentPeriodStart === null) ||
      (start !== null &&
        this.#currentPeriodStart !== null &&
        start.getTime() === this.#currentPeriodStart.getTime())
    const sameEnd =
      (end === null && this.#currentPeriodEnd === null) ||
      (end !== null &&
        this.#currentPeriodEnd !== null &&
        end.getTime() === this.#currentPeriodEnd.getTime())
    if (sameStart && sameEnd) return
    this.#currentPeriodStart = start
    this.#currentPeriodEnd = end
    this.#touchAudit(updatedBy, now)
  }

  /** Link to the Stripe subscription object once the API returns it. */
  linkStripeSubscription(
    stripeSubscriptionId: string | null,
    updatedBy: ProfileId,
    now: Date = new Date()
  ): void {
    this.#assertNotDeleted("link Stripe subscription")
    if (stripeSubscriptionId === this.#stripeSubscriptionId) return
    this.#stripeSubscriptionId = stripeSubscriptionId
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Soft-delete the row entirely. Distinct from status='canceled' —
   * canceled means "subscription ran its course"; deletedAt means "row
   * is being archived" (e.g., merging duplicate sub records). Terminal.
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
      throw new InvalidEntityError("Subscription", `cannot ${operation} on a deleted subscription`)
    }
  }

  static #assertPeriodOrdering(start: Date | null, end: Date | null): void {
    if (start === null || end === null) return
    if (end.getTime() < start.getTime()) {
      throw new InvalidEntityError(
        "Subscription",
        "currentPeriodEnd must not precede currentPeriodStart"
      )
    }
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): SubscriptionSnapshot {
    return {
      id: this.#id.value,
      tenantId: this.#tenantId.value,
      planId: this.#planId.value,
      stripeSubscriptionId: this.#stripeSubscriptionId,
      status: this.#status,
      currentPeriodStart: this.#currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: this.#currentPeriodEnd?.toISOString() ?? null,
      cancelAt: this.#cancelAt?.toISOString() ?? null,
      canceledAt: this.#canceledAt?.toISOString() ?? null,
      createdAt: this.#createdAt.toISOString(),
      createdBy: this.#createdBy?.value ?? null,
      updatedAt: this.#updatedAt.toISOString(),
      updatedBy: this.#updatedBy?.value ?? null,
      deletedAt: this.#deletedAt?.toISOString() ?? null,
    }
  }
}
