import { describe, expect, it } from "vitest"

import {
  buildCreateRollProps,
  buildRollIntent,
  costPerSqftToCostPerSqmMoney,
  DEFAULT_ROLL_THICKNESS_MM,
  DEFAULT_ROLL_WIDTH_MM,
  dollarsToCents,
  dollarsToMoney,
  inchesToMm,
  mapItemsToEntityProps,
  sqftToSqm,
  type PoLineInput,
} from "@/src/application/use-cases/purchase-orders/po-input-conversion"
import { PurchaseOrderItem } from "@/src/entities/purchase-order-item"
import { Currency } from "@/src/entities/value-objects/currency"
import {
  MaterialTypeId,
  ProfileId,
  PurchaseOrderItemId,
  RollId,
  SupplierId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Money } from "@/src/entities/value-objects/money"

const USD = Currency.fromPersistence("USD")
const MT_ID = "00000000-0000-4000-8000-000000000001"
const TENANT_ID = "00000000-0000-4000-8000-000000000002"
const SUPPLIER_ID = "00000000-0000-4000-8000-000000000003"
const ROLL_ID = "00000000-0000-4000-8000-000000000004"
const ACTOR_ID = "00000000-0000-4000-8000-000000000005"
const PO_ITEM_ID = "00000000-0000-4000-8000-000000000006"

