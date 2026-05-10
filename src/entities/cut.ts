import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { trimOptional } from "@/src/entities/shared/string-helpers"
import {
  CutId,
  ProfileId,
  RollId,
  TenantId,
} from "@/src/entities/value-objects/id"

// ─── Constants (mirror DB column lengths / checks) ─────────────────────────

const JOB_REFERENCE_MAX = 100
const WASTE_PERCENTAGE_MIN = 0
const WASTE_PERCENTAGE_MAX = 100

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateCutProps {
  id: CutId
  tenantId: TenantId
  rollId?: RollId | null
  cutWidthMm: number
  cutLengthMm: number
  quantity?: number
  /** Engine output — set at create() and immutable thereafter. */
  wasteSqmm?: number | null
  /** Engine output — set at create() and immutable thereafter. */
  wastePercentage?: number | null
  /** Engine output — set at create() and immutable thereafter. */
  totalSqmmUsed?: number | null
  jobReference?: string | null
  cutBy?: ProfileId | null
  notes?: string | null
  createdBy?: ProfileId | null
}

export interface ReconstituteCutProps {
  id: CutId
  tenantId: TenantId
  rollId: RollId | null
  cutWidthMm: number
  cutLengthMm: number
  quantity: number
  wasteSqmm: number | null
  wastePercentage: number | null
  totalSqmmUsed: number | null
  jobReference: string | null
  cutBy: ProfileId | null
  notes: string | null
  createdAt: Date
  createdBy: ProfileId | null
  updatedAt: Date
  updatedBy: ProfileId | null
  deletedAt: Date | null
}

/**
 * Bulk-edit payload for `Cut.updateDetails`. Only the operator-editable
 * fields are here — the engine-produced waste/scrap fields are set at
 * create() and never modified afterward (see entity docstring).
 */
export interface CutUpdateProps {
  quantity: number
  jobReference: string | null
  cutBy: ProfileId | null
  notes: string | null
}

export interface CutSnapshot {
  id: string
  tenantId: string
  rollId: string | null
  cutWidthMm: number
  cutLengthMm: number
  quantity: number
  wasteSqmm: number | null
  wastePercentage: number | null
  totalSqmmUsed: number | null
  jobReference: string | null
  cutBy: string | null
  notes: string | null
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
  deletedAt: string | null
}

// ─── Entity ────────────────────────────────────────────────────────────────

/**
 * Single granular cut operation against a roll. One row per cut event.
 *
 * **Engine-produced fields are immutable.** `wasteSqmm`,
 * `wastePercentage`, and `totalSqmmUsed` come from the nesting engine
 * (Rust pack-cli for the auto path; client-side metric computation for
 * free-roam manual cuts) and arrive as part of the same atomic
 * "record this cut" payload. They are SET AT `create()` and never
 * modified afterward — there is no `recordWaste()` method, and
 * `updateDetails` does NOT touch them. If the engine output was wrong,
 * the operator soft-deletes the row and re-records.
 *
 * **Operator-editable fields:** `quantity`, `jobReference`, `cutBy`,
 * `notes`. Bulk-edited via `updateDetails`.
 *
 * **Cross-aggregate concern:** when a Cut is recorded, the parent Roll's
 * `consumeLength` is decremented by the orchestrating use-case
 * (`IRecordCutUseCase`), and the DB trigger `cuts_update_roll` handles
 * status transitions on the roll side. This entity does NOT touch the
 * roll directly.
 *
 * **`cut_by` vs `created_by`** — schema-level distinction preserved here:
 *   • `cutBy`     — the operator who actually made the cut
 *   • `createdBy` — whoever wrote the row (typically the same person, but
 *                   may differ when a manager logs a cut on the operator's
 *                   behalf)
 *
 * Lifecycle:
 *   create(props)         → new row; validates dimensions, quantity, waste
 *   reconstitute(props)   → DB rehydration, no validation
 *   updateDetails(props)  → bulk edit of operator-editable fields
 *   softDelete(actor)     → admin-only terminal
 *
 * Source: cuts table.
 */
