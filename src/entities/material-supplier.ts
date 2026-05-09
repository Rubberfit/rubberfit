import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import {
  trimOptional,
} from "@/src/entities/shared/string-helpers"
import {
  MaterialSupplierId,
  MaterialTypeId,
  ProfileId,
  SupplierId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Money, type MoneySnapshot } from "@/src/entities/value-objects/money"

// ─── Constants (mirror DB column lengths / checks) ─────────────────────────

const SUPPLIER_MATERIAL_CODE_MAX = 100

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateMaterialSupplierProps {
  id: MaterialSupplierId
  tenantId: TenantId
  materialTypeId: MaterialTypeId
  supplierId: SupplierId
  cost: Money
  effectiveDate: Date
  expirationDate?: Date | null
  supplierMaterialCode?: string | null
  minimumOrderSqm?: number
  leadTimeDays?: number
  preferredSupplier?: boolean
  notes?: string | null
  createdBy?: ProfileId | null
}

export interface ReconstituteMaterialSupplierProps {
  id: MaterialSupplierId
  tenantId: TenantId
  materialTypeId: MaterialTypeId
  supplierId: SupplierId
  cost: Money
  effectiveDate: Date
  expirationDate: Date | null
  supplierMaterialCode: string | null
  minimumOrderSqm: number
  leadTimeDays: number
  preferredSupplier: boolean
  isActive: boolean
  notes: string | null
  createdAt: Date
  createdBy: ProfileId | null
  updatedAt: Date
  updatedBy: ProfileId | null
  deletedAt: Date | null
}

export interface MaterialSupplierSnapshot {
  id: string
  tenantId: string
  materialTypeId: string
  supplierId: string
  cost: MoneySnapshot
  effectiveDate: string
  expirationDate: string | null
  supplierMaterialCode: string | null
  minimumOrderSqm: number
  leadTimeDays: number
  preferredSupplier: boolean
  isActive: boolean
  notes: string | null
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
  deletedAt: string | null
}

// ─── Entity ────────────────────────────────────────────────────────────────

/**
 * Per-tenant pricing junction: which suppliers carry which materials, at
 * what cost. UNIQUE on (material_type_id, supplier_id) — one row per
 * material/supplier pair.
 *
 * **Pricing has a strict method split** (an explicit design decision —
 * see DDD slice notes for the user-flow rationale):
 *
 *   • `updatePricing(newCost, ...)` — for REAL cost changes. REJECTS an
 *     unchanged cost so callers can't accidentally bypass `price_history`.
 *     The use-case (`IUpdateMaterialPricingUseCase`) appends a price_history
 *     row whenever this method succeeds. Window dates are also passed
 *     because price changes typically come with a new effective date.
 *
 *   • `updatePricingWindow(newEffective, newExpiration, ...)` — for window
 *     adjustments WITHOUT a cost change (extending a deal, ending it
 *     early). NO price_history append. The cost is left alone.
 *
 *   • `updateDetails(...)` — bulk-edit the non-pricing metadata
 *     (supplierMaterialCode, minimumOrderSqm, leadTimeDays,
 *     preferredSupplier, notes).
 *
 * **`isActive` vs `deletedAt`** — same pattern as `Supplier` and
 * `SupplierContact`. User-facing "remove" wires to `deactivate`;
 * `softDelete` is admin-only.
 *
 * Source: material_suppliers table.
 */
export class MaterialSupplier {
  #id: MaterialSupplierId
  #tenantId: TenantId
  #materialTypeId: MaterialTypeId
  #supplierId: SupplierId
  #cost: Money
  #effectiveDate: Date
  #expirationDate: Date | null
  #supplierMaterialCode: string | null
  #minimumOrderSqm: number
  #leadTimeDays: number
  #preferredSupplier: boolean
  #isActive: boolean
  #notes: string | null
  #createdAt: Date
  #createdBy: ProfileId | null
  #updatedAt: Date
  #updatedBy: ProfileId | null
  #deletedAt: Date | null