describe("PO input conversion helpers", () => {
  describe("sqftToSqm", () => {
    it("converts 10.7639104 sqft to ~1 sqm", () => {
      expect(sqftToSqm(10.7639104167)).toBeCloseTo(1, 9)
    })
    it("returns 0 for 0 sqft", () => {
      expect(sqftToSqm(0)).toBe(0)
    })
  })

  describe("inchesToMm", () => {
    it("1 inch = 25.4 mm", () => {
      expect(inchesToMm(1)).toBe(25.4)
    })
  })

  describe("dollarsToCents", () => {
    it("rounds to the nearest cent", () => {
      // JS float quirk: 1.005 * 100 = 100.49999... → Math.round = 100
      expect(dollarsToCents(1.005)).toBe(100)
      expect(dollarsToCents(1.004)).toBe(100)
      expect(dollarsToCents(1.0)).toBe(100)
      expect(dollarsToCents(1.006)).toBe(101)
    })
  })

  describe("dollarsToMoney", () => {
    it("wraps the cents in the given currency", () => {
      const money = dollarsToMoney(12.34, USD)
      expect(money.cents).toBe(1234)
      expect(money.currency.equals(USD)).toBe(true)
    })
  })

  describe("mapItemsToEntityProps", () => {
    function makeInput(overrides: Partial<PoLineInput> = {}): PoLineInput {
      return {
        materialTypeId: MT_ID,
        quantitySqft: 100,
        unitCost: 5.5,
        ...overrides,
      }
    }

    it("preserves the displayed total to the cent", () => {
      const [item] = mapItemsToEntityProps([makeInput()], USD)
      // 100 sqft × $5.50/sqft = $550.00 → 55000 cents
      expect(item!.lineTotal?.cents).toBe(55000)
    })

    it("assigns 1-based lineNumbers in input order", () => {
      const items = mapItemsToEntityProps(
        [makeInput(), makeInput({ quantitySqft: 200 }), makeInput({ quantitySqft: 50 })],
        USD
      )
      expect(items.map((i) => i.lineNumber)).toEqual([1, 2, 3])
    })

    it("rounds widthMm to an integer (entity invariant)", () => {
      const [item] = mapItemsToEntityProps([makeInput({ width: 1 })], USD)
      expect(item!.widthMm).toBe(25)
    })

    it("keeps thicknessMm as a float (entity allows positive-finite)", () => {
      const [item] = mapItemsToEntityProps([makeInput({ thickness: 0.5 })], USD)
      expect(item!.thicknessMm).toBeCloseTo(12.7, 5)
    })

    it("nulls out width/thickness when not provided", () => {
      const [item] = mapItemsToEntityProps([makeInput()], USD)
      expect(item!.widthMm).toBeNull()
      expect(item!.thicknessMm).toBeNull()
      expect(item!.lengthMm).toBeNull()
    })

    it("converts quantitySqm to the metric equivalent", () => {
      const [item] = mapItemsToEntityProps([makeInput({ quantitySqft: 100 })], USD)
      expect(item!.quantitySqm).toBeCloseTo(100 / 10.7639104167, 9)
    })
  })

  describe("costPerSqftToCostPerSqmMoney", () => {
    it("converts $1/sqft to ~$10.7639/sqm in cents", () => {
      const money = costPerSqftToCostPerSqmMoney(1, USD)
      // 1 × SQFT_PER_SQM × 100 = 1076.39104 → round → 1076 cents
      expect(money.cents).toBe(1076)
      expect(money.currency.equals(USD)).toBe(true)
    })

    it("returns 0 cents for 0 dollars", () => {
      expect(costPerSqftToCostPerSqmMoney(0, USD).cents).toBe(0)
    })
  })

  describe("buildCreateRollProps", () => {
    function makePoItem(
      overrides: Partial<{
        widthMm: number | null
        thicknessMm: number | null
        color: string | null
      }> = {}
    ): PurchaseOrderItem {
      return PurchaseOrderItem.create({
        lineNumber: 1,
        materialTypeId: MaterialTypeId.fromPersistence(MT_ID),
        widthMm: overrides.widthMm !== undefined ? overrides.widthMm : 1500,
        thicknessMm: overrides.thicknessMm !== undefined ? overrides.thicknessMm : 2.5,
        color: overrides.color !== undefined ? overrides.color : "Black",
        quantitySqm: 50,
        unitCost: Money.fromCents(1000, USD), // 10.00/sqm in cents
      })
    }

    function buildArgs(overrides: Partial<Parameters<typeof buildCreateRollProps>[0]> = {}) {
      return {
        id: RollId.fromPersistence(ROLL_ID),
        tenantId: TenantId.fromPersistence(TENANT_ID),
        supplierId: SupplierId.fromPersistence(SUPPLIER_ID),
        poItem: makePoItem(),
        purchaseOrderItemId: PurchaseOrderItemId.fromPersistence(PO_ITEM_ID),
        rollData: {},
        quantityReceivedSqft: 100,
        actor: ProfileId.fromPersistence(ACTOR_ID),
        poNumber: "PO-2026-0042",
        ...overrides,
      }
    }

    it("widthMm: prefers rollData.width over poItem.widthMm over default", () => {
      const fromRollData = buildCreateRollProps(buildArgs({ rollData: { width: 60 } }))
      expect(fromRollData.widthMm).toBe(Math.round(inchesToMm(60))) // 1524

      const fromPoItem = buildCreateRollProps(buildArgs({ rollData: {} }))
      expect(fromPoItem.widthMm).toBe(1500) // from poItem

      const fromDefault = buildCreateRollProps(
        buildArgs({ poItem: makePoItem({ widthMm: null }), rollData: {} })
      )
      expect(fromDefault.widthMm).toBe(DEFAULT_ROLL_WIDTH_MM) // 1524
    })

    it("lengthMm: falls back to inchesToMm(quantityReceivedSqft) when rollData.length missing", () => {
      const props = buildCreateRollProps(buildArgs({ quantityReceivedSqft: 50 }))
      // 50 inches → 1270 mm
      expect(props.lengthMm).toBe(Math.round(inchesToMm(50)))
    })

    it("thicknessMm: prefers rollData → poItem → default", () => {
      const fromRollData = buildCreateRollProps(buildArgs({ rollData: { thickness: 0.5 } }))
      expect(fromRollData.thicknessMm).toBeCloseTo(inchesToMm(0.5), 5)

      const fromPoItem = buildCreateRollProps(buildArgs({ rollData: {} }))
      expect(fromPoItem.thicknessMm).toBe(2.5)

      const fromDefault = buildCreateRollProps(
        buildArgs({ poItem: makePoItem({ thicknessMm: null }), rollData: {} })
      )
      expect(fromDefault.thicknessMm).toBe(DEFAULT_ROLL_THICKNESS_MM)
    })

    it("cost: prefers cost_per_sqft conversion over poItem.unitCost", () => {
      const fromRollData = buildCreateRollProps(buildArgs({ rollData: { cost_per_sqft: 1 } }))
      expect(fromRollData.cost?.cents).toBe(1076)

      const fromPoItem = buildCreateRollProps(buildArgs({ rollData: {} }))
      expect(fromPoItem.cost?.cents).toBe(1000) // unitCost passes through
    })

    it("notes: falls back to 'Received from PO {poNumber}'", () => {
      const fromDefault = buildCreateRollProps(buildArgs({ poNumber: "PO-2026-0042" }))
      expect(fromDefault.notes).toBe("Received from PO PO-2026-0042")

      const fromRollData = buildCreateRollProps(buildArgs({ rollData: { notes: "Custom note" } }))
      expect(fromRollData.notes).toBe("Custom note")
    })

    it("location: defaults to 'Receiving'", () => {
      const fromDefault = buildCreateRollProps(buildArgs())
      expect(fromDefault.location).toBe("Receiving")

      const fromRollData = buildCreateRollProps(buildArgs({ rollData: { location: "Bay 4" } }))
      expect(fromRollData.location).toBe("Bay 4")
    })

    it("sourceType is 'received' and lineage FKs are null", () => {
      const props = buildCreateRollProps(buildArgs())
      expect(props.sourceType).toBe("received")
      expect(props.parentRollId).toBeNull()
      expect(props.sourceCutHistoryId).toBeNull()
    })

    it("passes purchaseOrderItemId through so the FK can be written", () => {
      const props = buildCreateRollProps(buildArgs())
      expect(props.purchaseOrderItemId?.value).toBe(PO_ITEM_ID)
    })

    it("currency: defaults to poItem.unitCost.currency", () => {
      const props = buildCreateRollProps(buildArgs({ rollData: { cost_per_sqft: 1 } }))
      expect(props.cost?.currency.equals(USD)).toBe(true)
    })
  })

  // Step 7c-1: typed roll-intent snapshot for `po_item_receipts`.
  describe("buildRollIntent", () => {
    it("converts inches → mm for width / length / thickness", () => {
      const intent = buildRollIntent({ width: 60, length: 100, thickness: 0.125 })
      expect(intent.widthMm).toBe(1524) // 60 × 25.4 = 1524
      expect(intent.lengthMm).toBe(2540) // 100 × 25.4 = 2540
      expect(intent.thicknessMm).toBeCloseTo(3.175, 5)
    })

    it("converts cost_per_sqft (dollars) → cost_per_sqm (cents)", () => {
      // 1 USD/sqft × SQFT_PER_SQM × 100 = ~1076.39 cents/sqm → round to 1076
      const intent = buildRollIntent({ cost_per_sqft: 1 })
      expect(intent.costPerSqmCents).toBe(1076)
    })

    it("passes color / location / notes through unchanged", () => {
      const intent = buildRollIntent({ color: "black", location: "Bay A", notes: "smells nice" })
      expect(intent.color).toBe("black")
      expect(intent.location).toBe("Bay A")
      expect(intent.notes).toBe("smells nice")
    })

    it("returns NULL for omitted fields (no PO-item fallback at intent-capture time)", () => {
      const intent = buildRollIntent({})
      expect(intent.widthMm).toBeNull()
      expect(intent.lengthMm).toBeNull()
      expect(intent.thicknessMm).toBeNull()
      expect(intent.color).toBeNull()
      expect(intent.location).toBeNull()
      expect(intent.costPerSqmCents).toBeNull()
      expect(intent.notes).toBeNull()
    })

    it("does NOT derive lengthMm from quantityReceivedSqft — that fallback lives in the apply helper", () => {
      // buildRollIntent's contract: capture exactly what the operator typed.
      // The "fallback to quantityReceivedSqft for length" lives in
      // buildCreateRollProps and applies at apply time, not at intent capture.
      const intent = buildRollIntent({ width: 60 })
      expect(intent.lengthMm).toBeNull()
    })
  })
})
