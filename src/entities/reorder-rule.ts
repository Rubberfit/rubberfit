import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { nullableEqual } from "@/src/entities/shared/equality"
import { trimOptional } from "@/src/entities/shared/string-helpers"
import {
  MaterialTypeId,
  ProfileId,
  ReorderRuleId,
  SupplierId,
  TenantId,
} from "@/src/entities/value-objects/id"

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateReorderRuleProps {
  id: ReorderRuleId
  tenantId: TenantId
  materialTypeId: MaterialTypeId
  supplierId?: SupplierId | null
  reorderPointSqm: number
  reorderQuantitySqm: number
  maxStockLevelSqm?: number | null
  leadTimeDays?: number
  safetyStockDays?: number
  autoReorder?: boolean
  notes?: string | null
  createdBy?: ProfileId | null
}

export interface ReconstituteReorderRuleProps {
  id: ReorderRuleId
  tenantId: TenantId
  materialTypeId: MaterialTypeId
  supplierId: SupplierId | null
  reorderPointSqm: number
  reorderQuantitySqm: number
  maxStockLevelSqm: number | null
  leadTimeDays: number
  safetyStockDays: number
  autoReorder: boolean
  isActive: boolean
  notes: string | null
  lastTriggeredAt: Date | null
  createdAt: Date
  createdBy: ProfileId | null
  updatedAt: Date
  updatedBy: ProfileId | null
  deletedAt: Date | null
}

/**
 * Bulk-edit payload for `ReorderRule.updateDetails`. Toggles
 * (`autoReorder`, `isActive`) and the system-driven `lastTriggeredAt`
 * are NOT here — they have dedicated transitions.
 */
export interface ReorderRuleUpdateProps {
  supplierId: SupplierId | null
  reorderPointSqm: number
  reorderQuantitySqm: number
  maxStockLevelSqm: number | null
  leadTimeDays: number
  safetyStockDays: number
  notes: string | null
}

export interface ReorderRuleSnapshot {
  id: string
  tenantId: string
  materialTypeId: string
  supplierId: string | null
  reorderPointSqm: number
  reorderQuantitySqm: number
  maxStockLevelSqm: number | null
  leadTimeDays: number
  safetyStockDays: number
  autoReorder: boolean
  isActive: boolean
  notes: string | null
  lastTriggeredAt: string | null
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
  deletedAt: string | null
}

// ─── Entity ────────────────────────────────────────────────────────────────

/**
 * Per-material-type reorder rule. Drives low-stock alerts and (optionally)
 * auto-reorder PO creation.
 *
 * UNIQUE on `material_type_id` — one rule per material per tenant.
 *
 * **Invariant (mirrors DB CHECK):** when `maxStockLevelSqm` is non-null,
 * it MUST be strictly greater than `reorderPointSqm`. Enforced at
 * `create()` and on every `updateDetails`.
 *
 * **`recordTrigger(now)`** is a system event — it bumps
 * `lastTriggeredAt` only. It does NOT bump `updatedAt` / `updatedBy`
 * (those are reserved for human edits). Distinct from the audit columns.
 *
 * **EOQ math is OUT of this entity.** If quantity recommendations are
 * needed, a separate `ReorderCalculator` domain service consumes a
 * `ReorderRule` plus demand/cost inputs and returns suggestions; the
 * entity stores whatever the operator entered.
 *
 * **`isActive` vs `deletedAt`** — same pattern as Supplier. User-facing
 * "remove rule" wires to `deactivate`; `softDelete` is admin-only.
 *
 * Mutable surface:
 *   • `updateDetails(props)`   — bulk edit thresholds + lead/safety + supplier + notes
 *   • `enableAutoReorder()`    — flip auto_reorder on
 *   • `disableAutoReorder()`   — flip auto_reorder off
 *   • `deactivate()`           — flip isActive off (user-facing remove)
 *   • `reactivate()`           — flip isActive on
 *   • `recordTrigger(now)`     — system bump of lastTriggeredAt
 *   • `softDelete()`           — admin-only terminal
 *
 * Source: reorder_rules table.
 */
