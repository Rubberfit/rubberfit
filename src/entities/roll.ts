import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { trimOptional } from "@/src/entities/shared/string-helpers"
import {
  CutHistoryId,
  MaterialTypeId,
  ProfileId,
  PurchaseOrderItemId,
  RollId,
  SupplierId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Money, type MoneySnapshot } from "@/src/entities/value-objects/money"

// ─── Constants (mirror DB column lengths / checks) ─────────────────────────

const COLOR_MAX = 50
const LOCATION_MAX = 100

// ─── Types ─────────────────────────────────────────────────────────────────

export type RollSourceType = "received" | "offcut"
export type RollStatus = "active" | "reserved" | "depleted"
/**
 * Mirrors the DB CHECK `barcode_format IN ('code128')`. Add new variants
 * here in lock-step with the migration.
 */
export type BarcodeFormat = "code128"

const ROLL_STATUSES: readonly RollStatus[] = ["active", "reserved", "depleted"] as const

const BARCODE_FORMATS: readonly BarcodeFormat[] = ["code128"] as const

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateRollProps {
  id: RollId
  tenantId: TenantId
  materialTypeId: MaterialTypeId
  supplierId?: SupplierId | null
  sourceType: RollSourceType
  parentRollId?: RollId | null
  /**
   * Required for `sourceType: 'offcut'` (alongside `parentRollId`);
   * MUST be null for `sourceType: 'received'`. Mirrors the DB
   * `rolls_source_consistency` CHECK.
   */
  sourceCutHistoryId?: CutHistoryId | null
  /**
   * Optional PO-item lineage for received rolls. Only set by the
   * receive-PO use-case; powers the `po_receipts_pending_roll_creation`
   * reconciliation view (step 7b). Always null for offcuts and for
   * legacy/manual-entry received rolls.
   */
  purchaseOrderItemId?: PurchaseOrderItemId | null
  widthMm: number
  lengthMm: number
  thicknessMm: number
  /** Defaults to `lengthMm` on a fresh create. */
  remainingLengthMm?: number
  color?: string | null
  location?: string | null
  dateReceived?: Date
  cost?: Money | null
  notes?: string | null
  createdBy?: ProfileId | null
}

export interface ReconstituteRollProps {
  id: RollId
  tenantId: TenantId
  materialTypeId: MaterialTypeId
  supplierId: SupplierId | null
  sourceType: RollSourceType
  parentRollId: RollId | null
  sourceCutHistoryId: CutHistoryId | null
  purchaseOrderItemId: PurchaseOrderItemId | null
  widthMm: number
  lengthMm: number
  remainingLengthMm: number
  thicknessMm: number
  color: string | null
  location: string | null
  dateReceived: Date
  cost: Money | null
  status: RollStatus
  notes: string | null
  qrGeneratedAt: Date | null
  barcodeFormat: BarcodeFormat
  barcodeAssetPath: string | null
  barcodeGeneratedAt: Date | null
  createdAt: Date
  createdBy: ProfileId | null
  updatedAt: Date
  updatedBy: ProfileId | null
  deletedAt: Date | null
}

export interface RollSnapshot {
  id: string
  tenantId: string
  materialTypeId: string
  supplierId: string | null
  sourceType: RollSourceType
  parentRollId: string | null
  sourceCutHistoryId: string | null
  purchaseOrderItemId: string | null
  widthMm: number
  lengthMm: number
  remainingLengthMm: number
  thicknessMm: number
  color: string | null
  location: string | null
  dateReceived: string
  cost: MoneySnapshot | null
  status: RollStatus
  notes: string | null
  qrGeneratedAt: string | null
  barcodeFormat: BarcodeFormat
  barcodeAssetPath: string | null
  barcodeGeneratedAt: string | null
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
  deletedAt: string | null
}

// ─── Entity ────────────────────────────────────────────────────────────────

