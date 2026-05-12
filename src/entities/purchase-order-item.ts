import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { trimOptional } from "@/src/entities/shared/string-helpers"
import { MaterialTypeId } from "@/src/entities/value-objects/id"
import { Money, type MoneySnapshot } from "@/src/entities/value-objects/money"

// ─── Constants (mirror DB column lengths / checks) ─────────────────────────

const DESCRIPTION_MAX = 500
const COLOR_MAX = 50

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreatePurchaseOrderItemProps {
  lineNumber: number
  materialTypeId: MaterialTypeId
  description?: string | null
  widthMm?: number | null
  lengthMm?: number | null
  thicknessMm?: number | null
  color?: string | null
  quantitySqm: number
  quantityReceivedSqm?: number
  unitCost: Money
  /**
   * Optional snapshot of `quantitySqm × unitCost` at PO issue time.
   * If omitted, derived as `unitCost.multiply(quantitySqm)`. Once set
   * (whether by caller or derivation) it is NOT recomputed on later
   * edits — that's intentional, mirroring the DB comment on
   * `purchase_order_items.line_total_cents`.
   */
  lineTotal?: Money | null
  receivedDate?: Date | null
  notes?: string | null
}

export interface PurchaseOrderItemSnapshot {
  lineNumber: number
  materialTypeId: string
  description: string | null
  widthMm: number | null
  lengthMm: number | null
  thicknessMm: number | null
  color: string | null
  quantitySqm: number
  quantityReceivedSqm: number
  unitCost: MoneySnapshot
  lineTotal: MoneySnapshot
  receivedDate: string | null
  notes: string | null
}

// ─── Value object ──────────────────────────────────────────────────────────

/**
 * One ordered line on a `PurchaseOrder` — a material × dimensions ×
 * quantity row with its own unit cost and running received-quantity.
 *
 * Lives as a value-object collection on `PurchaseOrder`. NOT a separate
 * entity:
 *   • No public ID. The DB row's `id` is a repo-internal detail; the
 *     identity here is `(purchaseOrderId, lineNumber)`.
 *   • Immutable after construction. Receipt updates produce a NEW
 *     instance via `withReceipt()` — the parent `PurchaseOrder`
 *     manages the collection swap and audit.
 *   • Schema-level cascade delete from the parent reflects this domain
 *     coupling.
 *
 * **`unitCost` and `lineTotal` share a currency** — the parent
 * `PurchaseOrder` further enforces that every item's currency matches
 * the PO's tax / shipping / total currency.
 *
 * **`lineTotal` is a snapshot** at PO-issue time. Not recomputed when
 * `quantitySqm` or `unitCost` change later (matches DB column comment).
 *
 * Source: purchase_order_items table.
 */
export class PurchaseOrderItem {
  public readonly lineNumber: number
  public readonly materialTypeId: MaterialTypeId
  public readonly description: string | null
  public readonly widthMm: number | null
  public readonly lengthMm: number | null
  public readonly thicknessMm: number | null
  public readonly color: string | null
  public readonly quantitySqm: number
  public readonly quantityReceivedSqm: number
  public readonly unitCost: Money
  public readonly lineTotal: Money
  public readonly receivedDate: Date | null
  public readonly notes: string | null

