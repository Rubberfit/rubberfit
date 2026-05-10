import { describe, expect, it } from "vitest"

import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { Roll } from "@/src/entities/roll"
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

const ROLL_UUID = "550e8400-e29b-41d4-a716-446655440000"
const PARENT_ROLL_UUID = "f47ac10b-58cc-4372-a567-0e02b2c3d479"
const CUT_HISTORY_UUID = "00000000-0000-4000-8000-000000000050"
const TENANT_UUID = "00000000-0000-4000-8000-000000000010"
const MT_UUID = "00000000-0000-4000-8000-000000000020"
const SUPPLIER_UUID = "00000000-0000-4000-8000-000000000030"
const ACTOR_UUID = "00000000-0000-4000-8000-000000000040"

const T0 = new Date("2026-05-09T12:00:00.000Z")
const T1 = new Date("2026-05-09T12:30:00.000Z")
const T2 = new Date("2026-05-09T13:00:00.000Z")

const USD = Currency.create("USD")

function makeRoll(overrides: Partial<Parameters<typeof Roll.create>[0]> = {}) {
  return Roll.create(
    {
      id: RollId.fromPersistence(ROLL_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      materialTypeId: MaterialTypeId.fromPersistence(MT_UUID),
      supplierId: SupplierId.fromPersistence(SUPPLIER_UUID),
      sourceType: "received",
      widthMm: 1370,
      lengthMm: 50000,
      thicknessMm: 0.085,
      ...overrides,
    },
    T0,
  )
}

function makeOffcut(
  overrides: Partial<Parameters<typeof Roll.create>[0]> = {},
) {
  return Roll.create(
    {
      id: RollId.fromPersistence(ROLL_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      materialTypeId: MaterialTypeId.fromPersistence(MT_UUID),
      sourceType: "offcut",
      parentRollId: RollId.fromPersistence(PARENT_ROLL_UUID),
      sourceCutHistoryId: CutHistoryId.fromPersistence(CUT_HISTORY_UUID),
      widthMm: 1370,
      lengthMm: 5000,
      thicknessMm: 0.085,
      ...overrides,
    },
    T0,
  )
}

describe("Roll", () => {
  describe("create() — received", () => {
    it("constructs with required fields and active status", () => {
      const r = makeRoll()
      expect(r.id.value).toBe(ROLL_UUID)
      expect(r.sourceType).toBe("received")
      expect(r.parentRollId).toBeNull()
      expect(r.widthMm).toBe(1370)
      expect(r.lengthMm).toBe(50000)
      expect(r.remainingLengthMm).toBe(50000)
      expect(r.status).toBe("active")
      expect(r.barcodeFormat).toBe("code128")
      expect(r.barcodeAssetPath).toBeNull()
    })

    it("rejects parentRollId on a received roll", () => {
      expect(() =>
        makeRoll({ parentRollId: RollId.fromPersistence(PARENT_ROLL_UUID) }),
      ).toThrow(InvalidEntityError)
    })

    it("rejects sourceCutHistoryId on a received roll", () => {
      expect(() =>
        makeRoll({
          sourceCutHistoryId: CutHistoryId.fromPersistence(CUT_HISTORY_UUID),
        }),
      ).toThrow(InvalidEntityError)
    })

    it("rejects non-positive width / length", () => {
      expect(() => makeRoll({ widthMm: 0 })).toThrow(InvalidEntityError)
      expect(() => makeRoll({ widthMm: -1 })).toThrow(InvalidEntityError)
      expect(() => makeRoll({ lengthMm: 0 })).toThrow(InvalidEntityError)
      expect(() => makeRoll({ widthMm: 100.5 })).toThrow(InvalidEntityError)
    })

    it("rejects non-positive thickness", () => {
      expect(() => makeRoll({ thicknessMm: 0 })).toThrow(InvalidEntityError)
      expect(() => makeRoll({ thicknessMm: -0.1 })).toThrow(InvalidEntityError)
    })

    it("accepts fractional thickness (numeric column)", () => {
      const r = makeRoll({ thicknessMm: 0.085 })
      expect(r.thicknessMm).toBe(0.085)
    })

    it("rejects remainingLengthMm > lengthMm", () => {
      expect(() =>
        makeRoll({ lengthMm: 1000, remainingLengthMm: 1001 }),
      ).toThrow(InvalidEntityError)
    })

    it("defaults remaining to length when not provided", () => {
      const r = makeRoll({ lengthMm: 30000 })
      expect(r.remainingLengthMm).toBe(30000)
    })

    it("accepts a Money cost", () => {
      const r = makeRoll({ cost: Money.fromCents(4500, USD) })
      expect(r.cost?.cents).toBe(4500)
    })
  })

  describe("create() — offcut", () => {
    it("constructs with parentRollId + sourceCutHistoryId and source='offcut'", () => {
      const r = makeOffcut()
      expect(r.sourceType).toBe("offcut")
      expect(r.parentRollId?.value).toBe(PARENT_ROLL_UUID)
      expect(r.sourceCutHistoryId?.value).toBe(CUT_HISTORY_UUID)
    })

    it("rejects offcut without parentRollId", () => {
      expect(() =>
        Roll.create(
          {
            id: RollId.fromPersistence(ROLL_UUID),
            tenantId: TenantId.fromPersistence(TENANT_UUID),
            materialTypeId: MaterialTypeId.fromPersistence(MT_UUID),
            sourceType: "offcut",
            sourceCutHistoryId: CutHistoryId.fromPersistence(CUT_HISTORY_UUID),
            widthMm: 1370,
            lengthMm: 5000,
            thicknessMm: 0.085,
          },
          T0,
        ),
      ).toThrow(InvalidEntityError)
    })

    it("rejects offcut without sourceCutHistoryId", () => {
      expect(() =>
        Roll.create(
          {
            id: RollId.fromPersistence(ROLL_UUID),
            tenantId: TenantId.fromPersistence(TENANT_UUID),
            materialTypeId: MaterialTypeId.fromPersistence(MT_UUID),
            sourceType: "offcut",
            parentRollId: RollId.fromPersistence(PARENT_ROLL_UUID),
            widthMm: 1370,
            lengthMm: 5000,
            thicknessMm: 0.085,
          },
          T0,
        ),
      ).toThrow(InvalidEntityError)
    })

    it("rejects self-parent", () => {
      expect(() =>
        Roll.create(
          {
            id: RollId.fromPersistence(ROLL_UUID),
            tenantId: TenantId.fromPersistence(TENANT_UUID),
            materialTypeId: MaterialTypeId.fromPersistence(MT_UUID),
            sourceType: "offcut",
            parentRollId: RollId.fromPersistence(ROLL_UUID),
            sourceCutHistoryId: CutHistoryId.fromPersistence(CUT_HISTORY_UUID),
            widthMm: 1370,
            lengthMm: 5000,
            thicknessMm: 0.085,
          },
          T0,
        ),
      ).toThrow(InvalidEntityError)
    })
  })

  describe("consumeLength()", () => {
    it("decrements remaining and stays active when remaining > 0", () => {
      const r = makeRoll({ lengthMm: 10000 })
      r.consumeLength(3000, ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(r.remainingLengthMm).toBe(7000)
      expect(r.status).toBe("active")
    })

    it("auto-flips to depleted at zero", () => {
      const r = makeRoll({ lengthMm: 1000 })
      r.consumeLength(1000, ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(r.remainingLengthMm).toBe(0)
      expect(r.status).toBe("depleted")
    })

    it("rejects non-positive mm", () => {
      const r = makeRoll()
      expect(() =>
        r.consumeLength(0, ProfileId.fromPersistence(ACTOR_UUID), T1),
      ).toThrow(InvalidEntityError)
      expect(() =>
        r.consumeLength(-1, ProfileId.fromPersistence(ACTOR_UUID), T1),
      ).toThrow(InvalidEntityError)
    })

    it("rejects non-integer mm", () => {
      const r = makeRoll()
      expect(() =>
        r.consumeLength(1.5, ProfileId.fromPersistence(ACTOR_UUID), T1),
      ).toThrow(InvalidEntityError)
    })

    it("rejects mm exceeding remaining", () => {
      const r = makeRoll({ lengthMm: 1000 })
      expect(() =>
        r.consumeLength(1001, ProfileId.fromPersistence(ACTOR_UUID), T1),
      ).toThrow(InvalidEntityError)
    })

    it("rejects on a reserved roll", () => {
      const r = makeRoll()
      r.reserve(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        r.consumeLength(100, ProfileId.fromPersistence(ACTOR_UUID), T2),
      ).toThrow(InvalidEntityError)
    })

    it("rejects on a depleted roll", () => {
      const r = makeRoll({ lengthMm: 100 })
      r.consumeLength(100, ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        r.consumeLength(1, ProfileId.fromPersistence(ACTOR_UUID), T2),
      ).toThrow(InvalidEntityError)
    })

    it("rejects on a soft-deleted roll", () => {
      const r = makeRoll()
      r.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        r.consumeLength(100, ProfileId.fromPersistence(ACTOR_UUID), T2),
      ).toThrow(InvalidEntityError)
    })
  })

  describe("reserve / release", () => {
    it("reserve flips active → reserved", () => {
      const r = makeRoll()
      r.reserve(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(r.status).toBe("reserved")
    })

    it("reserve idempotent on already-reserved", () => {
      const r = makeRoll()
      r.reserve(ProfileId.fromPersistence(ACTOR_UUID), T1)
      const before = r.updatedAt
      r.reserve(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(r.updatedAt).toBe(before)
    })

    it("reserve rejects on depleted", () => {
      const r = makeRoll({ lengthMm: 100 })
      r.consumeLength(100, ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        r.reserve(ProfileId.fromPersistence(ACTOR_UUID), T2),
      ).toThrow(InvalidEntityError)
    })

    it("release flips reserved → active", () => {
      const r = makeRoll()
      r.reserve(ProfileId.fromPersistence(ACTOR_UUID), T1)
      r.release(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(r.status).toBe("active")
    })

    it("release idempotent on already-active", () => {
      const r = makeRoll()
      const before = r.updatedAt
      r.release(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(r.updatedAt).toBe(before)
    })

    it("release rejects on depleted", () => {
      const r = makeRoll({ lengthMm: 100 })
      r.consumeLength(100, ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        r.release(ProfileId.fromPersistence(ACTOR_UUID), T2),
      ).toThrow(InvalidEntityError)
    })

    it("reserve / release reject on soft-deleted", () => {
      const r = makeRoll()
      r.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        r.reserve(ProfileId.fromPersistence(ACTOR_UUID), T2),
      ).toThrow(InvalidEntityError)
      expect(() =>
        r.release(ProfileId.fromPersistence(ACTOR_UUID), T2),
      ).toThrow(InvalidEntityError)
    })
  })

  describe("relocate / updateNotes", () => {
    it("relocate trims and changes location", () => {
      const r = makeRoll()
      r.relocate(
        "  Bay A  ",
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(r.location).toBe("Bay A")
    })

    it("relocate is no-op when unchanged", () => {
      const r = makeRoll({ location: "Bay A" })
      const before = r.updatedAt
      r.relocate("Bay A", ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(r.updatedAt).toBe(before)
    })

    it("relocate accepts null", () => {
      const r = makeRoll({ location: "Bay A" })
      r.relocate(null, ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(r.location).toBeNull()
    })

    it("updateNotes changes notes; no-op on equality", () => {
      const r = makeRoll()
      r.updateNotes(
        "first arrival",
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(r.notes).toBe("first arrival")
      const before = r.updatedAt
      r.updateNotes(
        "first arrival",
        ProfileId.fromPersistence(ACTOR_UUID),
        T2,
      )
      expect(r.updatedAt).toBe(before)
    })
  })

  describe("recordBarcode / recordQrGenerated", () => {
    it("recordBarcode stores triple and bumps timestamp", () => {
      const r = makeRoll()
      r.recordBarcode(
        "code128",
        "tenant/abc/roll-1.png",
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(r.barcodeFormat).toBe("code128")
      expect(r.barcodeAssetPath).toBe("tenant/abc/roll-1.png")
      expect(r.barcodeGeneratedAt).toEqual(T1)
    })

    it("recordBarcode rejects empty path", () => {
      const r = makeRoll()
      expect(() =>
        r.recordBarcode(
          "code128",
          "   ",
          ProfileId.fromPersistence(ACTOR_UUID),
          T1,
        ),
      ).toThrow(InvalidEntityError)
    })

    it("recordQrGenerated bumps qrGeneratedAt", () => {
      const r = makeRoll()
      r.recordQrGenerated(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(r.qrGeneratedAt).toEqual(T1)
    })

    it("recordBarcode / recordQrGenerated reject on soft-deleted", () => {
      const r = makeRoll()
      r.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        r.recordBarcode(
          "code128",
          "x",
          ProfileId.fromPersistence(ACTOR_UUID),
          T2,
        ),
      ).toThrow(InvalidEntityError)
      expect(() =>
        r.recordQrGenerated(ProfileId.fromPersistence(ACTOR_UUID), T2),
      ).toThrow(InvalidEntityError)
    })
  })

  describe("softDelete is independent of status", () => {
    it("can soft-delete an active roll", () => {
      const r = makeRoll()
      r.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(r.isDeleted).toBe(true)
      expect(r.status).toBe("active")
    })

    it("can soft-delete a depleted roll", () => {
      const r = makeRoll({ lengthMm: 100 })
      r.consumeLength(100, ProfileId.fromPersistence(ACTOR_UUID), T1)
      r.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(r.isDeleted).toBe(true)
      expect(r.status).toBe("depleted")
    })

    it("idempotent", () => {
      const r = makeRoll()
      r.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      r.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(r.deletedAt).toEqual(T1)
    })
  })

  describe("state queries", () => {
    it("isOffcut tracks sourceType", () => {
      expect(makeRoll().isOffcut).toBe(false)
      expect(makeOffcut().isOffcut).toBe(true)
    })

    it("isActive / isReserved / isDepleted reflect status", () => {
      const r = makeRoll({ lengthMm: 100 })
      expect(r.isActive).toBe(true)
      r.reserve(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(r.isReserved).toBe(true)
      r.release(ProfileId.fromPersistence(ACTOR_UUID), T2)
      r.consumeLength(100, ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(r.isDepleted).toBe(true)
    })
  })

  describe("toJSON / fromJSON round-trip", () => {
    it("preserves all fields including parent + cost + barcode", () => {
      const r = makeOffcut({ cost: Money.fromCents(4500, USD) })
      r.recordBarcode(
        "code128",
        "tenant/abc/roll-1.png",
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      r.recordQrGenerated(ProfileId.fromPersistence(ACTOR_UUID), T2)
      const snap = r.toJSON()
      expect(Roll.fromJSON(snap).toJSON()).toEqual(snap)
    })

    it("snapshot uses primitives for ids and timestamps", () => {
      const out = makeRoll().toJSON()
      expect(typeof out.id).toBe("string")
      expect(typeof out.tenantId).toBe("string")
      expect(typeof out.createdAt).toBe("string")
      expect(typeof out.dateReceived).toBe("string")
    })
  })
})
