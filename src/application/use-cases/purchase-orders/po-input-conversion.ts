import type { PurchaseOrderItem } from "@/src/entities/purchase-order-item"
import type { CreatePurchaseOrderItemProps } from "@/src/entities/purchase-order-item"
import type { CreateRollProps } from "@/src/entities/roll"
import type { Currency } from "@/src/entities/value-objects/currency"
import {
  MaterialTypeId,
  type ProfileId,
  type PurchaseOrderItemId,
  type RollId,
  type SupplierId,
  type TenantId,
} from "@/src/entities/value-objects/id"
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

// ─── Roll input (receive-PO flow) ──────────────────────────────────────────

/**
 * Default roll dimensions for receive-flow fallbacks. Mirror the
 * pre-DDD legacy defaults from `legacyPurchaseOrderService.receivePurchaseOrder`:
 *   width  = 60"     → 1524 mm
 *   thick  = 0.125"  → 3.175 mm
 * Entity invariants: `widthMm` is a positive integer, `thicknessMm` is
 * positive finite. 1524 is an integer; 3.175 is a finite float — both fine.
 */
export const DEFAULT_ROLL_WIDTH_MM = 1524
export const DEFAULT_ROLL_THICKNESS_MM = 3.175

/**
 * Form-shape for the receive-flow's per-item roll-creation payload.
 * Mirrors `rollDataSchema` in `app/actions/purchase-orders.ts` — legacy
 * column names, imperial units. Translated to entity `CreateRollProps`
 * via `buildCreateRollProps`.
 */
export interface RollDataInput {
  width?: number
  length?: number
  thickness?: number
  color?: string
  location?: string
  cost_per_sqft?: number
  notes?: string
  date_received?: string
}

/**
 * Metric snapshot of the operator's roll-creation intent. Persisted to
 * `po_item_receipts` (typed columns, not jsonb — schema-stable for the
 * 7c-2 admin reconcile replay path). Every field is independently
 * nullable; NULL means "operator didn't supply; the admin replay
 * applies the same fallback chain `buildCreateRollProps` would have."
 *
 * Currency is intentionally omitted — there's no per-roll currency
 * override in the live form; the apply-time fallback resolves to
 * `poItem.unitCost.currency`. If a future field surfaces per-roll
 * currency choice, add it here AND extend the schema.
 */
export interface RollIntent {
  widthMm: number | null
  lengthMm: number | null
  thicknessMm: number | null
  color: string | null
  location: string | null
  costPerSqmCents: number | null
  notes: string | null
}

/**
 * Maps the operator's `rollData` payload (imperial / legacy column
 * names) to a metric `RollIntent` snapshot for the receipts row.
 * Each field reflects EXACTLY what the operator provided — no
 * fallback chain is applied here. The fallback to PO-item defaults
 * happens at apply time, in `buildCreateRollProps`. Keeping
 * `RollIntent` free of fallbacks means the admin replay (7c-2) sees
 * the same "what did the operator type?" view that the live path saw.
 *
 * `lengthMm` derives from the operator's `length` only — there is NO
 * fallback to `quantityReceivedSqft` here. That fallback is a live-
 * path concern (the apply-time helper reaches for the receipt's
 * `quantity_received_sqm` for replay length if `lengthMm IS NULL`).
 */
export function buildRollIntent(rollData: RollDataInput): RollIntent {
  return {
    widthMm: rollData.width != null ? Math.round(inchesToMm(rollData.width)) : null,
    lengthMm: rollData.length != null ? Math.round(inchesToMm(rollData.length)) : null,
    thicknessMm: rollData.thickness != null ? inchesToMm(rollData.thickness) : null,
    color: rollData.color ?? null,
    location: rollData.location ?? null,
    costPerSqmCents:
      rollData.cost_per_sqft != null
        ? Math.round(rollData.cost_per_sqft * SQFT_PER_SQM * 100)
        : null,
    notes: rollData.notes ?? null,
  }
}

