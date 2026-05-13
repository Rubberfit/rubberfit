import { describe, expect, it } from "vitest"

import {
  dollarsToCents,
  dollarsToMoney,
  inchesToMm,
  mapItemsToEntityProps,
  sqftToSqm,
  type PoLineInput,
} from "@/src/application/use-cases/purchase-orders/po-input-conversion"
import { Currency } from "@/src/entities/value-objects/currency"

const USD = Currency.fromPersistence("USD")
const MT_ID = "00000000-0000-4000-8000-000000000001"

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
})
