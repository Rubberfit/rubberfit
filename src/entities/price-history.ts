import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { trimOptional } from "@/src/entities/shared/string-helpers"
import {
  MaterialSupplierId,
  PriceHistoryId,
  ProfileId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Money, type MoneySnapshot } from "@/src/entities/value-objects/money"

// ─── Constants (mirror DB column lengths) ──────────────────────────────────

const CHANGE_REASON_MAX = 200

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreatePriceHistoryProps {
  id: PriceHistoryId
  tenantId: TenantId
  materialSupplierId: MaterialSupplierId
  /**
   * Prior cost. Null for the first-ever price record on a
   * material_supplier (no comparison possible). When non-null, MUST share
   * a currency with `newCost` and MUST differ in cents — same-cost rows
   * would be phantom audit entries.
   */
  oldCost: Money | null
  newCost: Money
  changeReason?: string | null
  effectiveDate?: Date
  changedBy?: ProfileId | null
  notes?: string | null
}

export interface ReconstitutePriceHistoryProps {
  id: PriceHistoryId
  tenantId: TenantId
  materialSupplierId: MaterialSupplierId
  oldCost: Money | null
  newCost: Money
  priceChangePercentage: number | null
  changeReason: string | null
  effectiveDate: Date
  changedBy: ProfileId | null
  notes: string | null
  createdAt: Date
}

export interface PriceHistorySnapshot {
  id: string
  tenantId: string
  materialSupplierId: string
  oldCost: MoneySnapshot | null
  newCost: MoneySnapshot
  priceChangePercentage: number | null
  changeReason: string | null
  effectiveDate: string
  changedBy: string | null
  notes: string | null
  createdAt: string
}

// ─── Entity ────────────────────────────────────────────────────────────────

/**
 * Immutable / append-only audit row capturing a single price change on a
 * `material_suppliers` row.
 *
 * **No mutators.** No `updateDetails`, no `softDelete`, no `updatedAt`.
 * Once written, a price-history row is permanent. The schema reflects
 * this — only `created_at` exists, no `updated_at` / `deleted_at`.
 *
 * **`priceChangePercentage` is computed by the entity** at `create()`
 * from `oldCost` / `newCost`. The DB has a redundant `BEFORE INSERT`
 * trigger as a safety net for raw SQL inserts that bypass the app layer.
 *
 * **Same-cost rows are rejected.** If `oldCost.cents === newCost.cents`,
 * `create()` throws — a price-history entry where nothing changed would
 * be a phantom row that pollutes future "what did we pay over time?"
 * reports. (`MaterialSupplier.updatePricing` enforces the same rule
 * upstream; this is belt-and-suspenders.)
 *
 * **Cross-currency rows are rejected.** If `oldCost.currency !==
 * newCost.currency`, `create()` throws — currency switches should be
 * recorded as a different kind of audit event, not a price change.
 *
 * **First-ever price (oldCost = null)** is allowed. `priceChangePercentage`
 * is `null` for that row.
 *
 * Source: price_history table.
 */
export class PriceHistory {
  #id: PriceHistoryId
  #tenantId: TenantId
  #materialSupplierId: MaterialSupplierId
  #oldCost: Money | null
  #newCost: Money
  #priceChangePercentage: number | null
  #changeReason: string | null
  #effectiveDate: Date
  #changedBy: ProfileId | null
  #notes: string | null
  #createdAt: Date

