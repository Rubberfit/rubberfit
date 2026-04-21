import type { Database } from "@/src/infrastructure/models/database.types"
import {
  Length,
  PricePerArea,
  type Roll,
  type RollSourceType,
  type RollStatus,
} from "@/src/entities"

type RollRow = Database["public"]["Tables"]["rolls"]["Row"]
type RollInsert = Database["public"]["Tables"]["rolls"]["Insert"]

const ROLL_STATUSES: readonly RollStatus[] = ["active", "depleted", "reserved"]
const ROLL_SOURCE_TYPES: readonly RollSourceType[] = ["received", "offcut"]

function assertRollStatus(value: string): RollStatus {
  if ((ROLL_STATUSES as readonly string[]).includes(value)) {
    return value as RollStatus
  }
  throw new Error(`unexpected roll.status value: ${value}`)
}

function assertRollSourceType(value: string): RollSourceType {
  if ((ROLL_SOURCE_TYPES as readonly string[]).includes(value)) {
    return value as RollSourceType
  }
  throw new Error(`unexpected roll.source_type value: ${value}`)
}

/**
 * Map a Supabase rolls row into a `Roll` entity.
 *
 * Currency resolution is the caller's responsibility: if the row has a
 * supplier_id, the caller typically joins `suppliers.currency` and passes it
 * in; for offcuts (no supplier), currency comes from the parent roll or the
 * tenant default. Pass null when `cost_per_sqm_cents` is null — the resulting
 * `Roll.costPerArea` will be null regardless of `currency`.
 */
export function mapRowToRoll(row: RollRow, currency: string): Roll {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    materialTypeId: row.material_type_id,
    supplierId: row.supplier_id,
    sourceType: assertRollSourceType(row.source_type),
    parentRollId: row.parent_roll_id,
    sourceCutHistoryId: row.source_cut_history_id,
    width: Length.fromMm(row.width_mm),
    length: Length.fromMm(row.length_mm),
    remainingLength: Length.fromMm(row.remaining_length_mm),
    thickness: Length.fromMm(row.thickness_mm),
    color: row.color,
    location: row.location,
    dateReceived: row.date_received,
    costPerArea:
      row.cost_per_sqm_cents !== null
        ? PricePerArea.fromCentsPerSqm(row.cost_per_sqm_cents, currency)
        : null,
    status: assertRollStatus(row.status),
    notes: row.notes,
    qrGeneratedAt: row.qr_generated_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    deletedAt: row.deleted_at,
  }
}

/**
 * Map a `Roll` entity to a Supabase rolls Insert payload. Auto-generated
 * server-side fields (`id`, `created_at`, `updated_at`) are included if set on
 * the entity; omit/overwrite them at the call site if you want the DB to fill
 * them in. Returns type-assertable for use with .insert(), .upsert(), or
 * .update() — Update takes a superset.
 *
 * Currency is NOT written to the row — the rolls table has no currency
 * column; it inherits from supplier or tenant context. If the caller needs
 * to persist a specific currency, do it on the supplier/tenant side.
 */
export function mapRollToRow(roll: Roll): RollInsert {
  return {
    id: roll.id,
    tenant_id: roll.tenantId,
    material_type_id: roll.materialTypeId,
    supplier_id: roll.supplierId,
    source_type: roll.sourceType,
    parent_roll_id: roll.parentRollId,
    source_cut_history_id: roll.sourceCutHistoryId,
    width_mm: roll.width.mm,
    length_mm: roll.length.mm,
    remaining_length_mm: roll.remainingLength.mm,
    thickness_mm: roll.thickness.mm,
    color: roll.color,
    location: roll.location,
    date_received: roll.dateReceived,
    cost_per_sqm_cents: roll.costPerArea?.centsPerSqm ?? null,
    status: roll.status,
    notes: roll.notes,
    qr_generated_at: roll.qrGeneratedAt,
    created_at: roll.createdAt,
    created_by: roll.createdBy,
    updated_at: roll.updatedAt,
    updated_by: roll.updatedBy,
    deleted_at: roll.deletedAt,
  }
}
