import { Cut } from "@/src/entities/cut"
import { CutId, ProfileId, RollId, TenantId } from "@/src/entities/value-objects/id"

/**
 * Persistence shape for the `cuts` table. Local row type — mirrors the
 * columns defined in
 * `supabase/migrations/20260421000003_schema_operations.sql`.
 *
 * Engine-produced fields (`waste_sqmm`, `waste_percentage`,
 * `total_sqmm_used`) are nullable in the DB and set at INSERT time by
 * the nesting engine output; the entity treats them as immutable
 * post-`create()`.
 */
export interface CutRow {
  id: string
  tenant_id: string
  roll_id: string | null
  cut_width_mm: number
  cut_length_mm: number
  quantity: number
  waste_sqmm: number | null
  waste_percentage: number | null
  total_sqmm_used: number | null
  job_reference: string | null
  cut_by: string | null
  notes: string | null
  created_at: string
  created_by: string | null
  updated_at: string
  updated_by: string | null
  deleted_at: string | null
}

export interface CutInsertRow {
  id: string
  tenant_id: string
  roll_id: string | null
  cut_width_mm: number
  cut_length_mm: number
  quantity: number
  waste_sqmm: number | null
  waste_percentage: number | null
  total_sqmm_used: number | null
  job_reference: string | null
  cut_by: string | null
  notes: string | null
  created_by: string | null
}

export type CutUpdateRow = Partial<
  Pick<
    CutRow,
    "quantity" | "job_reference" | "cut_by" | "notes" | "updated_at" | "updated_by" | "deleted_at"
  >
>

export function rowToCut(row: CutRow): Cut {
  return Cut.reconstitute({
    id: CutId.fromPersistence(row.id),
    tenantId: TenantId.fromPersistence(row.tenant_id),
    rollId: row.roll_id ? RollId.fromPersistence(row.roll_id) : null,
    cutWidthMm: row.cut_width_mm,
    cutLengthMm: row.cut_length_mm,
    quantity: row.quantity,
    wasteSqmm: row.waste_sqmm,
    wastePercentage: row.waste_percentage,
    totalSqmmUsed: row.total_sqmm_used,
    jobReference: row.job_reference,
    cutBy: row.cut_by ? ProfileId.fromPersistence(row.cut_by) : null,
    notes: row.notes,
    createdAt: new Date(row.created_at),
    createdBy: row.created_by ? ProfileId.fromPersistence(row.created_by) : null,
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by ? ProfileId.fromPersistence(row.updated_by) : null,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  })
}

export function cutToInsertRow(cut: Cut): CutInsertRow {
  return {
    id: cut.id.value,
    tenant_id: cut.tenantId.value,
    roll_id: cut.rollId?.value ?? null,
    cut_width_mm: cut.cutWidthMm,
    cut_length_mm: cut.cutLengthMm,
    quantity: cut.quantity,
    waste_sqmm: cut.wasteSqmm,
    waste_percentage: cut.wastePercentage,
    total_sqmm_used: cut.totalSqmmUsed,
    job_reference: cut.jobReference,
    cut_by: cut.cutBy?.value ?? null,
    notes: cut.notes,
    created_by: cut.createdBy?.value ?? null,
  }
}

export function cutToUpdateRow(cut: Cut): CutUpdateRow {
  return {
    quantity: cut.quantity,
    job_reference: cut.jobReference,
    cut_by: cut.cutBy?.value ?? null,
    notes: cut.notes,
    updated_at: cut.updatedAt.toISOString(),
    updated_by: cut.updatedBy?.value ?? null,
    deleted_at: cut.deletedAt?.toISOString() ?? null,
  }
}