  private constructor(props: ReconstituteMaterialSupplierProps) {
    this.#id = props.id
    this.#tenantId = props.tenantId
    this.#materialTypeId = props.materialTypeId
    this.#supplierId = props.supplierId
    this.#cost = props.cost
    this.#effectiveDate = props.effectiveDate
    this.#expirationDate = props.expirationDate
    this.#supplierMaterialCode = props.supplierMaterialCode
    this.#minimumOrderSqm = props.minimumOrderSqm
    this.#leadTimeDays = props.leadTimeDays
    this.#preferredSupplier = props.preferredSupplier
    this.#isActive = props.isActive
    this.#notes = props.notes
    this.#createdAt = props.createdAt
    this.#createdBy = props.createdBy
    this.#updatedAt = props.updatedAt
    this.#updatedBy = props.updatedBy
    this.#deletedAt = props.deletedAt
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static create(
    props: CreateMaterialSupplierProps,
    now: Date = new Date(),
  ): MaterialSupplier {
    MaterialSupplier.#assertValidCost(props.cost)
    MaterialSupplier.#assertValidWindow(
      props.effectiveDate,
      props.expirationDate ?? null,
    )

    const supplierMaterialCode = trimOptional(
      props.supplierMaterialCode,
      "supplierMaterialCode",
      SUPPLIER_MATERIAL_CODE_MAX,
      "MaterialSupplier",
    )
    const minimumOrderSqm = MaterialSupplier.#normalizeMinimumOrderSqm(
      props.minimumOrderSqm ?? 0,
    )
    const leadTimeDays = MaterialSupplier.#normalizeLeadTimeDays(
      props.leadTimeDays ?? 0,
    )
    const notes = trimOptional(
      props.notes,
      "notes",
      null,
      "MaterialSupplier",
    )

    return new MaterialSupplier({
      id: props.id,
      tenantId: props.tenantId,
      materialTypeId: props.materialTypeId,
      supplierId: props.supplierId,
      cost: props.cost,
      effectiveDate: props.effectiveDate,
      expirationDate: props.expirationDate ?? null,
      supplierMaterialCode,
      minimumOrderSqm,
      leadTimeDays,
      preferredSupplier: props.preferredSupplier ?? false,
      isActive: true,
      notes,
      createdAt: now,
      createdBy: props.createdBy ?? null,
      updatedAt: now,
      updatedBy: null,
      deletedAt: null,
    })
  }

  static reconstitute(
    props: ReconstituteMaterialSupplierProps,
  ): MaterialSupplier {
    return new MaterialSupplier(props)
  }

  static fromJSON(s: MaterialSupplierSnapshot): MaterialSupplier {
    return MaterialSupplier.reconstitute({
      id: MaterialSupplierId.fromPersistence(s.id),
      tenantId: TenantId.fromPersistence(s.tenantId),
      materialTypeId: MaterialTypeId.fromPersistence(s.materialTypeId),
      supplierId: SupplierId.fromPersistence(s.supplierId),
      cost: Money.fromSnapshot(s.cost),
      effectiveDate: new Date(s.effectiveDate),
      expirationDate: s.expirationDate ? new Date(s.expirationDate) : null,
      supplierMaterialCode: s.supplierMaterialCode,
      minimumOrderSqm: s.minimumOrderSqm,
      leadTimeDays: s.leadTimeDays,
      preferredSupplier: s.preferredSupplier,
      isActive: s.isActive,
      notes: s.notes,
      createdAt: new Date(s.createdAt),
      createdBy: s.createdBy ? ProfileId.fromPersistence(s.createdBy) : null,
      updatedAt: new Date(s.updatedAt),
      updatedBy: s.updatedBy ? ProfileId.fromPersistence(s.updatedBy) : null,
      deletedAt: s.deletedAt ? new Date(s.deletedAt) : null,
    })
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get id(): MaterialSupplierId { return this.#id }
  get tenantId(): TenantId { return this.#tenantId }
  get materialTypeId(): MaterialTypeId { return this.#materialTypeId }
  get supplierId(): SupplierId { return this.#supplierId }
  get cost(): Money { return this.#cost }
  get effectiveDate(): Date { return this.#effectiveDate }
  get expirationDate(): Date | null { return this.#expirationDate }
  get supplierMaterialCode(): string | null { return this.#supplierMaterialCode }
  get minimumOrderSqm(): number { return this.#minimumOrderSqm }
  get leadTimeDays(): number { return this.#leadTimeDays }
  get preferredSupplier(): boolean { return this.#preferredSupplier }
  get isActive(): boolean { return this.#isActive }
  get notes(): string | null { return this.#notes }
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
   * Bulk-edit non-pricing metadata. No-op if every field is unchanged.
   * Does NOT touch cost, effective/expiration dates, isActive, or
   * deletedAt — those have dedicated transitions.
   */
  updateDetails(
    supplierMaterialCode: string | null,
    minimumOrderSqm: number,
    leadTimeDays: number,
    preferredSupplier: boolean,
    notes: string | null,
    updatedBy: ProfileId,
    now: Date = new Date(),
  ): void {
    this.#assertNotDeleted("update details")

    const newSupplierMaterialCode = trimOptional(
      supplierMaterialCode,
      "supplierMaterialCode",
      SUPPLIER_MATERIAL_CODE_MAX,
      "MaterialSupplier",
    )
    const newMinimumOrderSqm =
      MaterialSupplier.#normalizeMinimumOrderSqm(minimumOrderSqm)
    const newLeadTimeDays =
      MaterialSupplier.#normalizeLeadTimeDays(leadTimeDays)
    const newNotes = trimOptional(notes, "notes", null, "MaterialSupplier")

    if (
      newSupplierMaterialCode === this.#supplierMaterialCode &&
      newMinimumOrderSqm === this.#minimumOrderSqm &&
      newLeadTimeDays === this.#leadTimeDays &&
      preferredSupplier === this.#preferredSupplier &&
      newNotes === this.#notes
    ) {
      return
    }

    this.#supplierMaterialCode = newSupplierMaterialCode
    this.#minimumOrderSqm = newMinimumOrderSqm
    this.#leadTimeDays = newLeadTimeDays
    this.#preferredSupplier = preferredSupplier
    this.#notes = newNotes
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Real price change. The new cost MUST differ from the current cost —
   * passing the same cost is rejected so callers can't accidentally
   * bypass `price_history`. Window dates are passed too (typical price
   * changes come with a new effective date).
   *
   * The use-case orchestrating this call is responsible for appending a
   * `price_history` row using the cost BEFORE this method ran (capture
   * via `priorCost = ms.cost` before invoking).
   */
  updatePricing(
    newCost: Money,
    newEffectiveDate: Date,
    newExpirationDate: Date | null,
    updatedBy: ProfileId,
    now: Date = new Date(),
  ): void {
    this.#assertNotDeleted("update pricing")
    MaterialSupplier.#assertValidCost(newCost)
    MaterialSupplier.#assertValidWindow(newEffectiveDate, newExpirationDate)

    if (this.#cost.equals(newCost)) {
      throw new InvalidEntityError(
        "MaterialSupplier",
        "updatePricing requires a different cost; use updatePricingWindow for window-only changes",
      )
    }

    this.#cost = newCost
    this.#effectiveDate = newEffectiveDate
    this.#expirationDate = newExpirationDate
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Adjust the pricing window without changing cost. NO price_history
   * append happens for this method (the use-case that wraps it is
   * separate from the price-change use-case). No-op if both dates match
   * the current values.
   */
  updatePricingWindow(
    newEffectiveDate: Date,
    newExpirationDate: Date | null,
    updatedBy: ProfileId,
    now: Date = new Date(),
  ): void {
    this.#assertNotDeleted("update pricing window")
    MaterialSupplier.#assertValidWindow(newEffectiveDate, newExpirationDate)

    if (
      newEffectiveDate.getTime() === this.#effectiveDate.getTime() &&
      MaterialSupplier.#datesEqual(newExpirationDate, this.#expirationDate)
    ) {
      return
    }

    this.#effectiveDate = newEffectiveDate
    this.#expirationDate = newExpirationDate
    this.#touchAudit(updatedBy, now)
  }

  /**
   * User-facing "remove" action. Flips `isActive` to false; FKs and
   * pricing rows stay intact. Idempotent.
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

  /** Admin-only soft delete. Idempotent. */
  softDelete(updatedBy: ProfileId, now: Date = new Date()): void {
    if (this.#deletedAt !== null) return
    this.#deletedAt = now
    this.#touchAudit(updatedBy, now)
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  /** Mirrors DB CHECK `cost_per_sqm_cents > 0`. */
  static #assertValidCost(value: Money): void {
    if (value.cents <= 0) {
      throw new InvalidEntityError(
        "MaterialSupplier",
        "cost must be greater than zero",
      )
    }
  }

  /**
   * Mirrors DB CHECK
   *   `expiration_date IS NULL OR expiration_date > effective_date`.
   * Strict greater-than; a zero-day window is rejected.
   */
  static #assertValidWindow(
    effectiveDate: Date,
    expirationDate: Date | null,
  ): void {
    if (Number.isNaN(effectiveDate.getTime())) {
      throw new InvalidEntityError(
        "MaterialSupplier",
        "effectiveDate must be a valid date",
      )
    }
    if (expirationDate === null) return
    if (Number.isNaN(expirationDate.getTime())) {
      throw new InvalidEntityError(
        "MaterialSupplier",
        "expirationDate must be a valid date",
      )
    }
    if (expirationDate.getTime() <= effectiveDate.getTime()) {
      throw new InvalidEntityError(
        "MaterialSupplier",
        "expirationDate must be later than effectiveDate",
      )
    }
  }

  static #normalizeMinimumOrderSqm(value: number): number {
    if (!Number.isFinite(value)) {
      throw new InvalidEntityError(
        "MaterialSupplier",
        "minimumOrderSqm must be a finite number",
      )
    }
    if (value < 0) {
      throw new InvalidEntityError(
        "MaterialSupplier",
        "minimumOrderSqm must be >= 0",
      )
    }
    return value
  }

  static #normalizeLeadTimeDays(value: number): number {
    if (!Number.isInteger(value)) {
      throw new InvalidEntityError(
        "MaterialSupplier",
        "leadTimeDays must be an integer",
      )
    }
    if (value < 0) {
      throw new InvalidEntityError(
        "MaterialSupplier",
        "leadTimeDays must be >= 0",
      )
    }
    return value
  }

  static #datesEqual(a: Date | null, b: Date | null): boolean {
    if (a === null && b === null) return true
    if (a === null || b === null) return false
    return a.getTime() === b.getTime()
  }

  #touchAudit(updatedBy: ProfileId, now: Date): void {
    this.#updatedAt = now
    this.#updatedBy = updatedBy
  }

  #assertNotDeleted(operation: string): void {
    if (this.#deletedAt !== null) {
      throw new InvalidEntityError(
        "MaterialSupplier",
        `cannot ${operation} on a deleted material-supplier link`,
      )
    }
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): MaterialSupplierSnapshot {
    return {
      id: this.#id.value,
      tenantId: this.#tenantId.value,
      materialTypeId: this.#materialTypeId.value,
      supplierId: this.#supplierId.value,
      cost: this.#cost.toJSON(),
      effectiveDate: this.#effectiveDate.toISOString(),
      expirationDate: this.#expirationDate?.toISOString() ?? null,
      supplierMaterialCode: this.#supplierMaterialCode,
      minimumOrderSqm: this.#minimumOrderSqm,
      leadTimeDays: this.#leadTimeDays,
      preferredSupplier: this.#preferredSupplier,
      isActive: this.#isActive,
      notes: this.#notes,
      createdAt: this.#createdAt.toISOString(),
      createdBy: this.#createdBy?.value ?? null,
      updatedAt: this.#updatedAt.toISOString(),
      updatedBy: this.#updatedBy?.value ?? null,
      deletedAt: this.#deletedAt?.toISOString() ?? null,
    }
  }
}
