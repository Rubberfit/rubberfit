import {
  CutHistorySelection,
  type CreateCutHistorySelectionProps,
  type CutHistorySelectionSnapshot,
} from "@/src/entities/cut-history-selection"
import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { trimOptional } from "@/src/entities/shared/string-helpers"
import {
  CutHistoryId,
  MaterialTypeId,
  ProfileId,
  RollId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Money, type MoneySnapshot } from "@/src/entities/value-objects/money"

// ─── Constants (mirror DB column lengths / checks) ─────────────────────────

const STOCK_LABEL_MAX = 200
const PDF_URL_MAX = 500

// ─── Types ─────────────────────────────────────────────────────────────────

export type CutHistorySource = "auto" | "manual"

const CUT_HISTORY_SOURCES: readonly CutHistorySource[] = [
  "auto",
  "manual",
] as const

/**
 * Opaque shape for `layout_json`. The strongly-typed discriminated union
 * (`CutHistoryLayoutJson`) lives in `src/infrastructure/models/` because
 * the JSONB blob is owned by the cutting-engine surface; the entity
 * round-trips it without inspecting the shape.
 */
export type CutHistoryLayoutBlob = Record<string, unknown>

/**
 * Opaque shape for `part_custom_dimensions`. Same rationale as
 * `CutHistoryLayoutBlob` — different part shapes (rectangle, trapezoid,
 * arc, ...) use different subsets of fields; the strongly-typed schema
 * lives in the infrastructure layer.
 */
export type PartCustomDimensions = Record<string, unknown>

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateCutHistoryProps {
  id: CutHistoryId
  tenantId: TenantId
  userId?: ProfileId | null
  materialTypeId: MaterialTypeId
  /**
   * No FK yet — schema comment notes "awaiting Part-table decision".
   * Treated as a free-form UUID string until a `PartId` factory exists.
   */
  partId?: string | null
  rollId?: RollId | null
  cutLengthMm: number
  cutWidthMm: number
  cutThicknessMm?: number | null
  partCustomWidthMm?: number | null
  partCustomHeightMm?: number | null
  partCustomDimensions?: PartCustomDimensions[] | null
  cutAmount?: number
  partsCompleted?: number
  cutPieces?: number
  materialUsedSqmm?: number
  scrapSqmm?: number
  fabScore?: number | null
  cost?: Money | null
  stockLabel?: string | null
  pdfUrl?: string | null
  source?: CutHistorySource
  layoutJson?: CutHistoryLayoutBlob | null
  cutDate?: Date
  selections?: CreateCutHistorySelectionProps[]
  createdBy?: ProfileId | null
}

export interface ReconstituteCutHistoryProps {
  id: CutHistoryId
  tenantId: TenantId
  userId: ProfileId | null
  materialTypeId: MaterialTypeId
  partId: string | null
  rollId: RollId | null
  cutLengthMm: number
  cutWidthMm: number
  cutThicknessMm: number | null
  partCustomWidthMm: number | null
  partCustomHeightMm: number | null
  partCustomDimensions: PartCustomDimensions[] | null
  cutAmount: number
  partsCompleted: number
  cutPieces: number
  materialUsedSqmm: number
  scrapSqmm: number
  fabScore: number | null
  cost: Money | null
  stockLabel: string | null
  pdfUrl: string | null
  source: CutHistorySource
  layoutJson: CutHistoryLayoutBlob | null
  cutDate: Date
  selections: CutHistorySelection[]
  createdAt: Date
  createdBy: ProfileId | null
  updatedAt: Date
  updatedBy: ProfileId | null
  deletedAt: Date | null
}

export interface CutHistorySnapshot {
  id: string
  tenantId: string
  userId: string | null
  materialTypeId: string
  partId: string | null
  rollId: string | null
  cutLengthMm: number
  cutWidthMm: number
  cutThicknessMm: number | null
  partCustomWidthMm: number | null
  partCustomHeightMm: number | null
  partCustomDimensions: PartCustomDimensions[] | null
  cutAmount: number
  partsCompleted: number
  cutPieces: number
  materialUsedSqmm: number
  scrapSqmm: number
  fabScore: number | null
  cost: MoneySnapshot | null
  stockLabel: string | null
  pdfUrl: string | null
  source: CutHistorySource
  layoutJson: CutHistoryLayoutBlob | null
  cutDate: string
  selections: CutHistorySelectionSnapshot[]
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
  deletedAt: string | null
}

