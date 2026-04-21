import type { Database } from "@/src/infrastructure/models/database.types"
import {
  Area,
  type CreateCut,
  type Cut,
  Length,
  Percentage,
} from "@/src/entities"

type CutRow = Database["public"]["Tables"]["cuts"]["Row"]
type CutInsert = Database["public"]["Tables"]["cuts"]["Insert"]

export function mapRowToCut(row: CutRow): Cut {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    rollId: row.roll_id,
    cutWidth: Length.fromMm(row.cut_width_mm),
    cutLength: Length.fromMm(row.cut_length_mm),
    quantity: row.quantity,
    waste: row.waste_sqmm !== null ? Area.fromSqmm(row.waste_sqmm) : null,
    wastePercentage:
      row.waste_percentage !== null ? Percentage.fromPercent(row.waste_percentage) : null,
    totalUsed: row.total_sqmm_used !== null ? Area.fromSqmm(row.total_sqmm_used) : null,
    jobReference: row.job_reference,
    cutBy: row.cut_by,
    notes: row.notes,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    deletedAt: row.deleted_at,
  }
}

export function mapCreateCutToInsert(input: CreateCut): CutInsert {
  return {
    tenant_id: input.tenantId,
    roll_id: input.rollId,
    cut_width_mm: input.cutWidth.mm,
    cut_length_mm: input.cutLength.mm,
    quantity: input.quantity,
    waste_sqmm: input.waste?.sqmm ?? null,
    waste_percentage: input.wastePercentage?.toPercent() ?? null,
    total_sqmm_used: input.totalUsed?.sqmm ?? null,
    job_reference: input.jobReference,
    cut_by: input.cutBy,
    notes: input.notes,
  }
}