export interface BuildCreateRollPropsArgs {
  /** Fresh UUID for the roll; caller generates so the helper stays pure. */
  id: RollId
  tenantId: TenantId
  supplierId: SupplierId
  poItem: PurchaseOrderItem
  /**
   * PO-item row id (the table's primary key) so the new roll can be
   * linked back to the receipt source. Powers the
   * `po_receipts_pending_roll_creation` reconciliation view (step 7b).
   * Distinct from `poItem.lineNumber` — the entity's logical identity
   * — because the FK column on `rolls` references row id.
   */
  purchaseOrderItemId: PurchaseOrderItemId
  rollData: RollDataInput
  /** Fallback length-in-inches when `rollData.length` is missing — mirrors legacy parity. */
  quantityReceivedSqft: number
  actor: ProfileId
  poNumber: string
  /** Defaults to `poItem.unitCost.currency`. */
  currency?: Currency
}

/**
 * Imperial → metric conversion for a roll's cost basis.
 *
 *   cost_per_sqft (dollars) → cost_per_sqm (cents)
 *   cents/sqm = cost_per_sqft × SQFT_PER_SQM × 100, rounded
 *
 * The Roll aggregate stores `cost` as `Money` over a cents-per-sqm
 * column (`rolls.cost_per_sqm_cents`); the form sends imperial.
 */
export function costPerSqftToCostPerSqmMoney(costPerSqft: number, currency: Currency): Money {
  return Money.fromCents(Math.round(costPerSqft * SQFT_PER_SQM * 100), currency)
}

/**
 * Maps the receive-flow's per-item `rollData` (imperial / legacy column
 * names) onto the entity-layer `CreateRollProps`. Fallback chain matches
 * the pre-DDD legacy behavior so receive-flow outputs stay equivalent:
 *
 *   widthMm     = rollData.width  → poItem.widthMm     → DEFAULT_ROLL_WIDTH_MM
 *   lengthMm    = rollData.length → inchesToMm(quantityReceivedSqft)
 *   thicknessMm = rollData.thickness → poItem.thicknessMm → DEFAULT_ROLL_THICKNESS_MM
 *   cost        = rollData.cost_per_sqft → poItem.unitCost
 *   color       = rollData.color    → poItem.color → null
 *   location    = rollData.location → "Receiving"
 *   notes       = rollData.notes    → `Received from PO ${poNumber}`
 *
 * `lengthMm` from `quantityReceivedSqft` is a numerically odd fallback
 * (sqft → mm conflates area with length), but it mirrors the legacy
 * code exactly for behavior parity. A future refactor can introduce an
 * explicit length-in-inches field on the receive form.
 */
export function buildCreateRollProps(args: BuildCreateRollPropsArgs): CreateRollProps {
  const currency = args.currency ?? args.poItem.unitCost.currency
  const widthMm =
    args.rollData.width != null
      ? Math.round(inchesToMm(args.rollData.width))
      : (args.poItem.widthMm ?? DEFAULT_ROLL_WIDTH_MM)
  const lengthMm =
    args.rollData.length != null
      ? Math.round(inchesToMm(args.rollData.length))
      : Math.round(inchesToMm(args.quantityReceivedSqft))
  const thicknessMm =
    args.rollData.thickness != null
      ? inchesToMm(args.rollData.thickness)
      : (args.poItem.thicknessMm ?? DEFAULT_ROLL_THICKNESS_MM)
  const cost =
    args.rollData.cost_per_sqft != null
      ? costPerSqftToCostPerSqmMoney(args.rollData.cost_per_sqft, currency)
      : args.poItem.unitCost
  const dateReceived = args.rollData.date_received
    ? new Date(args.rollData.date_received)
    : new Date()

  return {
    id: args.id,
    tenantId: args.tenantId,
    materialTypeId: args.poItem.materialTypeId,
    supplierId: args.supplierId,
    sourceType: "received",
    parentRollId: null,
    sourceCutHistoryId: null,
    purchaseOrderItemId: args.purchaseOrderItemId,
    widthMm,
    lengthMm,
    thicknessMm,
    color: args.rollData.color ?? args.poItem.color ?? null,
    location: args.rollData.location ?? "Receiving",
    dateReceived,
    cost,
    notes: args.rollData.notes ?? `Received from PO ${args.poNumber}`,
    createdBy: args.actor,
  }
}
