import type { Database } from "@/src/infrastructure/models/database.types"
import {
  Area,
  Length,
  Percentage,
  PricePerArea,
  type CreateCutHistory,
  type CutHistory,
  type PartCustomDimensions,
  type UpdateCutHistory,
} from "@/src/entities"

type CutHistoryRow = Database["public"]["Tables"]["cut_history"]["Row"]
type CutHistoryInsert = Database["public"]["Tables"]["cut_history"]["Insert"]
type CutHistoryUpdate = Database["public"]["Tables"]["cut_history"]["Update"]

export function mapRowToCutHistory(row: CutHistoryRow, currency: string): CutHistory {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    materialTypeId: row.material_type_id,
    partId: row.part_id,
    cutLength: Length.fromMm(row.cut_length_mm),
    cutWidth: Length.fromMm(row.cut_width_mm),
    cutThickness: row.cut_thickness_mm !== null ? Length.fromMm(row.cut_thickness_mm) : null,
    partCustomWidth:
      row.part_custom_width_mm !== null ? Length.fromMm(row.part_custom_width_mm) : null,
    partCustomHeight:
      row.part_custom_height_mm !== null ? Length.fromMm(row.part_custom_height_mm) : null,
    partCustomDimensions: row.part_custom_dimensions as PartCustomDimensions | null,
    cutAmount: row.cut_amount,
    partsCompleted: row.parts_completed,
    cutPieces: row.cut_pieces,
    materialUsed: Area.fromSqmm(row.material_used_sqmm),
    scrap: Area.fromSqmm(row.scrap_sqmm),
    fabScore: row.fab_score !== null ? Percentage.fromFraction(row.fab_score) : null,
    costPerArea:
      row.cost_per_sqm_cents !== null
        ? PricePerArea.fromCentsPerSqm(row.cost_per_sqm_cents, currency)
        : null,
    stockLabel: row.stock_label,
    pdfUrl: row.pdf_url,
    cutDate: row.cut_date,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    deletedAt: row.deleted_at,
  }
}

export function mapCreateCutHistoryToInsert(input: CreateCutHistory): CutHistoryInsert {
  return {
    tenant_id: input.tenantId,
    user_id: input.userId,
    material_type_id: input.materialTypeId,
    part_id: input.partId,
    cut_length_mm: input.cutLength.mm,
    cut_width_mm: input.cutWidth.mm,
    cut_thickness_mm: input.cutThickness?.mm ?? null,
    part_custom_width_mm: input.partCustomWidth?.mm ?? null,
    part_custom_height_mm: input.partCustomHeight?.mm ?? null,
    part_custom_dimensions: (input.partCustomDimensions as Database["public"]["Tables"]["cut_history"]["Insert"]["part_custom_dimensions"]) ?? null,
    cut_amount: input.cutAmount,
    parts_completed: input.partsCompleted,
    cut_pieces: input.cutPieces,
    material_used_sqmm: input.materialUsed.sqmm,
    scrap_sqmm: input.scrap.sqmm,
    fab_score: input.fabScore?.toFraction() ?? null,
    cost_per_sqm_cents: input.costPerArea?.centsPerSqm ?? null,
    stock_label: input.stockLabel,
    pdf_url: input.pdfUrl,
    cut_date: input.cutDate,
  }
}

export function mapUpdateCutHistoryToUpdate(patch: UpdateCutHistory): CutHistoryUpdate {
  const update: CutHistoryUpdate = {}
  if (patch.tenantId !== undefined) update.tenant_id = patch.tenantId
  if (patch.userId !== undefined) update.user_id = patch.userId
  if (patch.materialTypeId !== undefined) update.material_type_id = patch.materialTypeId
  if (patch.partId !== undefined) update.part_id = patch.partId
  if (patch.cutLength !== undefined) update.cut_length_mm = patch.cutLength.mm
  if (patch.cutWidth !== undefined) update.cut_width_mm = patch.cutWidth.mm
  if (patch.cutThickness !== undefined) update.cut_thickness_mm = patch.cutThickness?.mm ?? null
  if (patch.partCustomWidth !== undefined) update.part_custom_width_mm = patch.partCustomWidth?.mm ?? null
  if (patch.partCustomHeight !== undefined) update.part_custom_height_mm = patch.partCustomHeight?.mm ?? null
  if (patch.partCustomDimensions !== undefined) {
    update.part_custom_dimensions = (patch.partCustomDimensions as Database["public"]["Tables"]["cut_history"]["Update"]["part_custom_dimensions"]) ?? null
  }
  if (patch.cutAmount !== undefined) update.cut_amount = patch.cutAmount
  if (patch.partsCompleted !== undefined) update.parts_completed = patch.partsCompleted
  if (patch.cutPieces !== undefined) update.cut_pieces = patch.cutPieces
  if (patch.materialUsed !== undefined) update.material_used_sqmm = patch.materialUsed.sqmm
  if (patch.scrap !== undefined) update.scrap_sqmm = patch.scrap.sqmm
  if (patch.fabScore !== undefined) update.fab_score = patch.fabScore?.toFraction() ?? null
  if (patch.costPerArea !== undefined)
    update.cost_per_sqm_cents = patch.costPerArea?.centsPerSqm ?? null
  if (patch.stockLabel !== undefined) update.stock_label = patch.stockLabel
  if (patch.pdfUrl !== undefined) update.pdf_url = patch.pdfUrl
  if (patch.cutDate !== undefined) update.cut_date = patch.cutDate
  return update
}