  private constructor(props: {
    lineNumber: number
    materialTypeId: MaterialTypeId
    description: string | null
    widthMm: number | null
    lengthMm: number | null
    thicknessMm: number | null
    color: string | null
    quantitySqm: number
    quantityReceivedSqm: number
    unitCost: Money
    lineTotal: Money
    receivedDate: Date | null
    notes: string | null
  }) {
    this.lineNumber = props.lineNumber
    this.materialTypeId = props.materialTypeId
    this.description = props.description
    this.widthMm = props.widthMm
    this.lengthMm = props.lengthMm
    this.thicknessMm = props.thicknessMm
    this.color = props.color
    this.quantitySqm = props.quantitySqm
    this.quantityReceivedSqm = props.quantityReceivedSqm
    this.unitCost = props.unitCost
    this.lineTotal = props.lineTotal
    this.receivedDate = props.receivedDate
    this.notes = props.notes
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static create(props: CreatePurchaseOrderItemProps): PurchaseOrderItem {
    PurchaseOrderItem.#assertPositiveInteger(props.lineNumber, "lineNumber")
    PurchaseOrderItem.#assertPositiveFinite(props.quantitySqm, "quantitySqm")

    if (props.widthMm !== null && props.widthMm !== undefined) {
      PurchaseOrderItem.#assertPositiveInteger(props.widthMm, "widthMm")
    }
    if (props.lengthMm !== null && props.lengthMm !== undefined) {
      PurchaseOrderItem.#assertPositiveInteger(props.lengthMm, "lengthMm")
    }
    if (props.thicknessMm !== null && props.thicknessMm !== undefined) {
      PurchaseOrderItem.#assertPositiveFinite(props.thicknessMm, "thicknessMm")
    }

    const quantityReceivedSqm = props.quantityReceivedSqm ?? 0
    if (!Number.isFinite(quantityReceivedSqm) || quantityReceivedSqm < 0) {
      throw new InvalidEntityError("PurchaseOrderItem", "quantityReceivedSqm must be >= 0")
    }
    if (quantityReceivedSqm > props.quantitySqm) {
      throw new InvalidEntityError(
        "PurchaseOrderItem",
        "quantityReceivedSqm cannot exceed quantitySqm"
      )
    }

    if (props.unitCost.cents < 0) {
      throw new InvalidEntityError("PurchaseOrderItem", "unitCost must be >= 0")
    }

    const lineTotal = props.lineTotal ?? props.unitCost.multiply(props.quantitySqm)
    if (lineTotal.cents < 0) {
      throw new InvalidEntityError("PurchaseOrderItem", "lineTotal must be >= 0")
    }
    if (!lineTotal.currency.equals(props.unitCost.currency)) {
      throw new InvalidEntityError(
        "PurchaseOrderItem",
        "lineTotal currency must match unitCost currency"
      )
    }

    const description = trimOptional(
      props.description,
      "description",
      DESCRIPTION_MAX,
      "PurchaseOrderItem"
    )
    const color = trimOptional(props.color, "color", COLOR_MAX, "PurchaseOrderItem")
    const notes = trimOptional(props.notes, "notes", null, "PurchaseOrderItem")

    return new PurchaseOrderItem({
      lineNumber: props.lineNumber,
      materialTypeId: props.materialTypeId,
      description,
      widthMm: props.widthMm ?? null,
      lengthMm: props.lengthMm ?? null,
      thicknessMm: props.thicknessMm ?? null,
      color,
      quantitySqm: props.quantitySqm,
      quantityReceivedSqm,
      unitCost: props.unitCost,
      lineTotal,
      receivedDate: props.receivedDate ?? null,
      notes,
    })
  }

  static fromSnapshot(s: PurchaseOrderItemSnapshot): PurchaseOrderItem {
    return new PurchaseOrderItem({
      lineNumber: s.lineNumber,
      materialTypeId: MaterialTypeId.fromPersistence(s.materialTypeId),
      description: s.description,
      widthMm: s.widthMm,
      lengthMm: s.lengthMm,
      thicknessMm: s.thicknessMm,
      color: s.color,
      quantitySqm: s.quantitySqm,
      quantityReceivedSqm: s.quantityReceivedSqm,
      unitCost: Money.fromSnapshot(s.unitCost),
      lineTotal: Money.fromSnapshot(s.lineTotal),
      receivedDate: s.receivedDate ? new Date(s.receivedDate) : null,
      notes: s.notes,
    })
  }

  // ─── Predicates ─────────────────────────────────────────────────────────

  get isFullyReceived(): boolean {
    return this.quantityReceivedSqm >= this.quantitySqm
  }

  // ─── Functional updates ─────────────────────────────────────────────────

  /**
   * Return a NEW item with additional received quantity. Does not mutate
   * this instance — the parent aggregate is responsible for swapping the
   * collection slot and bumping its own audit fields.
   */
  withReceipt(additionalQtySqm: number, receivedDate: Date): PurchaseOrderItem {
    if (!Number.isFinite(additionalQtySqm) || additionalQtySqm <= 0) {
      throw new InvalidEntityError(
        "PurchaseOrderItem",
        "receipt quantity must be greater than zero"
      )
    }
    const newTotal = this.quantityReceivedSqm + additionalQtySqm
    if (newTotal > this.quantitySqm) {
      throw new InvalidEntityError(
        "PurchaseOrderItem",
        `receipt would exceed ordered quantity (received ${newTotal} of ${this.quantitySqm})`
      )
    }
    return new PurchaseOrderItem({
      lineNumber: this.lineNumber,
      materialTypeId: this.materialTypeId,
      description: this.description,
      widthMm: this.widthMm,
      lengthMm: this.lengthMm,
      thicknessMm: this.thicknessMm,
      color: this.color,
      quantitySqm: this.quantitySqm,
      quantityReceivedSqm: newTotal,
      unitCost: this.unitCost,
      lineTotal: this.lineTotal,
      receivedDate,
      notes: this.notes,
    })
  }

  // ─── Equality ────────────────────────────────────────────────────────────

  equals(other: PurchaseOrderItem | null | undefined): boolean {
    if (!other) return false
    return (
      this.lineNumber === other.lineNumber &&
      this.materialTypeId.equals(other.materialTypeId) &&
      this.description === other.description &&
      this.widthMm === other.widthMm &&
      this.lengthMm === other.lengthMm &&
      this.thicknessMm === other.thicknessMm &&
      this.color === other.color &&
      this.quantitySqm === other.quantitySqm &&
      this.quantityReceivedSqm === other.quantityReceivedSqm &&
      this.unitCost.equals(other.unitCost) &&
      this.lineTotal.equals(other.lineTotal) &&
      (this.receivedDate?.getTime() ?? null) === (other.receivedDate?.getTime() ?? null) &&
      this.notes === other.notes
    )
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): PurchaseOrderItemSnapshot {
    return {
      lineNumber: this.lineNumber,
      materialTypeId: this.materialTypeId.value,
      description: this.description,
      widthMm: this.widthMm,
      lengthMm: this.lengthMm,
      thicknessMm: this.thicknessMm,
      color: this.color,
      quantitySqm: this.quantitySqm,
      quantityReceivedSqm: this.quantityReceivedSqm,
      unitCost: this.unitCost.toJSON(),
      lineTotal: this.lineTotal.toJSON(),
      receivedDate: this.receivedDate?.toISOString() ?? null,
      notes: this.notes,
    }
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  static #assertPositiveInteger(value: number, field: string): void {
    if (!Number.isInteger(value) || value <= 0) {
      throw new InvalidEntityError("PurchaseOrderItem", `${field} must be a positive integer`)
    }
  }

  static #assertPositiveFinite(value: number, field: string): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new InvalidEntityError("PurchaseOrderItem", `${field} must be greater than zero`)
    }
  }
}