export class Cut {
  #id: CutId
  #tenantId: TenantId
  #rollId: RollId | null
  #cutWidthMm: number
  #cutLengthMm: number
  #quantity: number
  #wasteSqmm: number | null
  #wastePercentage: number | null
  #totalSqmmUsed: number | null
  #jobReference: string | null
  #cutBy: ProfileId | null
  #notes: string | null
  #createdAt: Date
  #createdBy: ProfileId | null
  #updatedAt: Date
  #updatedBy: ProfileId | null
  #deletedAt: Date | null

  private constructor(props: ReconstituteCutProps) {
    this.#id = props.id
    this.#tenantId = props.tenantId
    this.#rollId = props.rollId
    this.#cutWidthMm = props.cutWidthMm
    this.#cutLengthMm = props.cutLengthMm
    this.#quantity = props.quantity
    this.#wasteSqmm = props.wasteSqmm
    this.#wastePercentage = props.wastePercentage
    this.#totalSqmmUsed = props.totalSqmmUsed
    this.#jobReference = props.jobReference
    this.#cutBy = props.cutBy
    this.#notes = props.notes
    this.#createdAt = props.createdAt
    this.#createdBy = props.createdBy
    this.#updatedAt = props.updatedAt
    this.#updatedBy = props.updatedBy
    this.#deletedAt = props.deletedAt
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static create(props: CreateCutProps, now: Date = new Date()): Cut {
    Cut.#assertPositiveInteger(props.cutWidthMm, "cutWidthMm")
    Cut.#assertPositiveInteger(props.cutLengthMm, "cutLengthMm")
    const quantity = Cut.#normalizeQuantity(props.quantity ?? 1)
    const wasteSqmm = Cut.#normalizeNonNegativeBigint(
      props.wasteSqmm ?? null,
      "wasteSqmm",
    )
    const wastePercentage = Cut.#normalizeWastePercentage(
      props.wastePercentage ?? null,
    )
    const totalSqmmUsed = Cut.#normalizeNonNegativeBigint(
      props.totalSqmmUsed ?? null,
      "totalSqmmUsed",
    )
    const jobReference = trimOptional(
      props.jobReference,
      "jobReference",
      JOB_REFERENCE_MAX,
      "Cut",
    )
    const notes = trimOptional(props.notes, "notes", null, "Cut")

    return new Cut({
      id: props.id,
      tenantId: props.tenantId,
      rollId: props.rollId ?? null,
      cutWidthMm: props.cutWidthMm,
      cutLengthMm: props.cutLengthMm,
      quantity,
      wasteSqmm,
      wastePercentage,
      totalSqmmUsed,
      jobReference,
      cutBy: props.cutBy ?? null,
      notes,
      createdAt: now,
      createdBy: props.createdBy ?? null,
      updatedAt: now,
      updatedBy: null,
      deletedAt: null,
    })
  }

  static reconstitute(props: ReconstituteCutProps): Cut {
    return new Cut(props)
  }

  static fromJSON(s: CutSnapshot): Cut {
    return Cut.reconstitute({
      id: CutId.fromPersistence(s.id),
      tenantId: TenantId.fromPersistence(s.tenantId),
      rollId: s.rollId ? RollId.fromPersistence(s.rollId) : null,
      cutWidthMm: s.cutWidthMm,
      cutLengthMm: s.cutLengthMm,
      quantity: s.quantity,
      wasteSqmm: s.wasteSqmm,
      wastePercentage: s.wastePercentage,
      totalSqmmUsed: s.totalSqmmUsed,
      jobReference: s.jobReference,
      cutBy: s.cutBy ? ProfileId.fromPersistence(s.cutBy) : null,
      notes: s.notes,
      createdAt: new Date(s.createdAt),
      createdBy: s.createdBy ? ProfileId.fromPersistence(s.createdBy) : null,
      updatedAt: new Date(s.updatedAt),
      updatedBy: s.updatedBy ? ProfileId.fromPersistence(s.updatedBy) : null,
      deletedAt: s.deletedAt ? new Date(s.deletedAt) : null,
    })
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get id(): CutId { return this.#id }
  get tenantId(): TenantId { return this.#tenantId }
  get rollId(): RollId | null { return this.#rollId }
  get cutWidthMm(): number { return this.#cutWidthMm }
  get cutLengthMm(): number { return this.#cutLengthMm }
  get quantity(): number { return this.#quantity }
  get wasteSqmm(): number | null { return this.#wasteSqmm }
  get wastePercentage(): number | null { return this.#wastePercentage }
  get totalSqmmUsed(): number | null { return this.#totalSqmmUsed }
  get jobReference(): string | null { return this.#jobReference }
  get cutBy(): ProfileId | null { return this.#cutBy }
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
   * Bulk-edit operator-editable fields. No-op if every field is unchanged.
   * Does NOT touch dimensions, rollId, or any waste/scrap field — those
   * are set at create() and immutable. (Engine output is fixed; if it was
   * wrong, soft-delete and re-record.)
   */
  updateDetails(
    props: CutUpdateProps,
    updatedBy: ProfileId,
    now: Date = new Date(),
  ): void {
    this.#assertNotDeleted("update details")
    const newQuantity = Cut.#normalizeQuantity(props.quantity)
    const newJobReference = trimOptional(
      props.jobReference,
      "jobReference",
      JOB_REFERENCE_MAX,
      "Cut",
    )
    const newNotes = trimOptional(props.notes, "notes", null, "Cut")
    const newCutBy = props.cutBy

    if (
      newQuantity === this.#quantity &&
      newJobReference === this.#jobReference &&
      newNotes === this.#notes &&
      Cut.#profileIdsEqual(newCutBy, this.#cutBy)
    ) {
      return
    }

    this.#quantity = newQuantity
    this.#jobReference = newJobReference
    this.#notes = newNotes
    this.#cutBy = newCutBy
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

  static #assertPositiveInteger(value: number, field: string): void {
    if (!Number.isInteger(value) || value <= 0) {
      throw new InvalidEntityError("Cut", `${field} must be a positive integer`)
    }
  }

  static #normalizeQuantity(value: number): number {
    if (!Number.isInteger(value) || value <= 0) {
      throw new InvalidEntityError(
        "Cut",
        "quantity must be a positive integer",
      )
    }
    return value
  }

  static #normalizeNonNegativeBigint(
    value: number | null,
    field: string,
  ): number | null {
    if (value === null) return null
    if (!Number.isFinite(value)) {
      throw new InvalidEntityError("Cut", `${field} must be a finite number`)
    }
    if (!Number.isInteger(value)) {
      throw new InvalidEntityError("Cut", `${field} must be an integer`)
    }
    if (value < 0) {
      throw new InvalidEntityError("Cut", `${field} must be >= 0`)
    }
    return value
  }

  static #normalizeWastePercentage(value: number | null): number | null {
    if (value === null) return null
    if (!Number.isFinite(value)) {
      throw new InvalidEntityError(
        "Cut",
        "wastePercentage must be a finite number",
      )
    }
    if (value < WASTE_PERCENTAGE_MIN || value > WASTE_PERCENTAGE_MAX) {
      throw new InvalidEntityError(
        "Cut",
        `wastePercentage must be between ${WASTE_PERCENTAGE_MIN} and ${WASTE_PERCENTAGE_MAX}`,
      )
    }
    return value
  }

  static #profileIdsEqual(
    a: ProfileId | null,
    b: ProfileId | null,
  ): boolean {
    if (a === null && b === null) return true
    if (a === null || b === null) return false
    return a.equals(b)
  }

  #touchAudit(updatedBy: ProfileId, now: Date): void {
    this.#updatedAt = now
    this.#updatedBy = updatedBy
  }

  #assertNotDeleted(operation: string): void {
    if (this.#deletedAt !== null) {
      throw new InvalidEntityError(
        "Cut",
        `cannot ${operation} on a deleted cut`,
      )
    }
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): CutSnapshot {
    return {
      id: this.#id.value,
      tenantId: this.#tenantId.value,
      rollId: this.#rollId?.value ?? null,
      cutWidthMm: this.#cutWidthMm,
      cutLengthMm: this.#cutLengthMm,
      quantity: this.#quantity,
      wasteSqmm: this.#wasteSqmm,
      wastePercentage: this.#wastePercentage,
      totalSqmmUsed: this.#totalSqmmUsed,
      jobReference: this.#jobReference,
      cutBy: this.#cutBy?.value ?? null,
      notes: this.#notes,
      createdAt: this.#createdAt.toISOString(),
      createdBy: this.#createdBy?.value ?? null,
      updatedAt: this.#updatedAt.toISOString(),
      updatedBy: this.#updatedBy?.value ?? null,
      deletedAt: this.#deletedAt?.toISOString() ?? null,
    }
  }
}
