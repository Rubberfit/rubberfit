import type { Roll } from "@/src/entities/roll"
import type { Roll as LegacyRoll } from "@/src/infrastructure/models/supabase"
import { SQFT_PER_SQM } from "@/src/application/use-cases/purchase-orders/po-input-conversion"

const MM_PER_INCH = 25.4

/**
 * Converts a `Roll` entity to the legacy `Roll` row shape consumed by
 * callers that haven't migrated off the pre-redesign type yet — most
 * notably `POReceiptResult.rollsCreated` on the receive-PO use-case
 * (the form-driver displays "X rolls created" and may inspect the list
 * for confirmation UI).
 *
 * Inverse unit conversions mirror the (forward) conversions in
 * `po-input-conversion.ts`:
 *   widthMm / lengthMm / thicknessMm  → inches (mm / 25.4)
 *   remainingLengthMm                 → inches (legacy `remaining_length`)
 *   Money cents-per-sqm               → cost_per_sqft dollars
 *     dollars/sqft = (cents/100) / SQFT_PER_SQM
 *
 * `material_type` (the human-readable name) is intentionally left
 * empty — the Roll entity doesn't carry the material-type name (only
 * the id), and no current consumer of `rollsCreated` reads this field.
 * If a downstream UI needs the name, resolve it via `IMaterialTypeService`
 * in the use-case and pass it in via a future overload.
 *
 * Same pattern as `purchaseOrderEntityToLegacy` in `po-entity-to-legacy.ts`.
 */
export function rollEntityToLegacy(roll: Roll): LegacyRoll {
  const costPerSqft = roll.cost !== null ? roll.cost.cents / 100 / SQFT_PER_SQM : undefined

  return {
    id: roll.id.value,
    user_id: roll.createdBy?.value ?? "",
    material_type_id: roll.materialTypeId.value,
    material_type: "",
    width: roll.widthMm / MM_PER_INCH,
    length: roll.lengthMm / MM_PER_INCH,
    thickness: roll.thicknessMm / MM_PER_INCH,
    color: roll.color ?? undefined,
    location: roll.location ?? undefined,
    date_received: roll.dateReceived.toISOString(),
    supplier: undefined,
    cost_per_sqft: costPerSqft,
    remaining_length: roll.remainingLengthMm / MM_PER_INCH,
    status: roll.status,
    notes: roll.notes ?? undefined,
    parent_roll_id: roll.parentRollId?.value ?? null,
    is_offcut: roll.sourceType === "offcut",
    part_number: undefined,
    created_at: roll.createdAt.toISOString(),
    updated_at: roll.updatedAt.toISOString(),
  }
}