/**
 * Physical inventory: one row per piece of stock.
 *
 * **Source flavors** (`sourceType`):
 *   • `received` — a roll purchased from a supplier. `parentRollId` AND
 *                  `sourceCutHistoryId` MUST both be null.
 *   • `offcut`   — a reusable leftover produced by a cut. BOTH
 *                  `parentRollId` (the roll it came from) AND
 *                  `sourceCutHistoryId` (the cut that produced it) MUST
 *                  be non-null. Mirrors the DB `rolls_source_consistency`
 *                  CHECK added in the operations migration.
 *                  The use-case that creates offcuts (`ICreateOffcutUseCase`)
 *                  is responsible for inheriting `materialTypeId` /
 *                  `supplierId` / `cost` from the parent — this entity
 *                  only enforces the lineage-FK invariant.
 *
 * **Status FSM** (strict — see DDD slice notes):
 *   • `active`   → the only state a cut can consume from
 *   • `reserved` → operator has set the whole roll aside; no consumption
 *                  until released
 *   • `depleted` → terminal. Set automatically when `consumeLength` brings
 *                  remaining to zero. No un-deplete.
 *
 * Allowed transitions:
 *   active → reserved   (`reserve`)
 *   reserved → active   (`release`)
 *   active → active     (`consumeLength` partial)
 *   active → depleted   (`consumeLength` to zero, automatic)
 *
 * **Immutable after `create`:** `materialTypeId`, `supplierId`,
 * `sourceType`, `parentRollId`, `widthMm`, `lengthMm`, `thicknessMm`,
 * `color`, `dateReceived`, `cost`. If a value was wrong, soft-delete and
 * re-create. (No `correctCost` / `correctSupplier` — keep the entity's
 * mutation surface small.)
 *
 * **Mutable surface:**
 *   • `consumeLength(mm)`  — decrement remaining; auto-depletes at zero
 *   • `reserve()`          — set whole roll aside
 *   • `release()`          — undo `reserve`
 *   • `relocate(location)` — change physical location
 *   • `updateNotes(notes)` — edit the notes field
 *   • `recordBarcode(...)` — store the rendered Code128 PNG triple
 *   • `recordQrGenerated(...)` — bump the QR-PDF generation timestamp
 *   • `softDelete()`       — admin-only hide; independent of status
 *
 * **`isDeleted` vs `status`** — independent. A `depleted` roll can be
 * soft-deleted; a `deleted` roll keeps whatever status it had.
 *
 * Source: rolls table.
 */
export class Roll {
  #id: RollId
  #tenantId: TenantId
  #materialTypeId: MaterialTypeId
  #supplierId: SupplierId | null
  #sourceType: RollSourceType
  #parentRollId: RollId | null
  #sourceCutHistoryId: CutHistoryId | null
  #purchaseOrderItemId: PurchaseOrderItemId | null
  #widthMm: number
  #lengthMm: number
  #remainingLengthMm: number
  #thicknessMm: number
  #color: string | null
  #location: string | null
  #dateReceived: Date
  #cost: Money | null
  #status: RollStatus
  #notes: string | null
  #qrGeneratedAt: Date | null
  #barcodeFormat: BarcodeFormat
  #barcodeAssetPath: string | null
  #barcodeGeneratedAt: Date | null
  #createdAt: Date
  #createdBy: ProfileId | null
  #updatedAt: Date
  #updatedBy: ProfileId | null
  #deletedAt: Date | null

