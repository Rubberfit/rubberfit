import { describe, expect, it } from "vitest"

import { CutHistory } from "@/src/entities/cut-history"
import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { Currency } from "@/src/entities/value-objects/currency"
import {
  CutHistoryId,
  MaterialTypeId,
  ProfileId,
  RollId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Money } from "@/src/entities/value-objects/money"

const CH_UUID = "550e8400-e29b-41d4-a716-446655440000"
const TENANT_UUID = "00000000-0000-4000-8000-000000000010"
const MT_UUID = "00000000-0000-4000-8000-000000000020"
const ROLL_UUID = "00000000-0000-4000-8000-000000000030"
const USER_UUID = "00000000-0000-4000-8000-000000000040"
const ACTOR_UUID = "00000000-0000-4000-8000-000000000050"

const T0 = new Date("2026-05-09T12:00:00.000Z")
const T1 = new Date("2026-05-09T12:30:00.000Z")
const T2 = new Date("2026-05-09T13:00:00.000Z")

const USD = Currency.create("USD")

function makeCH(overrides: Partial<Parameters<typeof CutHistory.create>[0]> = {}) {
  return CutHistory.create(
    {
      id: CutHistoryId.fromPersistence(CH_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      materialTypeId: MaterialTypeId.fromPersistence(MT_UUID),
      cutLengthMm: 1000,
      cutWidthMm: 500,
      ...overrides,
    },
    T0,
  )
}

describe("CutHistory", () => {
  describe("create()", () => {
    it("constructs with required fields and defaults", () => {
      const ch = makeCH()
      expect(ch.id.value).toBe(CH_UUID)
      expect(ch.materialTypeId.value).toBe(MT_UUID)
      expect(ch.cutAmount).toBe(1)
      expect(ch.partsCompleted).toBe(0)
      expect(ch.cutPieces).toBe(0)
      expect(ch.materialUsedSqmm).toBe(0)
      expect(ch.scrapSqmm).toBe(0)
      expect(ch.fabScore).toBeNull()
      expect(ch.source).toBe("auto")
      expect(ch.layoutJson).toBeNull()
      expect(ch.selections).toEqual([])
      expect(ch.deletedAt).toBeNull()
    })

    it("rejects non-positive cut dimensions", () => {
      expect(() => makeCH({ cutLengthMm: 0 })).toThrow(InvalidEntityError)
      expect(() => makeCH({ cutWidthMm: -1 })).toThrow(InvalidEntityError)
      expect(() => makeCH({ cutLengthMm: 1.5 })).toThrow(InvalidEntityError)
    })

    it("rejects partsCompleted > cutAmount", () => {
      expect(() => makeCH({ cutAmount: 5, partsCompleted: 6 })).toThrow(
        InvalidEntityError,
      )
    })

    it("accepts partsCompleted == cutAmount", () => {
      const ch = makeCH({ cutAmount: 5, partsCompleted: 5 })
      expect(ch.partsCompleted).toBe(5)
    })

    it("rejects negative materialUsedSqmm / scrapSqmm", () => {
      expect(() => makeCH({ materialUsedSqmm: -1 })).toThrow(InvalidEntityError)
      expect(() => makeCH({ scrapSqmm: -1 })).toThrow(InvalidEntityError)
    })

    it("rejects fabScore out of [0,1]", () => {
      expect(() => makeCH({ fabScore: -0.1 })).toThrow(InvalidEntityError)
      expect(() => makeCH({ fabScore: 1.5 })).toThrow(InvalidEntityError)
    })

    it("accepts fabScore null and 0..1 inclusive", () => {
      expect(makeCH({ fabScore: 0 }).fabScore).toBe(0)
      expect(makeCH({ fabScore: 1 }).fabScore).toBe(1)
      expect(makeCH({ fabScore: null }).fabScore).toBeNull()
    })

    it("accepts Money cost snapshot", () => {
      const ch = makeCH({ cost: Money.fromCents(4500, USD) })
      expect(ch.cost?.cents).toBe(4500)
    })

    it("rejects unsupported source value", () => {
      // @ts-expect-error — testing runtime guard
      expect(() => makeCH({ source: "bogus" })).toThrow(InvalidEntityError)
    })

    it("trims stockLabel / pdfUrl; rejects overlong", () => {
      const ch = makeCH({ stockLabel: "  Manual 12x14x0.085  " })
      expect(ch.stockLabel).toBe("Manual 12x14x0.085")
      expect(() => makeCH({ stockLabel: "x".repeat(201) })).toThrow(
        InvalidEntityError,
      )
      expect(() => makeCH({ pdfUrl: "x".repeat(501) })).toThrow(
        InvalidEntityError,
      )
    })

    it("supports cross-aggregate FKs (rollId, userId, partId)", () => {
      const ch = makeCH({
        rollId: RollId.fromPersistence(ROLL_UUID),
        userId: ProfileId.fromPersistence(USER_UUID),
        partId: "550e8400-e29b-41d4-a716-446655449999",
      })
      expect(ch.rollId?.value).toBe(ROLL_UUID)
      expect(ch.userId?.value).toBe(USER_UUID)
      expect(ch.partId).toBe("550e8400-e29b-41d4-a716-446655449999")
    })
  })

  describe("selections collection", () => {
    it("populates from create input and sorts by selectionIndex", () => {
      const ch = makeCH({
        selections: [
          { selectionIndex: 2, sizeText: "C" },
          { selectionIndex: 0, sizeText: "A" },
          { selectionIndex: 1, sizeText: "B" },
        ],
      })
      expect(ch.selections.map((s) => s.sizeText)).toEqual(["A", "B", "C"])
    })

    it("rejects duplicate selectionIndex", () => {
      expect(() =>
        makeCH({
          selections: [
            { selectionIndex: 0, sizeText: "A" },
            { selectionIndex: 0, sizeText: "B" },
          ],
        }),
      ).toThrow(InvalidEntityError)
    })

    it("returns a defensive copy on read", () => {
      const ch = makeCH({
        selections: [{ selectionIndex: 0, sizeText: "A" }],
      })
      const arr = ch.selections as unknown as { length: number }
      // Mutating the returned array does not affect internal state.
      ;(arr as unknown[]).pop()
      expect(ch.selections.length).toBe(1)
    })
  })

  describe("source variants", () => {
    it("isAuto / isManual reflect source", () => {
      expect(makeCH({ source: "auto" }).isAuto).toBe(true)
      expect(makeCH({ source: "manual" }).isManual).toBe(true)
    })

    it("layoutJson is opaque (any object accepted)", () => {
      const blob = { version: 1, kind: "manual", placements: [] }
      const ch = makeCH({ source: "manual", layoutJson: blob })
      expect(ch.layoutJson).toEqual(blob)
    })
  })

  describe("immutability", () => {
    it("only softDelete is exposed as a mutation method", () => {
      const ch = makeCH()
      const proto = Object.getPrototypeOf(ch) as Record<string, unknown>
      expect(typeof proto.softDelete).toBe("function")
      expect(proto.updateDetails).toBeUndefined()
      expect(proto.recordWaste).toBeUndefined()
    })
  })

  describe("softDelete()", () => {
    it("sets deletedAt + bumps audit; idempotent", () => {
      const ch = makeCH()
      ch.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(ch.deletedAt).toEqual(T1)
      expect(ch.updatedBy?.value).toBe(ACTOR_UUID)
      ch.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(ch.deletedAt).toEqual(T1)
    })
  })

  describe("toJSON / fromJSON round-trip", () => {
    it("preserves all fields including selections + Money", () => {
      const ch = makeCH({
        userId: ProfileId.fromPersistence(USER_UUID),
        rollId: RollId.fromPersistence(ROLL_UUID),
        cost: Money.fromCents(4500, USD),
        fabScore: 0.78,
        source: "manual",
        layoutJson: { version: 1, kind: "manual", placements: [] },
        selections: [
          { selectionIndex: 0, sizeValue: 168, sizeText: "12x14", label: "A" },
          { selectionIndex: 1, sizeValue: 432, sizeText: "18x24", label: "B" },
        ],
      })
      const snap = ch.toJSON()
      expect(CutHistory.fromJSON(snap).toJSON()).toEqual(snap)
    })

    it("snapshot uses primitives", () => {
      const out = makeCH().toJSON()
      expect(typeof out.id).toBe("string")
      expect(typeof out.cutDate).toBe("string")
      expect(Array.isArray(out.selections)).toBe(true)
    })
  })
})
