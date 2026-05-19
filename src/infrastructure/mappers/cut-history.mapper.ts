import {
  CutHistory,
  type CutHistoryLayoutBlob,
  type CutHistorySource,
  type PartCustomDimensions,
} from "@/src/entities/cut-history"
import {
  CutHistorySelection,
  type CutHistorySelectionSnapshot,
} from "@/src/entities/cut-history-selection"
import { Currency } from "@/src/entities/value-objects/currency"
import {
  CutHistoryId,
  MaterialTypeId,
  ProfileId,
  RollId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Money } from "@/src/entities/value-objects/money"

/**
 * Persistence shape for the `cut_history` table. Local row type —
 * mirrors the columns defined in
 * `supabase/migrations/20260421000003_schema_operations.sql`.
 *
 * Schema columns NOT modeled by the `CutHistory` entity (`kerf`,
 * `job_id`, `job_part_id`) are intentionally absent here. They are
 * written by the legacy `insertCutHistory` path (consumed by
 * `RecordCutUseCase`) and are not part of the entity's domain. The
 * entity-typed repo only round-trips entity-owned columns.
 */
export interface CutHistoryRow {
  id: string
  tenant_id: string
  user_id: string | null
  material_type_id: string
  part_id: string | null
  roll_id: string | null
  cut_length_mm: number
  cut_width_mm: number
  cut_thickness_mm: number | null
  part_custom_width_mm: number | null
  part_custom_height_mm: number | null
  part_custom_dimensions: PartCustomDimensions[] | null
  cut_amount: number
  parts_completed: number
  cut_pieces: number
  material_used_sqmm: number
  scrap_sqmm: number
  fab_score: number | null
  cost_per_sqm_cents: number | null
  stock_label: string | null
  pdf_url: string | null
  source: CutHistorySource
  layout_json: CutHistoryLayoutBlob | null
  cut_date: string
  created_at: string
  created_by: string | null
  updated_at: string
  updated_by: string | null
  deleted_at: string | null
}

export interface CutHistoryInsertRow {
  id: string
  tenant_id: string
  user_id: string | null
  material_type_id: string
  part_id: string | null
  roll_id: string | null
  cut_length_mm: number
  cut_width_mm: number
  cut_thickness_mm: number | null
  part_custom_width_mm: number | null
  part_custom_height_mm: number | null
  part_custom_dimensions: PartCustomDimensions[] | null
  cut_amount: number
  parts_completed: number
  cut_pieces: number
  material_used_sqmm: number
  scrap_sqmm: number
  fab_score: number | null
  cost_per_sqm_cents: number | null
  stock_label: string | null
  pdf_url: string | null
  source: CutHistorySource
  layout_json: CutHistoryLayoutBlob | null
  cut_date: string
  created_by: string | null
}

/**
 * Soft delete only. The entity is append-only apart from `softDelete`,
 * so the update row never touches the value columns — just the audit
 * stamps and the tombstone.
 */
export type CutHistoryUpdateRow = Partial<
  Pick<CutHistoryRow, "updated_at" | "updated_by" | "deleted_at">
>

export interface CutHistorySelectionRow {
  id: string
  tenant_id: string
  cut_history_id: string
  selection_index: number
  size_value: number | null
  size_text: string | null
  label: string | null
  created_at: string
  created_by: string | null
}

/**
 * Insert shape for `cut_history_selection`. `id` defaults to
 * `gen_random_uuid()` and is omitted at insert time — selections
 * have no public identity (the VO is keyed by
 * `(cut_history_id, selection_index)`).
 */
export interface CutHistorySelectionInsertRow {
  tenant_id: string
  cut_history_id: string
  selection_index: number
  size_value: number | null
  size_text: string | null
  label: string | null
}

/**
 * `cut_history.cost_per_sqm_cents` has no currency column — pricing
 * assumes tenant-level currency. Default USD on read, matching the
 * rolls / material-supplier mapper convention.
 */
const DEFAULT_CURRENCY = Currency.fromPersistence("USD")