  private constructor(props: ReconstituteRollProps) {
    this.#id = props.id
    this.#tenantId = props.tenantId
    this.#materialTypeId = props.materialTypeId
    this.#supplierId = props.supplierId
    this.#sourceType = props.sourceType
    this.#parentRollId = props.parentRollId
    this.#sourceCutHistoryId = props.sourceCutHistoryId
    this.#purchaseOrderItemId = props.purchaseOrderItemId
    this.#widthMm = props.widthMm
    this.#lengthMm = props.lengthMm
    this.#remainingLengthMm = props.remainingLengthMm
    this.#thicknessMm = props.thicknessMm
    this.#color = props.color
    this.#location = props.location
    this.#dateReceived = props.dateReceived
    this.#cost = props.cost
    this.#status = props.status
    this.#notes = props.notes
    this.#qrGeneratedAt = props.qrGeneratedAt
    this.#barcodeFormat = props.barcodeFormat
    this.#barcodeAssetPath = props.barcodeAssetPath
    this.#barcodeGeneratedAt = props.barcodeGeneratedAt
    this.#createdAt = props.createdAt
    this.#createdBy = props.createdBy
    this.#updatedAt = props.updatedAt
    this.#updatedBy = props.updatedBy
    this.#deletedAt = props.deletedAt
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static create(props: CreateRollProps, now: Date = new Date()): Roll {
    Roll.#assertPositiveInteger(props.widthMm, "widthMm")
    Roll.#assertPositiveInteger(props.lengthMm, "lengthMm")
    Roll.#assertPositiveFinite(props.thicknessMm, "thicknessMm")

    const remainingLengthMm = props.remainingLengthMm ?? props.lengthMm
    Roll.#assertRemainingWithinLength(remainingLengthMm, props.lengthMm)

    Roll.#assertSourceConsistency(
      props.sourceType,
      props.parentRollId ?? null,
      props.sourceCutHistoryId ?? null,
      props.id
    )

    if (props.cost) {
      Roll.#assertCostNonNegative(props.cost)
    }

    const color = trimOptional(props.color, "color", COLOR_MAX, "Roll")
    const location = trimOptional(props.location, "location", LOCATION_MAX, "Roll")
    const notes = trimOptional(props.notes, "notes", null, "Roll")

    return new Roll({
      id: props.id,
      tenantId: props.tenantId,
      materialTypeId: props.materialTypeId,
      supplierId: props.supplierId ?? null,
      sourceType: props.sourceType,
      parentRollId: props.parentRollId ?? null,
      sourceCutHistoryId: props.sourceCutHistoryId ?? null,
      purchaseOrderItemId: props.purchaseOrderItemId ?? null,
      widthMm: props.widthMm,
      lengthMm: props.lengthMm,
      remainingLengthMm,
      thicknessMm: props.thicknessMm,
      color,
      location,
      dateReceived: props.dateReceived ?? now,
      cost: props.cost ?? null,
      status: "active",
      notes,
      qrGeneratedAt: null,
      barcodeFormat: "code128",
      barcodeAssetPath: null,
      barcodeGeneratedAt: null,
      createdAt: now,
      createdBy: props.createdBy ?? null,
      updatedAt: now,
      updatedBy: null,
      deletedAt: null,
    })
  }

  static reconstitute(props: ReconstituteRollProps): Roll {
    return new Roll(props)
  }

