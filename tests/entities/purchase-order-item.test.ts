import { describe, expect, it } from "vitest"

import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { PurchaseOrderItem } from "@/src/entities/purchase-order-item"
import { Currency } from "@/src/entities/value-objects/currency"
import { MaterialTypeId } from "@/src/entities/value-objects/id"
import { Money } from "@/src/entities/value-objects/money"

const MT_UUID = "00000000-0000-4000-8000-000000000020"

const USD = Currency.create("USD")
const EUR = Currency.create("EUR")

const T1 = new Date("2026-05-09T12:30:00.000Z")
const T2 = new Date("2026-05-09T13:00:00.000Z")

function makeItem(overrides: Partial<Parameters<typeof PurchaseOrderItem.create>[0]> = {}) {
  return PurchaseOrderItem.create({
    lineNumber: 1,
    materialTypeId: MaterialTypeId.fromPersistence(MT_UUID),
    quantitySqm: 10,
    unitCost: Money.fromCents(500, USD),
    ...overrides,
  })
}

describe("PurchaseOrderItem", () => {
  describe("create() — happy path", () => {
    it("constructs with required fields and derives lineTotal", () => {
      const item = makeItem()
      expect(item.lineNumber).toBe(1)
      expect(item.quantitySqm).toBe(10)
      expect(item.unitCost.cents).toBe(500)
      expect(item.lineTotal.cents).toBe(5000)
      expect(item.lineTotal.currency.value).toBe("USD")
      expect(item.quantityReceivedSqm).toBe(0)
      expect(item.receivedDate).toBeNull()
      expect(item.isFullyReceived).toBe(false)
    })

    it("accepts an explicit lineTotal snapshot", () => {
      const item = makeItem({ lineTotal: Money.fromCents(4999, USD) })
      expect(item.lineTotal.cents).toBe(4999)
    })

    it("trims optional strings and applies length caps", () => {
      const item = makeItem({
        description: "  Vinyl roll  ",
        color: "  Red  ",
        notes: "  qa pending  ",
      })
      expect(item.description).toBe("Vinyl roll")
      expect(item.color).toBe("Red")
      expect(item.notes).toBe("qa pending")
    })

    it("accepts null receivedDate explicitly", () => {
      const item = makeItem({ receivedDate: null })
      expect(item.receivedDate).toBeNull()
    })
  })

  describe("create() — invariant violations", () => {
    it("rejects non-positive integer lineNumber", () => {
      expect(() => makeItem({ lineNumber: 0 })).toThrow(InvalidEntityError)
      expect(() => makeItem({ lineNumber: -1 })).toThrow(InvalidEntityError)
      expect(() => makeItem({ lineNumber: 1.5 })).toThrow(InvalidEntityError)
    })

    it("rejects non-positive quantitySqm", () => {
      expect(() => makeItem({ quantitySqm: 0 })).toThrow(InvalidEntityError)
      expect(() => makeItem({ quantitySqm: -1 })).toThrow(InvalidEntityError)
    })

    it("rejects non-positive integer widthMm / lengthMm if set", () => {
      expect(() => makeItem({ widthMm: 0 })).toThrow(InvalidEntityError)
      expect(() => makeItem({ widthMm: -1 })).toThrow(InvalidEntityError)
      expect(() => makeItem({ widthMm: 100.5 })).toThrow(InvalidEntityError)
      expect(() => makeItem({ lengthMm: 0 })).toThrow(InvalidEntityError)
    })

    it("rejects non-positive thicknessMm if set", () => {
      expect(() => makeItem({ thicknessMm: 0 })).toThrow(InvalidEntityError)
      expect(() => makeItem({ thicknessMm: -0.1 })).toThrow(InvalidEntityError)
    })

    it("accepts fractional thicknessMm", () => {
      const item = makeItem({ thicknessMm: 0.085 })
      expect(item.thicknessMm).toBe(0.085)
    })

    it("rejects negative quantityReceivedSqm", () => {
      expect(() => makeItem({ quantityReceivedSqm: -1 })).toThrow(InvalidEntityError)
    })

    it("rejects quantityReceivedSqm > quantitySqm", () => {
      expect(() => makeItem({ quantitySqm: 10, quantityReceivedSqm: 11 })).toThrow(
        InvalidEntityError
      )
    })

    it("rejects negative unitCost", () => {
      expect(() => makeItem({ unitCost: Money.fromCents(-1, USD) })).toThrow(InvalidEntityError)
    })

    it("rejects negative explicit lineTotal", () => {
      expect(() => makeItem({ lineTotal: Money.fromCents(-1, USD) })).toThrow(InvalidEntityError)
    })

    it("rejects lineTotal currency mismatch with unitCost", () => {
      expect(() =>
        makeItem({ unitCost: Money.fromCents(500, USD), lineTotal: Money.fromCents(5000, EUR) })
      ).toThrow(InvalidEntityError)
    })
  })

  describe("withReceipt()", () => {
    it("returns a new instance with accumulated received quantity and stamped date", () => {
      const item = makeItem({ quantitySqm: 10 })
      const next = item.withReceipt(3, T1)
      expect(next).not.toBe(item)
      expect(next.quantityReceivedSqm).toBe(3)
      expect(next.receivedDate).toEqual(T1)
      expect(next.isFullyReceived).toBe(false)
      expect(item.quantityReceivedSqm).toBe(0)
    })

    it("flips isFullyReceived when accumulated total hits quantitySqm", () => {
      const partial = makeItem({ quantitySqm: 10 }).withReceipt(4, T1)
      const full = partial.withReceipt(6, T2)
      expect(full.quantityReceivedSqm).toBe(10)
      expect(full.isFullyReceived).toBe(true)
    })

    it("rejects non-positive receipt", () => {
      const item = makeItem()
      expect(() => item.withReceipt(0, T1)).toThrow(InvalidEntityError)
      expect(() => item.withReceipt(-1, T1)).toThrow(InvalidEntityError)
    })

    it("rejects a receipt that exceeds ordered quantity", () => {
      const item = makeItem({ quantitySqm: 10, quantityReceivedSqm: 8 })
      expect(() => item.withReceipt(3, T1)).toThrow(InvalidEntityError)
    })

    it("preserves the original unitCost / lineTotal / notes after withReceipt", () => {
      const item = makeItem({ notes: "fragile" })
      const next = item.withReceipt(5, T1)
      expect(next.unitCost.equals(item.unitCost)).toBe(true)
      expect(next.lineTotal.equals(item.lineTotal)).toBe(true)
      expect(next.notes).toBe("fragile")
    })
  })

  describe("fromSnapshot round-trip", () => {
    it("preserves all fields", () => {
      const item = makeItem({
        description: "Vinyl",
        widthMm: 1370,
        lengthMm: 50000,
        thicknessMm: 0.085,
        color: "Red",
        receivedDate: T1,
        notes: "hold for inspection",
      }).withReceipt(2, T2)
      const snap = item.toJSON()
      expect(PurchaseOrderItem.fromSnapshot(snap).toJSON()).toEqual(snap)
    })
  })

  describe("equals", () => {
    it("returns true for items with the same fields", () => {
      expect(makeItem().equals(makeItem())).toBe(true)
    })

    it("returns false for differing lineNumber", () => {
      expect(makeItem({ lineNumber: 1 }).equals(makeItem({ lineNumber: 2 }))).toBe(false)
    })

    it("returns false for null/undefined", () => {
      expect(makeItem().equals(null)).toBe(false)
      expect(makeItem().equals(undefined)).toBe(false)
    })
  })
})