// ─── Entity ────────────────────────────────────────────────────────────────

/**
 * Job-level cut history. One row per cut job, capturing the engine's
 * output (parts_completed, fab_score, material_used_sqmm, scrap_sqmm),
 * a price snapshot at cut time, and — for manual cuts — the canvas
 * `layout_json` blob so the Free-roam canvas can re-hydrate.
 *
 * **Append-only.** Apart from `softDelete`, NO field is mutable after
 * `create()`. Engine output is final; if it was wrong, soft-delete and
 * re-record. Same pattern as `PriceHistory`.
 *
 * **Selections** are a value-object collection (`ReadonlyArray<CutHistorySelection>`)
 * owned by this entity. They're set at `create()` and never modified
 * afterward — the repository deletes-and-reinserts the whole collection
 * on save (which is rare, since the parent is immutable).
 *
 * **`layout_json` and `part_custom_dimensions`** are opaque at this
 * layer — the strongly-typed shapes live in the infrastructure layer
 * because the JSONB is owned by the cutting-engine UI surface, not the
 * domain.
 *
 * **`source`** discriminates between the two cutting-engine paths:
 *   • `auto`   — Rust pack-cli computed the layout (Auto-nest tab)
 *   • `manual` — Operator authored the layout on the Free-roam canvas
 *
 * **Cross-aggregate refs:** `materialTypeId`, `partId` (free-form),
 * `rollId`, `userId`. Loaded by separate repositories.
 *
 * **Invariant:** `partsCompleted <= cutAmount` (mirrors DB CHECK).
 *
 * Source: cut_history table.
 */
export class CutHistory {
  #id: CutHistoryId
  #tenantId: TenantId
  #userId: ProfileId | null
  #materialTypeId: MaterialTypeId
  #partId: string | null
  #rollId: RollId | null
  #cutLengthMm: number
  #cutWidthMm: number
  #cutThicknessMm: number | null
  #partCustomWidthMm: number | null
  #partCustomHeightMm: number | null
  #partCustomDimensions: PartCustomDimensions[] | null
  #cutAmount: number
  #partsCompleted: number
  #cutPieces: number
  #materialUsedSqmm: number
  #scrapSqmm: number
  #fabScore: number | null
  #cost: Money | null
  #stockLabel: string | null
  #pdfUrl: string | null
  #source: CutHistorySource
  #layoutJson: CutHistoryLayoutBlob | null
  #cutDate: Date
  #selections: CutHistorySelection[]
  #createdAt: Date
  #createdBy: ProfileId | null
  #updatedAt: Date
  #updatedBy: ProfileId | null
  #deletedAt: Date | null

  private constructor(props: ReconstituteCutHistoryProps) {
    this.#id = props.id
    this.#tenantId = props.tenantId
    this.#userId = props.userId
    this.#materialTypeId = props.materialTypeId
    this.#partId = props.partId
    this.#rollId = props.rollId
    this.#cutLengthMm = props.cutLengthMm
    this.#cutWidthMm = props.cutWidthMm
    this.#cutThicknessMm = props.cutThicknessMm
    this.#partCustomWidthMm = props.partCustomWidthMm
    this.#partCustomHeightMm = props.partCustomHeightMm
    this.#partCustomDimensions = props.partCustomDimensions
    this.#cutAmount = props.cutAmount
    this.#partsCompleted = props.partsCompleted
    this.#cutPieces = props.cutPieces
    this.#materialUsedSqmm = props.materialUsedSqmm
    this.#scrapSqmm = props.scrapSqmm
    this.#fabScore = props.fabScore
    this.#cost = props.cost
    this.#stockLabel = props.stockLabel
    this.#pdfUrl = props.pdfUrl
    this.#source = props.source
    this.#layoutJson = props.layoutJson
    this.#cutDate = props.cutDate
    this.#selections = [...props.selections]
    this.#createdAt = props.createdAt
    this.#createdBy = props.createdBy
    this.#updatedAt = props.updatedAt
    this.#updatedBy = props.updatedBy
    this.#deletedAt = props.deletedAt
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static create(
    props: CreateCutHistoryProps,
    now: Date = new Date(),
  ): CutHistory {
    CutHistory.#assertPositiveInteger(props.cutLengthMm, "cutLengthMm")
    CutHistory.#assertPositiveInteger(props.cutWidthMm, "cutWidthMm")
    if (
      props.cutThicknessMm !== null &&
      props.cutThicknessMm !== undefined
    ) {
      CutHistory.#assertPositiveFinite(props.cutThicknessMm, "cutThicknessMm")
    }
    if (
      props.partCustomWidthMm !== null &&
      props.partCustomWidthMm !== undefined
    ) {
      CutHistory.#assertPositiveInteger(
        props.partCustomWidthMm,
        "partCustomWidthMm",
      )
    }
    if (
      props.partCustomHeightMm !== null &&
      props.partCustomHeightMm !== undefined
    ) {
      CutHistory.#assertPositiveInteger(
        props.partCustomHeightMm,
        "partCustomHeightMm",
      )
    }

