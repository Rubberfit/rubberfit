import { Roll, type BarcodeFormat, type RollStatus } from "@/src/entities/roll"
import { Currency } from "@/src/entities/value-objects/currency"
import {
  CutHistoryId,
  MaterialTypeId,
  ProfileId,
  RollId,
  SupplierId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Money } from "@/src/entities/value-objects/money"

/**
 * Persistence shape for the `rolls` table. Local row type — the stale
 * `Roll` interface in `@/src/infrastructure/models/supabase` references
 * pre-redesign columns (`material_type` text, `cost_per_sqft`,
 * `supplier`, `is_offcut`) that no longer exist in the live schema.
 *
 * Mirrors the columns defined in
 * `supabase/migrations/20260421000002_schema_inventory.sql`.
 */
export interface RollRow {
  id: string
  tenant_id: string
  material_type_id: string
  supplier_id: string | null
  source_type: "received" | "offcut"
  parent_roll_id: string | null
  source_cut_history_id: string | null
  width_mm: number
  length_mm: number
  remaining_length_mm: number
  thickness_mm: number
  color: string | null
  location: string | null
  date_received: string
  cost_per_sqm_cents: number | null
  status: RollStatus
  notes: string | null
  qr_generated_at: string | null
  barcode_format: BarcodeFormat
  barcode_asset_path: string | null
  barcode_generated_at: string | null
  created_at: string
  created_by: string | null
  updated_at: string
  updated_by: string | null
  deleted_at: string | null
}

export interface RollInsertRow {
  id: string
  tenant_id: string
  material_type_id: string
  supplier_id: string | null
  source_type: "received" | "offcut"
  parent_roll_id: string | null
  source_cut_history_id: string | null
  width_mm: number
  length_mm: number
  remaining_length_mm: number
  thickness_mm: number
  color: string | null
  location: string | null
  date_received: string
  cost_per_sqm_cents: number | null
  status: RollStatus
  notes: string | null
  barcode_format: BarcodeFormat
  created_by: string | null
}

export type RollUpdateRow = Partial<
  Pick<
    RollRow,
    | "remaining_length_mm"
    | "status"
    | "location"
    | "notes"
    | "qr_generated_at"
    | "barcode_format"
    | "barcode_asset_path"
    | "barcode_generated_at"
    | "updated_at"
    | "updated_by"
    | "deleted_at"
  >
>

/**
 * `rolls.cost_per_sqm_cents` has no currency column — pricing assumes
 * tenant-level currency. Default USD on read, matching the
 * material-supplier mapper convention.
 */
const DEFAULT_CURRENCY = Currency.fromPersistence("USD")

/**
 * `rolls.date_received` is a `date` (no time component); Supabase
 * returns ISO `"YYYY-MM-DD"`. Wrap in `new Date(...)` which parses as
 * UTC midnight — round-trips cleanly through `.toISOString().slice(0, 10)`
 * on write.
 */
function rowDateToDate(value: string): Date {
  return new Date(value)
}

function dateToRowDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function rowToRoll(row: RollRow): Roll {
  return Roll.reconstitute({
    id: RollId.fromPersistence(row.id),
    tenantId: TenantId.fromPersistence(row.tenant_id),
    materialTypeId: MaterialTypeId.fromPersistence(row.material_type_id),
    supplierId: row.supplier_id ? SupplierId.fromPersistence(row.supplier_id) : null,
    sourceType: row.source_type,
    parentRollId: row.parent_roll_id ? RollId.fromPersistence(row.parent_roll_id) : null,
    sourceCutHistoryId: row.source_cut_history_id
      ? CutHistoryId.fromPersistence(row.source_cut_history_id)
      : null,
    widthMm: row.width_mm,
    lengthMm: row.length_mm,
    remainingLengthMm: row.remaining_length_mm,
    thicknessMm: row.thickness_mm,
    color: row.color,
    location: row.location,
    dateReceived: rowDateToDate(row.date_received),
    cost:
      row.cost_per_sqm_cents !== null
        ? Money.fromPersistence(row.cost_per_sqm_cents, DEFAULT_CURRENCY.value)
        : null,
    status: row.status,
    notes: row.notes,
    qrGeneratedAt: row.qr_generated_at ? new Date(row.qr_generated_at) : null,
    barcodeFormat: row.barcode_format,
    barcodeAssetPath: row.barcode_asset_path,
    barcodeGeneratedAt: row.barcode_generated_at ? new Date(row.barcode_generated_at) : null,
    createdAt: new Date(row.created_at),
    createdBy: row.created_by ? ProfileId.fromPersistence(row.created_by) : null,
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by ? ProfileId.fromPersistence(row.updated_by) : null,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  })
}

export function rollToInsertRow(roll: Roll): RollInsertRow {
  return {
    id: roll.id.value,
    tenant_id: roll.tenantId.value,
    material_type_id: roll.materialTypeId.value,
    supplier_id: roll.supplierId?.value ?? null,
    source_type: roll.sourceType,
    parent_roll_id: roll.parentRollId?.value ?? null,
    source_cut_history_id: roll.sourceCutHistoryId?.value ?? null,
    width_mm: roll.widthMm,
    length_mm: roll.lengthMm,
    remaining_length_mm: roll.remainingLengthMm,
    thickness_mm: roll.thicknessMm,
    color: roll.color,
    location: roll.location,
    date_received: dateToRowDate(roll.dateReceived),
    cost_per_sqm_cents: roll.cost?.cents ?? null,
    status: roll.status,
    notes: roll.notes,
    barcode_format: roll.barcodeFormat,
    created_by: roll.createdBy?.value ?? null,
  }
}

export function rollToUpdateRow(roll: Roll): RollUpdateRow {
  return {
    remaining_length_mm: roll.remainingLengthMm,
    status: roll.status,
    location: roll.location,
    notes: roll.notes,
    qr_generated_at: roll.qrGeneratedAt?.toISOString() ?? null,
    barcode_format: roll.barcodeFormat,
    barcode_asset_path: roll.barcodeAssetPath,
    barcode_generated_at: roll.barcodeGeneratedAt?.toISOString() ?? null,
    updated_at: roll.updatedAt.toISOString(),
    updated_by: roll.updatedBy?.value ?? null,
    deleted_at: roll.deletedAt?.toISOString() ?? null,
  }
}