export class ReorderRule {
  #id: ReorderRuleId
  #tenantId: TenantId
  #materialTypeId: MaterialTypeId
  #supplierId: SupplierId | null
  #reorderPointSqm: number
  #reorderQuantitySqm: number
  #maxStockLevelSqm: number | null
  #leadTimeDays: number
  #safetyStockDays: number
  #autoReorder: boolean
  #isActive: boolean
  #notes: string | null
  #lastTriggeredAt: Date | null
  #createdAt: Date
  #createdBy: ProfileId | null
  #updatedAt: Date
  #updatedBy: ProfileId | null
  #deletedAt: Date | null

  private constructor(props: ReconstituteReorderRuleProps) {
    this.#id = props.id
    this.#tenantId = props.tenantId
    this.#materialTypeId = props.materialTypeId
    this.#supplierId = props.supplierId
    this.#reorderPointSqm = props.reorderPointSqm
    this.#reorderQuantitySqm = props.reorderQuantitySqm
    this.#maxStockLevelSqm = props.maxStockLevelSqm
    this.#leadTimeDays = props.leadTimeDays
    this.#safetyStockDays = props.safetyStockDays
    this.#autoReorder = props.autoReorder
    this.#isActive = props.isActive
    this.#notes = props.notes
    this.#lastTriggeredAt = props.lastTriggeredAt
    this.#createdAt = props.createdAt
    this.#createdBy = props.createdBy
    this.#updatedAt = props.updatedAt
    this.#updatedBy = props.updatedBy
    this.#deletedAt = props.deletedAt
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static create(
    props: CreateReorderRuleProps,
    now: Date = new Date(),
  ): ReorderRule {
    const reorderPointSqm = ReorderRule.#normalizeReorderPoint(
      props.reorderPointSqm,
    )
    const reorderQuantitySqm = ReorderRule.#normalizeReorderQuantity(
      props.reorderQuantitySqm,
    )
    const maxStockLevelSqm = ReorderRule.#normalizeMaxStockLevel(
      props.maxStockLevelSqm ?? null,
      reorderPointSqm,
    )
    const leadTimeDays = ReorderRule.#normalizeDays(
      props.leadTimeDays ?? 7,
      "leadTimeDays",
    )
    const safetyStockDays = ReorderRule.#normalizeDays(
      props.safetyStockDays ?? 3,
      "safetyStockDays",
    )
    const notes = trimOptional(props.notes, "notes", null, "ReorderRule")

    return new ReorderRule({
      id: props.id,
      tenantId: props.tenantId,
      materialTypeId: props.materialTypeId,
      supplierId: props.supplierId ?? null,
      reorderPointSqm,
      reorderQuantitySqm,
      maxStockLevelSqm,
      leadTimeDays,
      safetyStockDays,
      autoReorder: props.autoReorder ?? false,
      isActive: true,
      notes,
      lastTriggeredAt: null,
      createdAt: now,
      createdBy: props.createdBy ?? null,
      updatedAt: now,
      updatedBy: null,
      deletedAt: null,
    })
  }

  static reconstitute(props: ReconstituteReorderRuleProps): ReorderRule {
    return new ReorderRule(props)
  }

  static fromJSON(s: ReorderRuleSnapshot): ReorderRule {
    return ReorderRule.reconstitute({
      id: ReorderRuleId.fromPersistence(s.id),
      tenantId: TenantId.fromPersistence(s.tenantId),
      materialTypeId: MaterialTypeId.fromPersistence(s.materialTypeId),
      supplierId: s.supplierId ? SupplierId.fromPersistence(s.supplierId) : null,
      reorderPointSqm: s.reorderPointSqm,
      reorderQuantitySqm: s.reorderQuantitySqm,
      maxStockLevelSqm: s.maxStockLevelSqm,
      leadTimeDays: s.leadTimeDays,
      safetyStockDays: s.safetyStockDays,
      autoReorder: s.autoReorder,
      isActive: s.isActive,
      notes: s.notes,
      lastTriggeredAt: s.lastTriggeredAt ? new Date(s.lastTriggeredAt) : null,
      createdAt: new Date(s.createdAt),
      createdBy: s.createdBy ? ProfileId.fromPersistence(s.createdBy) : null,
      updatedAt: new Date(s.updatedAt),
      updatedBy: s.updatedBy ? ProfileId.fromPersistence(s.updatedBy) : null,
      deletedAt: s.deletedAt ? new Date(s.deletedAt) : null,
    })
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get id(): ReorderRuleId { return this.#id }
  get tenantId(): TenantId { return this.#tenantId }
  get materialTypeId(): MaterialTypeId { return this.#materialTypeId }
  get supplierId(): SupplierId | null { return this.#supplierId }
  get reorderPointSqm(): number { return this.#reorderPointSqm }
  get reorderQuantitySqm(): number { return this.#reorderQuantitySqm }
  get maxStockLevelSqm(): number | null { return this.#maxStockLevelSqm }
  get leadTimeDays(): number { return this.#leadTimeDays }
  get safetyStockDays(): number { return this.#safetyStockDays }
  get autoReorder(): boolean { return this.#autoReorder }
  get isActive(): boolean { return this.#isActive }
  get notes(): string | null { return this.#notes }
  get lastTriggeredAt(): Date | null { return this.#lastTriggeredAt }
  get createdAt(): Date { return this.#createdAt }
  get createdBy(): ProfileId | null { return this.#createdBy }
  get updatedAt(): Date { return this.#updatedAt }
  get updatedBy(): ProfileId | null { return this.#updatedBy }
  get deletedAt(): Date | null { return this.#deletedAt }

  // ─── State queries ───────────────────────────────────────────────────────

  get isDeleted(): boolean {
    return this.#deletedAt !== null
  }

  // ─── State transitions ───────────────────────────────────────────────────

  /**
   * Bulk-edit the threshold / timing / supplier / notes fields.
   * Re-validates `maxStockLevelSqm > reorderPointSqm` (when max is
   * non-null). No-op if every field is unchanged.
   *
   * Toggles (`autoReorder`, `isActive`) and `lastTriggeredAt` are NOT
   * touched here — they have dedicated transitions.
   */
  updateDetails(
    props: ReorderRuleUpdateProps,
    updatedBy: ProfileId,
    now: Date = new Date(),
  ): void {
    this.#assertNotDeleted("update details")

    const newReorderPoint = ReorderRule.#normalizeReorderPoint(
      props.reorderPointSqm,
    )
    const newReorderQuantity = ReorderRule.#normalizeReorderQuantity(
      props.reorderQuantitySqm,
    )
    const newMaxStockLevel = ReorderRule.#normalizeMaxStockLevel(
      props.maxStockLevelSqm,
      newReorderPoint,
    )
    const newLeadTimeDays = ReorderRule.#normalizeDays(
      props.leadTimeDays,
      "leadTimeDays",
    )
    const newSafetyStockDays = ReorderRule.#normalizeDays(
      props.safetyStockDays,
      "safetyStockDays",
    )
    const newNotes = trimOptional(
      props.notes,
      "notes",
      null,
      "ReorderRule",
    )

    if (
      nullableEqual(props.supplierId, this.#supplierId) &&
      newReorderPoint === this.#reorderPointSqm &&
      newReorderQuantity === this.#reorderQuantitySqm &&
      newMaxStockLevel === this.#maxStockLevelSqm &&
      newLeadTimeDays === this.#leadTimeDays &&
      newSafetyStockDays === this.#safetyStockDays &&
      newNotes === this.#notes
    ) {
      return
    }

    this.#supplierId = props.supplierId
    this.#reorderPointSqm = newReorderPoint
    this.#reorderQuantitySqm = newReorderQuantity
    this.#maxStockLevelSqm = newMaxStockLevel
    this.#leadTimeDays = newLeadTimeDays
    this.#safetyStockDays = newSafetyStockDays
    this.#notes = newNotes
    this.#touchAudit(updatedBy, now)
  }

  /** Turn auto-reorder on. Idempotent. */
  enableAutoReorder(updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("enable auto-reorder")
    if (this.#autoReorder) return
    this.#autoReorder = true
    this.#touchAudit(updatedBy, now)
  }

  /** Turn auto-reorder off. Idempotent. */
  disableAutoReorder(updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("disable auto-reorder")
    if (!this.#autoReorder) return
    this.#autoReorder = false
    this.#touchAudit(updatedBy, now)
  }

  /**
   * User-facing "remove rule" action. Flips `isActive` to false; rule
   * stops firing alerts and (if auto_reorder was on) stops creating POs.
   * Idempotent.
   */
  deactivate(updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("deactivate")
    if (!this.#isActive) return
    this.#isActive = false
    this.#touchAudit(updatedBy, now)
  }

  /** Reactivate. Idempotent; throws if soft-deleted. */
  reactivate(updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("reactivate")
    if (this.#isActive) return
    this.#isActive = true
    this.#touchAudit(updatedBy, now)
  }

  /**
   * System event: the rule fired (e.g., low-stock detector picked it up
   * and either alerted or created a PO). Bumps `lastTriggeredAt` only —
   * does NOT bump `updatedAt` / `updatedBy`, which are reserved for human
   * edits. Allowed regardless of status (a deactivated rule shouldn't
   * fire, but if it somehow does, recording the event is harmless);
   * forbidden on a soft-deleted row.
   */
  recordTrigger(now: Date = new Date()): void {
    this.#assertNotDeleted("record trigger")
    this.#lastTriggeredAt = now
  }

  /** Admin-only soft delete. Idempotent. */
  softDelete(updatedBy: ProfileId, now: Date = new Date()): void {
    if (this.#deletedAt !== null) return
    this.#deletedAt = now
    this.#touchAudit(updatedBy, now)
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  /** DB CHECK: `reorder_point_sqm >= 0`. */
  static #normalizeReorderPoint(value: number): number {
    if (!Number.isFinite(value)) {
      throw new InvalidEntityError(
        "ReorderRule",
        "reorderPointSqm must be a finite number",
      )
    }
    if (value < 0) {
      throw new InvalidEntityError(
        "ReorderRule",
        "reorderPointSqm must be >= 0",
      )
    }
    return value
  }

  /** DB CHECK: `reorder_quantity_sqm > 0` (strictly positive). */
  static #normalizeReorderQuantity(value: number): number {
    if (!Number.isFinite(value)) {
      throw new InvalidEntityError(
        "ReorderRule",
        "reorderQuantitySqm must be a finite number",
      )
    }
    if (value <= 0) {
      throw new InvalidEntityError(
        "ReorderRule",
        "reorderQuantitySqm must be greater than zero",
      )
    }
    return value
  }

  /**
   * DB CHECK: `max_stock_level_sqm IS NULL OR max_stock_level_sqm >
   * reorder_point_sqm`. Strict greater-than.
   */
  static #normalizeMaxStockLevel(
    value: number | null,
    reorderPoint: number,
  ): number | null {
    if (value === null) return null
    if (!Number.isFinite(value)) {
      throw new InvalidEntityError(
        "ReorderRule",
        "maxStockLevelSqm must be a finite number",
      )
    }
    if (value <= reorderPoint) {
      throw new InvalidEntityError(
        "ReorderRule",
        "maxStockLevelSqm must be greater than reorderPointSqm",
      )
    }
    return value
  }

  static #normalizeDays(value: number, field: string): number {
    if (!Number.isInteger(value)) {
      throw new InvalidEntityError(
        "ReorderRule",
        `${field} must be an integer`,
      )
    }
    if (value < 0) {
      throw new InvalidEntityError(
        "ReorderRule",
        `${field} must be >= 0`,
      )
    }
    return value
  }

  #touchAudit(updatedBy: ProfileId, now: Date): void {
    this.#updatedAt = now
    this.#updatedBy = updatedBy
  }

  #assertNotDeleted(operation: string): void {
    if (this.#deletedAt !== null) {
      throw new InvalidEntityError(
        "ReorderRule",
        `cannot ${operation} on a deleted reorder rule`,
      )
    }
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): ReorderRuleSnapshot {
    return {
      id: this.#id.value,
      tenantId: this.#tenantId.value,
      materialTypeId: this.#materialTypeId.value,
      supplierId: this.#supplierId?.value ?? null,
      reorderPointSqm: this.#reorderPointSqm,
      reorderQuantitySqm: this.#reorderQuantitySqm,
      maxStockLevelSqm: this.#maxStockLevelSqm,
      leadTimeDays: this.#leadTimeDays,
      safetyStockDays: this.#safetyStockDays,
      autoReorder: this.#autoReorder,
      isActive: this.#isActive,
      notes: this.#notes,
      lastTriggeredAt: this.#lastTriggeredAt?.toISOString() ?? null,
      createdAt: this.#createdAt.toISOString(),
      createdBy: this.#createdBy?.value ?? null,
      updatedAt: this.#updatedAt.toISOString(),
      updatedBy: this.#updatedBy?.value ?? null,
      deletedAt: this.#deletedAt?.toISOString() ?? null,
    }
  }
}