  static fromJSON(s: RollSnapshot): Roll {
    return Roll.reconstitute({
      id: RollId.fromPersistence(s.id),
      tenantId: TenantId.fromPersistence(s.tenantId),
      materialTypeId: MaterialTypeId.fromPersistence(s.materialTypeId),
      supplierId: s.supplierId ? SupplierId.fromPersistence(s.supplierId) : null,
      sourceType: s.sourceType,
      parentRollId: s.parentRollId ? RollId.fromPersistence(s.parentRollId) : null,
      sourceCutHistoryId: s.sourceCutHistoryId
        ? CutHistoryId.fromPersistence(s.sourceCutHistoryId)
        : null,
      purchaseOrderItemId: s.purchaseOrderItemId
        ? PurchaseOrderItemId.fromPersistence(s.purchaseOrderItemId)
        : null,
      widthMm: s.widthMm,
      lengthMm: s.lengthMm,
      remainingLengthMm: s.remainingLengthMm,
      thicknessMm: s.thicknessMm,
      color: s.color,
      location: s.location,
      dateReceived: new Date(s.dateReceived),
      cost: s.cost ? Money.fromSnapshot(s.cost) : null,
      status: s.status,
      notes: s.notes,
      qrGeneratedAt: s.qrGeneratedAt ? new Date(s.qrGeneratedAt) : null,
      barcodeFormat: s.barcodeFormat,
      barcodeAssetPath: s.barcodeAssetPath,
      barcodeGeneratedAt: s.barcodeGeneratedAt ? new Date(s.barcodeGeneratedAt) : null,
      createdAt: new Date(s.createdAt),
      createdBy: s.createdBy ? ProfileId.fromPersistence(s.createdBy) : null,
      updatedAt: new Date(s.updatedAt),
      updatedBy: s.updatedBy ? ProfileId.fromPersistence(s.updatedBy) : null,
      deletedAt: s.deletedAt ? new Date(s.deletedAt) : null,
    })
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get id(): RollId {
    return this.#id
  }
  get tenantId(): TenantId {
    return this.#tenantId
  }
  get materialTypeId(): MaterialTypeId {
    return this.#materialTypeId
  }
  get supplierId(): SupplierId | null {
    return this.#supplierId
  }
  get sourceType(): RollSourceType {
    return this.#sourceType
  }
  get parentRollId(): RollId | null {
    return this.#parentRollId
  }
  get sourceCutHistoryId(): CutHistoryId | null {
    return this.#sourceCutHistoryId
  }
  get purchaseOrderItemId(): PurchaseOrderItemId | null {
    return this.#purchaseOrderItemId
  }
  get widthMm(): number {
    return this.#widthMm
  }
  get lengthMm(): number {
    return this.#lengthMm
  }
  get remainingLengthMm(): number {
    return this.#remainingLengthMm
  }
  get thicknessMm(): number {
    return this.#thicknessMm
  }
  get color(): string | null {
    return this.#color
  }
  get location(): string | null {
    return this.#location
  }
  get dateReceived(): Date {
    return this.#dateReceived
  }
  get cost(): Money | null {
    return this.#cost
  }
  get status(): RollStatus {
    return this.#status
  }
  get notes(): string | null {
    return this.#notes
  }
  get qrGeneratedAt(): Date | null {
    return this.#qrGeneratedAt
  }
  get barcodeFormat(): BarcodeFormat {
    return this.#barcodeFormat
  }
  get barcodeAssetPath(): string | null {
    return this.#barcodeAssetPath
  }
  get barcodeGeneratedAt(): Date | null {
    return this.#barcodeGeneratedAt
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

  get isActive(): boolean {
    return this.#status === "active"
  }

  get isReserved(): boolean {
    return this.#status === "reserved"
  }

  get isDepleted(): boolean {
    return this.#status === "depleted"
  }

  get isOffcut(): boolean {
    return this.#sourceType === "offcut"
  }

  // ─── State transitions ───────────────────────────────────────────────────

  /**
   * Decrement `remainingLengthMm` by `mm`. Auto-flips status to
   * `depleted` when remaining reaches zero (mirrors the DB BEFORE-UPDATE
   * trigger).
   *
   * Preconditions:
   *   • not soft-deleted
   *   • status === 'active'
   *   • mm is a positive integer
   *   • mm <= remainingLengthMm
   *
   * Cross-aggregate side effects (writing a `cut_history` row, updating a
   * `job_roll_allocation`) are use-case concerns — this entity only
   * mutates its own state.
   */
  consumeLength(mm: number, actor: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("consume length")
    if (this.#status !== "active") {
      throw new InvalidEntityError("Roll", `cannot consume length on a ${this.#status} roll`)
    }
    if (!Number.isInteger(mm) || mm <= 0) {
      throw new InvalidEntityError("Roll", "mm to consume must be a positive integer")
    }
    if (mm > this.#remainingLengthMm) {
      throw new InvalidEntityError(
        "Roll",
        `cannot consume ${mm}mm; only ${this.#remainingLengthMm}mm remaining`
      )
    }

    this.#remainingLengthMm -= mm
    if (this.#remainingLengthMm === 0) {
      this.#status = "depleted"
    }
    this.#touchAudit(actor, now)
  }

  /**
   * Set the whole roll aside (e.g., reserved for a specific job in a way
   * that excludes any other consumption). `active → reserved`.
   * Idempotent on a roll that is already reserved.
   * Throws if `depleted` or soft-deleted.
   */
  reserve(actor: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("reserve")
    if (this.#status === "depleted") {
      throw new InvalidEntityError("Roll", "cannot reserve a depleted roll")
    }
    if (this.#status === "reserved") return
    this.#status = "reserved"
    this.#touchAudit(actor, now)
  }

  /**
   * Undo a reservation. `reserved → active`.
   * Idempotent on a roll that is already active.
   * Throws if `depleted` or soft-deleted.
   */
  release(actor: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("release")
    if (this.#status === "depleted") {
      throw new InvalidEntityError("Roll", "cannot release a depleted roll")
    }
    if (this.#status === "active") return
    this.#status = "active"
    this.#touchAudit(actor, now)
  }

  /** Change physical location. No-op if unchanged. */
  relocate(location: string | null, actor: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("relocate")
    const newLocation = trimOptional(location, "location", LOCATION_MAX, "Roll")
    if (newLocation === this.#location) return
    this.#location = newLocation
    this.#touchAudit(actor, now)
  }

  /** Edit the free-form notes field. No-op if unchanged. */
  updateNotes(notes: string | null, actor: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("update notes")
    const newNotes = trimOptional(notes, "notes", null, "Roll")
    if (newNotes === this.#notes) return
    this.#notes = newNotes
    this.#touchAudit(actor, now)
  }

  /**
   * Record that a barcode asset (PNG) has been generated/uploaded for this
   * roll. Stores the format, the storage object path, and the generation
   * timestamp atomically. Always bumps audit (regenerating the barcode is
   * a real event even if the path didn't change).
   */
  recordBarcode(
    format: BarcodeFormat,
    assetPath: string,
    actor: ProfileId,
    now: Date = new Date()
  ): void {
    this.#assertNotDeleted("record barcode")
    if (!BARCODE_FORMATS.includes(format)) {
      throw new InvalidEntityError("Roll", `unsupported barcodeFormat: ${format}`)
    }
    const trimmedPath = assetPath.trim()
    if (trimmedPath.length === 0) {
      throw new InvalidEntityError("Roll", "barcodeAssetPath must not be empty")
    }

    this.#barcodeFormat = format
    this.#barcodeAssetPath = trimmedPath
    this.#barcodeGeneratedAt = now
    this.#touchAudit(actor, now)
  }

  /**
   * Record that the QR-code PDF has been generated for this roll. Always
   * bumps the timestamp + audit — re-generation is a real event.
   */
  recordQrGenerated(actor: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("record QR generation")
    this.#qrGeneratedAt = now
    this.#touchAudit(actor, now)
  }

  /**
   * Admin-only soft delete. Independent of status — a depleted roll can
   * be soft-deleted; a soft-deleted roll keeps its prior status. Idempotent.
   */
  softDelete(actor: ProfileId, now: Date = new Date()): void {
    if (this.#deletedAt !== null) return
    this.#deletedAt = now
    this.#touchAudit(actor, now)
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  static #assertPositiveInteger(value: number, field: string): void {
    if (!Number.isInteger(value) || value <= 0) {
      throw new InvalidEntityError("Roll", `${field} must be a positive integer`)
    }
  }

  static #assertPositiveFinite(value: number, field: string): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new InvalidEntityError("Roll", `${field} must be greater than zero`)
    }
  }

  static #assertRemainingWithinLength(remainingMm: number, lengthMm: number): void {
    if (!Number.isInteger(remainingMm) || remainingMm < 0) {
      throw new InvalidEntityError("Roll", "remainingLengthMm must be a non-negative integer")
    }
    if (remainingMm > lengthMm) {
      throw new InvalidEntityError("Roll", "remainingLengthMm cannot exceed lengthMm")
    }
  }

  /**
   * Mirrors the DB `rolls_source_consistency` CHECK:
   *   • `received` ⇒ parentRollId IS NULL AND sourceCutHistoryId IS NULL
   *   • `offcut`   ⇒ parentRollId IS NOT NULL AND sourceCutHistoryId IS NOT NULL
   * Plus a self-parent guard.
   */
  static #assertSourceConsistency(
    sourceType: RollSourceType,
    parentRollId: RollId | null,
    sourceCutHistoryId: CutHistoryId | null,
    ownId: RollId
  ): void {
    if (sourceType === "received") {
      if (parentRollId !== null) {
        throw new InvalidEntityError("Roll", "received rolls must not have a parentRollId")
      }
      if (sourceCutHistoryId !== null) {
        throw new InvalidEntityError("Roll", "received rolls must not have a sourceCutHistoryId")
      }
      return
    }

    // sourceType === "offcut"
    if (parentRollId === null) {
      throw new InvalidEntityError("Roll", "offcut rolls must have a parentRollId")
    }
    if (sourceCutHistoryId === null) {
      throw new InvalidEntityError("Roll", "offcut rolls must have a sourceCutHistoryId")
    }
    if (parentRollId.equals(ownId)) {
      throw new InvalidEntityError("Roll", "parentRollId cannot equal the roll's own id")
    }
  }

  /** Mirrors DB CHECK `cost_per_sqm_cents IS NULL OR cost_per_sqm_cents >= 0`. */
  static #assertCostNonNegative(value: Money): void {
    if (value.cents < 0) {
      throw new InvalidEntityError("Roll", "cost must be >= 0")
    }
  }

  #touchAudit(actor: ProfileId, now: Date): void {
    this.#updatedAt = now
    this.#updatedBy = actor
  }

  #assertNotDeleted(operation: string): void {
    if (this.#deletedAt !== null) {
      throw new InvalidEntityError("Roll", `cannot ${operation} on a deleted roll`)
    }
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): RollSnapshot {
    return {
      id: this.#id.value,
      tenantId: this.#tenantId.value,
      materialTypeId: this.#materialTypeId.value,
      supplierId: this.#supplierId?.value ?? null,
      sourceType: this.#sourceType,
      parentRollId: this.#parentRollId?.value ?? null,
      sourceCutHistoryId: this.#sourceCutHistoryId?.value ?? null,
      purchaseOrderItemId: this.#purchaseOrderItemId?.value ?? null,
      widthMm: this.#widthMm,
      lengthMm: this.#lengthMm,
      remainingLengthMm: this.#remainingLengthMm,
      thicknessMm: this.#thicknessMm,
      color: this.#color,
      location: this.#location,
      dateReceived: this.#dateReceived.toISOString(),
      cost: this.#cost?.toJSON() ?? null,
      status: this.#status,
      notes: this.#notes,
      qrGeneratedAt: this.#qrGeneratedAt?.toISOString() ?? null,
      barcodeFormat: this.#barcodeFormat,
      barcodeAssetPath: this.#barcodeAssetPath,
      barcodeGeneratedAt: this.#barcodeGeneratedAt?.toISOString() ?? null,
      createdAt: this.#createdAt.toISOString(),
      createdBy: this.#createdBy?.value ?? null,
      updatedAt: this.#updatedAt.toISOString(),
      updatedBy: this.#updatedBy?.value ?? null,
      deletedAt: this.#deletedAt?.toISOString() ?? null,
    }
  }
}

// `ROLL_STATUSES` is exported for tests / UI form validation.
export { ROLL_STATUSES }
