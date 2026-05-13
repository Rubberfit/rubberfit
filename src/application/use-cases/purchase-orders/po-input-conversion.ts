import type { CreatePurchaseOrderItemProps } from "@/src/entities/purchase-order-item"
import type { Currency } from "@/src/entities/value-objects/currency"
import { MaterialTypeId } from "@/src/entities/value-objects/id"
import { Money } from "@/src/entities/value-objects/money"

/**
 * Unit conversion helpers + an input-item → entity-item mapper. Used
 * by the PO create + update use-cases to translate the UI's
 * sqft / inches / float-dollar inputs into the entity's
 * sqm / mm / Money form.
 *
 * Keep this file pure (no DI, no DB, no logging) so unit tests can
 * exercise it in isolation. If a future input shape needs a different
 * conversion (e.g., metric-first forms), add a sibling mapper rather
 * than overloading this one.
 */

export const SQFT_PER_SQM = 10.7639104167
export const MM_PER_INCH = 25.4

export function sqftToSqm(sqft: number): number {
  return sqft / SQFT_PER_SQM
}

export function inchesToMm(inches: number): number {
  return inches * MM_PER_INCH
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100)
}

export function dollarsToMoney(dollars: number, currency: Currency): Money {
  return Money.fromCents(dollarsToCents(dollars), currency)
}

/**
 * One line as the action layer hands it to the use-case. Matches the
 * Zod-parsed shape from `app/actions/purchase-orders.ts`.
 */
export interface PoLineInput {
  materialTypeId: string
  description?: string | null
  quantitySqft: number
  unitCost: number
  width?: number | null
  thickness?: number | null
  color?: string | null
  notes?: string | null
}

/**
 * Maps the input items to the entity's `CreatePurchaseOrderItemProps`.
 *
 * Line totals are computed from the LEGACY dollar amounts
 * (`quantitySqft × unitCost`) and passed explicitly, so the displayed
 * total stays exact at the cent. `unitCost` is rounded to per-sqm
 * cents — the entity won't re-derive lineTotal because we pass it,
 * so per-sqm rounding error doesn't affect the displayed total.
 *
 * `widthMm` is rounded to integers (entity invariant); `thicknessMm`
 * stays a float (entity allows positive-finite).
 */
export function mapItemsToEntityProps(
  items: PoLineInput[],
  currency: Currency
): CreatePurchaseOrderItemProps[] {
  return items.map((item, index) => {
    const quantitySqm = sqftToSqm(item.quantitySqft)
    const lineTotalCents = dollarsToCents(item.quantitySqft * item.unitCost)
    const unitCostCentsPerSqm = Math.round(item.unitCost * SQFT_PER_SQM * 100)

    return {
      lineNumber: index + 1,
      materialTypeId: MaterialTypeId.fromPersistence(item.materialTypeId),
      description: item.description ?? null,
      widthMm: item.width != null ? Math.round(inchesToMm(item.width)) : null,
      lengthMm: null,
      thicknessMm: item.thickness != null ? inchesToMm(item.thickness) : null,
      color: item.color ?? null,
      quantitySqm,
      unitCost: Money.fromCents(unitCostCentsPerSqm, currency),
      lineTotal: Money.fromCents(lineTotalCents, currency),
      notes: item.notes ?? null,
    }
  })
}
