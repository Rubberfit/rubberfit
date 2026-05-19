import { describe, expect, it } from "vitest"

import { CutFavorite } from "@/src/entities/cut-favorite"
import {
  CutFavoriteId,
  CutHistoryId,
  ProfileId,
  TenantId,
} from "@/src/entities/value-objects/id"

const FAV_UUID = "550e8400-e29b-41d4-a716-446655440000"
const TENANT_UUID = "00000000-0000-4000-8000-000000000010"
const USER_UUID = "00000000-0000-4000-8000-000000000020"
const CH_UUID = "00000000-0000-4000-8000-000000000030"
const ACTOR_UUID = "00000000-0000-4000-8000-000000000040"

const T0 = new Date("2026-05-09T12:00:00.000Z")
const T1 = new Date("2026-05-09T12:30:00.000Z")
const T2 = new Date("2026-05-09T13:00:00.000Z")

function makeFavorite() {
  return CutFavorite.create(
    {
      id: CutFavoriteId.fromPersistence(FAV_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      userId: ProfileId.fromPersistence(USER_UUID),
      cutHistoryId: CutHistoryId.fromPersistence(CH_UUID),
    },
    T0,
  )
}

describe("CutFavorite", () => {
  describe("create()", () => {
    it("constructs with required FKs", () => {
      const f = makeFavorite()
      expect(f.id.value).toBe(FAV_UUID)
      expect(f.userId.value).toBe(USER_UUID)
      expect(f.cutHistoryId.value).toBe(CH_UUID)
      expect(f.deletedAt).toBeNull()
    })

    it("captures createdBy distinctly from userId", () => {
      const f = CutFavorite.create(
        {
          id: CutFavoriteId.fromPersistence(FAV_UUID),
          tenantId: TenantId.fromPersistence(TENANT_UUID),
          userId: ProfileId.fromPersistence(USER_UUID),
          cutHistoryId: CutHistoryId.fromPersistence(CH_UUID),
          createdBy: ProfileId.fromPersistence(ACTOR_UUID),
        },
        T0,
      )
      expect(f.userId.value).toBe(USER_UUID)
      expect(f.createdBy?.value).toBe(ACTOR_UUID)
    })
  })

  describe("isDeleted", () => {
    it("false initially", () => {
      expect(makeFavorite().isDeleted).toBe(false)
    })

    it("true after softDelete", () => {
      const f = makeFavorite()
      f.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(f.isDeleted).toBe(true)
    })
  })

  describe("softDelete()", () => {
    it("sets deletedAt + bumps audit", () => {
      const f = makeFavorite()
      f.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(f.deletedAt).toEqual(T1)
      expect(f.updatedAt).toEqual(T1)
      expect(f.updatedBy?.value).toBe(ACTOR_UUID)
    })

    it("idempotent", () => {
      const f = makeFavorite()
      f.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      f.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(f.deletedAt).toEqual(T1)
    })
  })

  describe("immutability", () => {
    it("exposes no update method beyond softDelete", () => {
      const f = makeFavorite()
      const proto = Object.getPrototypeOf(f) as Record<string, unknown>
      expect(typeof proto.softDelete).toBe("function")
      expect(proto.updateDetails).toBeUndefined()
    })
  })

  describe("toJSON / fromJSON round-trip", () => {
    it("preserves all fields", () => {
      const f = makeFavorite()
      f.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      const snap = f.toJSON()
      expect(CutFavorite.fromJSON(snap).toJSON()).toEqual(snap)
    })
  })
})