    const cutAmount = CutHistory.#normalizePositiveInteger(
      props.cutAmount ?? 1,
      "cutAmount",
    )
    const partsCompleted = CutHistory.#normalizeNonNegativeInteger(
      props.partsCompleted ?? 0,
      "partsCompleted",
    )
    if (partsCompleted > cutAmount) {
      throw new InvalidEntityError(
        "CutHistory",
        "partsCompleted cannot exceed cutAmount",
      )
    }
    const cutPieces = CutHistory.#normalizeNonNegativeInteger(
      props.cutPieces ?? 0,
      "cutPieces",
    )
    const materialUsedSqmm = CutHistory.#normalizeNonNegativeInteger(
      props.materialUsedSqmm ?? 0,
      "materialUsedSqmm",
    )
    const scrapSqmm = CutHistory.#normalizeNonNegativeInteger(
      props.scrapSqmm ?? 0,
      "scrapSqmm",
    )
    const fabScore = CutHistory.#normalizeFabScore(props.fabScore ?? null)
    if (props.cost) {
      CutHistory.#assertCostNonNegative(props.cost)
    }

    const stockLabel = trimOptional(
      props.stockLabel,
      "stockLabel",
      STOCK_LABEL_MAX,
      "CutHistory",
    )
    const pdfUrl = trimOptional(
      props.pdfUrl,
      "pdfUrl",
      PDF_URL_MAX,
      "CutHistory",
    )

    const source = props.source ?? "auto"
    if (!CUT_HISTORY_SOURCES.includes(source)) {
      throw new InvalidEntityError(
        "CutHistory",
        `unsupported source: ${source}`,
      )
    }

    const selections = CutHistory.#buildSelections(props.selections ?? [])

    return new CutHistory({
      id: props.id,
      tenantId: props.tenantId,
      userId: props.userId ?? null,
      materialTypeId: props.materialTypeId,
      partId: props.partId ?? null,
      rollId: props.rollId ?? null,
      cutLengthMm: props.cutLengthMm,
      cutWidthMm: props.cutWidthMm,
      cutThicknessMm: props.cutThicknessMm ?? null,
      partCustomWidthMm: props.partCustomWidthMm ?? null,
      partCustomHeightMm: props.partCustomHeightMm ?? null,
      partCustomDimensions: props.partCustomDimensions ?? null,
      cutAmount,
      partsCompleted,
      cutPieces,
      materialUsedSqmm,
      scrapSqmm,
      fabScore,
      cost: props.cost ?? null,
      stockLabel,
      pdfUrl,
      source,
      layoutJson: props.layoutJson ?? null,
      cutDate: props.cutDate ?? now,
      selections,
      createdAt: now,
      createdBy: props.createdBy ?? null,
      updatedAt: now,
      updatedBy: null,
      deletedAt: null,
    })
  }

  static reconstitute(props: ReconstituteCutHistoryProps): CutHistory {
    return new CutHistory(props)
  }

  static fromJSON(s: CutHistorySnapshot): CutHistory {
    return CutHistory.reconstitute({
      id: CutHistoryId.fromPersistence(s.id),
      tenantId: TenantId.fromPersistence(s.tenantId),
      userId: s.userId ? ProfileId.fromPersistence(s.userId) : null,
      materialTypeId: MaterialTypeId.fromPersistence(s.materialTypeId),
      partId: s.partId,
      rollId: s.rollId ? RollId.fromPersistence(s.rollId) : null,
      cutLengthMm: s.cutLengthMm,
      cutWidthMm: s.cutWidthMm,
      cutThicknessMm: s.cutThicknessMm,
      partCustomWidthMm: s.partCustomWidthMm,
      partCustomHeightMm: s.partCustomHeightMm,
      partCustomDimensions: s.partCustomDimensions,
      cutAmount: s.cutAmount,
      partsCompleted: s.partsCompleted,
      cutPieces: s.cutPieces,
      materialUsedSqmm: s.materialUsedSqmm,
      scrapSqmm: s.scrapSqmm,
      fabScore: s.fabScore,
      cost: s.cost ? Money.fromSnapshot(s.cost) : null,
      stockLabel: s.stockLabel,
      pdfUrl: s.pdfUrl,
      source: s.source,
      layoutJson: s.layoutJson,
      cutDate: new Date(s.cutDate),
      selections: s.selections.map(CutHistorySelection.fromSnapshot),
      createdAt: new Date(s.createdAt),
      createdBy: s.createdBy ? ProfileId.fromPersistence(s.createdBy) : null,
      updatedAt: new Date(s.updatedAt),
      updatedBy: s.updatedBy ? ProfileId.fromPersistence(s.updatedBy) : null,
      deletedAt: s.deletedAt ? new Date(s.deletedAt) : null,
    })
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get id(): CutHistoryId { return this.#id }
  get tenantId(): TenantId { return this.#tenantId }
  get userId(): ProfileId | null { return this.#userId }
  get materialTypeId(): MaterialTypeId { return this.#materialTypeId }
  get partId(): string | null { return this.#partId }
  get rollId(): RollId | null { return this.#rollId }
  get cutLengthMm(): number { return this.#cutLengthMm }
  get cutWidthMm(): number { return this.#cutWidthMm }
  get cutThicknessMm(): number | null { return this.#cutThicknessMm }
  get partCustomWidthMm(): number | null { return this.#partCustomWidthMm }
  get partCustomHeightMm(): number | null { return this.#partCustomHeightMm }
  get partCustomDimensions(): PartCustomDimensions[] | null {
    return this.#partCustomDimensions
  }
  get cutAmount(): number { return this.#cutAmount }
  get partsCompleted(): number { return this.#partsCompleted }
  get cutPieces(): number { return this.#cutPieces }
  get materialUsedSqmm(): number { return this.#materialUsedSqmm }
  get scrapSqmm(): number { return this.#scrapSqmm }
  get fabScore(): number | null { return this.#fabScore }
  get cost(): Money | null { return this.#cost }
  get stockLabel(): string | null { return this.#stockLabel }
  get pdfUrl(): string | null { return this.#pdfUrl }
  get source(): CutHistorySource { return this.#source }
  get layoutJson(): CutHistoryLayoutBlob | null { return this.#layoutJson }
  get cutDate(): Date { return this.#cutDate }
  /** Defensive copy — selections are owned by this entity. */
  get selections(): ReadonlyArray<CutHistorySelection> {
    return [...this.#selections]
  }
  get createdAt(): Date { return this.#createdAt }
  get createdBy(): ProfileId | null { return this.#createdBy }
  get updatedAt(): Date { return this.#updatedAt }
  get updatedBy(): ProfileId | null { return this.#updatedBy }
  get deletedAt(): Date | null { return this.#deletedAt }

  // ─── State queries ───────────────────────────────────────────────────────

  get isDeleted(): boolean {
    return this.#deletedAt !== null
  }

  get isAuto(): boolean {
    return this.#source === "auto"
  }

  get isManual(): boolean {
    return this.#source === "manual"
  }

  // ─── State transitions ───────────────────────────────────────────────────

  /**
   * Admin-only soft delete. The only mutation on this entity. Idempotent.
   * Existing references (e.g., rolls.source_cut_history_id) keep their
   * link — the row stays in the table for historical reads.
   */
  softDelete(updatedBy: ProfileId, now: Date = new Date()): void {
    if (this.#deletedAt !== null) return
    this.#deletedAt = now
    this.#touchAudit(updatedBy, now)
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  static #assertPositiveInteger(value: number, field: string): void {
    if (!Number.isInteger(value) || value <= 0) {
      throw new InvalidEntityError(
        "CutHistory",
        `${field} must be a positive integer`,
      )
    }
  }

  static #assertPositiveFinite(value: number, field: string): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new InvalidEntityError(
        "CutHistory",
        `${field} must be greater than zero`,
      )
    }
  }

  static #normalizePositiveInteger(value: number, field: string): number {
    if (!Number.isInteger(value) || value <= 0) {
      throw new InvalidEntityError(
        "CutHistory",
        `${field} must be a positive integer`,
      )
    }
    return value
  }

  static #normalizeNonNegativeInteger(value: number, field: string): number {
    if (!Number.isInteger(value)) {
      throw new InvalidEntityError(
        "CutHistory",
        `${field} must be an integer`,
      )
    }
    if (value < 0) {
      throw new InvalidEntityError("CutHistory", `${field} must be >= 0`)
    }
    return value
  }

  static #normalizeFabScore(value: number | null): number | null {
    if (value === null) return null
    if (!Number.isFinite(value)) {
      throw new InvalidEntityError(
        "CutHistory",
        "fabScore must be a finite number",
      )
    }
    if (value < 0 || value > 1) {
      throw new InvalidEntityError(
        "CutHistory",
        "fabScore must be between 0 and 1",
      )
    }
    return value
  }

  static #assertCostNonNegative(value: Money): void {
    if (value.cents < 0) {
      throw new InvalidEntityError("CutHistory", "cost must be >= 0")
    }
  }

  /**
   * Build the selections collection: validate each one, ensure indices
   * are unique, and store sorted by index for stable iteration order.
   */
  static #buildSelections(
    rawSelections: CreateCutHistorySelectionProps[],
  ): CutHistorySelection[] {
    const seenIndices = new Set<number>()
    const selections = rawSelections.map((raw) => {
      const sel = CutHistorySelection.create(raw)
      if (seenIndices.has(sel.selectionIndex)) {
        throw new InvalidEntityError(
          "CutHistory",
          `duplicate selectionIndex ${sel.selectionIndex} in selections`,
        )
      }
      seenIndices.add(sel.selectionIndex)
      return sel
    })
    selections.sort((a, b) => a.selectionIndex - b.selectionIndex)
    return selections
  }

  #touchAudit(updatedBy: ProfileId, now: Date): void {
    this.#updatedAt = now
    this.#updatedBy = updatedBy
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): CutHistorySnapshot {
    return {
      id: this.#id.value,
      tenantId: this.#tenantId.value,
      userId: this.#userId?.value ?? null,
      materialTypeId: this.#materialTypeId.value,
      partId: this.#partId,
      rollId: this.#rollId?.value ?? null,
      cutLengthMm: this.#cutLengthMm,
      cutWidthMm: this.#cutWidthMm,
      cutThicknessMm: this.#cutThicknessMm,
      partCustomWidthMm: this.#partCustomWidthMm,
      partCustomHeightMm: this.#partCustomHeightMm,
      partCustomDimensions: this.#partCustomDimensions,
      cutAmount: this.#cutAmount,
      partsCompleted: this.#partsCompleted,
      cutPieces: this.#cutPieces,
      materialUsedSqmm: this.#materialUsedSqmm,
      scrapSqmm: this.#scrapSqmm,
      fabScore: this.#fabScore,
      cost: this.#cost?.toJSON() ?? null,
      stockLabel: this.#stockLabel,
      pdfUrl: this.#pdfUrl,
      source: this.#source,
      layoutJson: this.#layoutJson,
      cutDate: this.#cutDate.toISOString(),
      selections: this.#selections.map((s) => s.toJSON()),
      createdAt: this.#createdAt.toISOString(),
      createdBy: this.#createdBy?.value ?? null,
      updatedAt: this.#updatedAt.toISOString(),
      updatedBy: this.#updatedBy?.value ?? null,
      deletedAt: this.#deletedAt?.toISOString() ?? null,
    }
  }
}