export function rowToCutHistory(
  row: CutHistoryRow,
  selectionRows: CutHistorySelectionRow[]
): CutHistory {
  const selections = selectionRows
    .map(rowToSelection)
    .sort((a, b) => a.selectionIndex - b.selectionIndex)

  return CutHistory.reconstitute({
    id: CutHistoryId.fromPersistence(row.id),
    tenantId: TenantId.fromPersistence(row.tenant_id),
    userId: row.user_id ? ProfileId.fromPersistence(row.user_id) : null,
    materialTypeId: MaterialTypeId.fromPersistence(row.material_type_id),
    partId: row.part_id,
    rollId: row.roll_id ? RollId.fromPersistence(row.roll_id) : null,
    cutLengthMm: row.cut_length_mm,
    cutWidthMm: row.cut_width_mm,
    cutThicknessMm: row.cut_thickness_mm,
    partCustomWidthMm: row.part_custom_width_mm,
    partCustomHeightMm: row.part_custom_height_mm,
    partCustomDimensions: row.part_custom_dimensions,
    cutAmount: row.cut_amount,
    partsCompleted: row.parts_completed,
    cutPieces: row.cut_pieces,
    materialUsedSqmm: row.material_used_sqmm,
    scrapSqmm: row.scrap_sqmm,
    fabScore: row.fab_score,
    cost:
      row.cost_per_sqm_cents !== null
        ? Money.fromPersistence(row.cost_per_sqm_cents, DEFAULT_CURRENCY.value)
        : null,
    stockLabel: row.stock_label,
    pdfUrl: row.pdf_url,
    source: row.source,
    layoutJson: row.layout_json,
    cutDate: new Date(row.cut_date),
    selections,
    createdAt: new Date(row.created_at),
    createdBy: row.created_by ? ProfileId.fromPersistence(row.created_by) : null,
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by ? ProfileId.fromPersistence(row.updated_by) : null,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  })
}

export function cutHistoryToInsertRow(entity: CutHistory): CutHistoryInsertRow {
  return {
    id: entity.id.value,
    tenant_id: entity.tenantId.value,
    user_id: entity.userId?.value ?? null,
    material_type_id: entity.materialTypeId.value,
    part_id: entity.partId,
    roll_id: entity.rollId?.value ?? null,
    cut_length_mm: entity.cutLengthMm,
    cut_width_mm: entity.cutWidthMm,
    cut_thickness_mm: entity.cutThicknessMm,
    part_custom_width_mm: entity.partCustomWidthMm,
    part_custom_height_mm: entity.partCustomHeightMm,
    part_custom_dimensions: entity.partCustomDimensions,
    cut_amount: entity.cutAmount,
    parts_completed: entity.partsCompleted,
    cut_pieces: entity.cutPieces,
    material_used_sqmm: entity.materialUsedSqmm,
    scrap_sqmm: entity.scrapSqmm,
    fab_score: entity.fabScore,
    cost_per_sqm_cents: entity.cost?.cents ?? null,
    stock_label: entity.stockLabel,
    pdf_url: entity.pdfUrl,
    source: entity.source,
    layout_json: entity.layoutJson,
    cut_date: entity.cutDate.toISOString(),
    created_by: entity.createdBy?.value ?? null,
  }
}

export function cutHistoryToUpdateRow(entity: CutHistory): CutHistoryUpdateRow {
  return {
    updated_at: entity.updatedAt.toISOString(),
    updated_by: entity.updatedBy?.value ?? null,
    deleted_at: entity.deletedAt?.toISOString() ?? null,
  }
}

export function rowToSelection(row: CutHistorySelectionRow): CutHistorySelection {
  const snapshot: CutHistorySelectionSnapshot = {
    selectionIndex: row.selection_index,
    sizeValue: row.size_value,
    sizeText: row.size_text,
    label: row.label,
  }
  return CutHistorySelection.fromSnapshot(snapshot)
}

export function selectionToInsertRow(
  selection: CutHistorySelection,
  cutHistoryId: string,
  tenantId: string
): CutHistorySelectionInsertRow {
  return {
    tenant_id: tenantId,
    cut_history_id: cutHistoryId,
    selection_index: selection.selectionIndex,
    size_value: selection.sizeValue,
    size_text: selection.sizeText,
    label: selection.label,
  }
}