  private constructor(props: ReconstitutePriceHistoryProps) {
    this.#id = props.id
    this.#tenantId = props.tenantId
    this.#materialSupplierId = props.materialSupplierId
    this.#oldCost = props.oldCost
    this.#newCost = props.newCost
    this.#priceChangePercentage = props.priceChangePercentage
    this.#changeReason = props.changeReason
    this.#effectiveDate = props.effectiveDate
    this.#changedBy = props.changedBy
    this.#notes = props.notes
    this.#createdAt = props.createdAt
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static create(props: CreatePriceHistoryProps, now: Date = new Date()): PriceHistory {
    PriceHistory.#assertCostPositive(props.newCost, "newCost")

    if (props.oldCost !== null) {
      PriceHistory.#assertCostPositive(props.oldCost, "oldCost")
      if (!props.oldCost.currency.equals(props.newCost.currency)) {
        throw new InvalidEntityError("PriceHistory", "oldCost and newCost must share a currency")
      }
      if (props.oldCost.cents === props.newCost.cents) {
        throw new InvalidEntityError(
          "PriceHistory",
          "oldCost and newCost must differ — price_history records changes"
        )
      }
    }

    const effectiveDate = props.effectiveDate ?? now
    if (Number.isNaN(effectiveDate.getTime())) {
      throw new InvalidEntityError("PriceHistory", "effectiveDate must be a valid date")
    }

    const changeReason = trimOptional(
      props.changeReason,
      "changeReason",
      CHANGE_REASON_MAX,
      "PriceHistory"
    )
    const notes = trimOptional(props.notes, "notes", null, "PriceHistory")
    const priceChangePercentage = PriceHistory.#computePercentage(props.oldCost, props.newCost)

    return new PriceHistory({
      id: props.id,
      tenantId: props.tenantId,
      materialSupplierId: props.materialSupplierId,
      oldCost: props.oldCost,
      newCost: props.newCost,
      priceChangePercentage,
      changeReason,
      effectiveDate,
      changedBy: props.changedBy ?? null,
      notes,
      createdAt: now,
    })
  }

  static reconstitute(props: ReconstitutePriceHistoryProps): PriceHistory {
    return new PriceHistory(props)
  }

  static fromJSON(s: PriceHistorySnapshot): PriceHistory {
    return PriceHistory.reconstitute({
      id: PriceHistoryId.fromPersistence(s.id),
      tenantId: TenantId.fromPersistence(s.tenantId),
      materialSupplierId: MaterialSupplierId.fromPersistence(s.materialSupplierId),
      oldCost: s.oldCost ? Money.fromSnapshot(s.oldCost) : null,
      newCost: Money.fromSnapshot(s.newCost),
      priceChangePercentage: s.priceChangePercentage,
      changeReason: s.changeReason,
      effectiveDate: new Date(s.effectiveDate),
      changedBy: s.changedBy ? ProfileId.fromPersistence(s.changedBy) : null,
      notes: s.notes,
      createdAt: new Date(s.createdAt),
    })
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get id(): PriceHistoryId {
    return this.#id
  }
  get tenantId(): TenantId {
    return this.#tenantId
  }
  get materialSupplierId(): MaterialSupplierId {
    return this.#materialSupplierId
  }
  get oldCost(): Money | null {
    return this.#oldCost
  }
  get newCost(): Money {
    return this.#newCost
  }
  get priceChangePercentage(): number | null {
    return this.#priceChangePercentage
  }
  get changeReason(): string | null {
    return this.#changeReason
  }
  get effectiveDate(): Date {
    return this.#effectiveDate
  }
  get changedBy(): ProfileId | null {
    return this.#changedBy
  }
  get notes(): string | null {
    return this.#notes
  }
  get createdAt(): Date {
    return this.#createdAt
  }

  // ─── State queries ───────────────────────────────────────────────────────

  /** True when this is the first-ever price record (no prior cost). */
  get isInitial(): boolean {
    return this.#oldCost === null
  }

  /** True when newCost > oldCost (and oldCost was non-null). */
  get isIncrease(): boolean {
    return this.#oldCost !== null && this.#newCost.cents > this.#oldCost.cents
  }

  /** True when newCost < oldCost (and oldCost was non-null). */
  get isDecrease(): boolean {
    return this.#oldCost !== null && this.#newCost.cents < this.#oldCost.cents
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  /** Mirrors DB CHECK `cost > 0`. */
  static #assertCostPositive(value: Money, field: string): void {
    if (value.cents <= 0) {
      throw new InvalidEntityError("PriceHistory", `${field} must be greater than zero`)
    }
  }

  /**
   * Mirrors the DB BEFORE-INSERT trigger that fills price_change_percentage:
   *   pct = ((new - old) / old) * 100
   * Result is rounded to 4 decimal places to match the column type
   * `numeric(8,4)`. Returns null when there is no prior cost.
   */
  static #computePercentage(oldCost: Money | null, newCost: Money): number | null {
    if (oldCost === null) return null
    const raw = ((newCost.cents - oldCost.cents) / oldCost.cents) * 100
    return Math.round(raw * 10000) / 10000
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): PriceHistorySnapshot {
    return {
      id: this.#id.value,
      tenantId: this.#tenantId.value,
      materialSupplierId: this.#materialSupplierId.value,
      oldCost: this.#oldCost?.toJSON() ?? null,
      newCost: this.#newCost.toJSON(),
      priceChangePercentage: this.#priceChangePercentage,
      changeReason: this.#changeReason,
      effectiveDate: this.#effectiveDate.toISOString(),
      changedBy: this.#changedBy?.value ?? null,
      notes: this.#notes,
      createdAt: this.#createdAt.toISOString(),
    }
  }
}
