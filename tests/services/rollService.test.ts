import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { container } from "tsyringe"

import type { IRollsRepository } from "@/src/application/repositories/rolls.repository.interface"
import type { IRollService } from "@/src/application/services/roll.service.interface"
import { Roll } from "@/src/entities/roll"
import {
  MaterialTypeId,
  ProfileId,
  RollId,
  SupplierId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Currency } from "@/src/entities/value-objects/currency"
import { Money } from "@/src/entities/value-objects/money"
import {
  getPublicRollByPartNumberOrId,
  RollService,
} from "@/src/infrastructure/services/rollService"
import { TOKENS } from "@/di/tokens"
import { makeFakeClient } from "@/tests/helpers/fake-supabase-client"

const TENANT_UUID = "22222222-2222-4222-8222-222222222222"
const MT_UUID = "33333333-3333-4333-8333-333333333333"
const SUPPLIER_UUID = "44444444-4444-4444-8444-444444444444"
const ACTOR_UUID = "55555555-5555-4555-8555-555555555555"
const ROLL_UUID = "11111111-1111-4111-8111-aaaaaaaaaaaa"

const USD = Currency.fromPersistence("USD")

function makeReceivedRoll(opts: { id?: string; remainingMm?: number } = {}): Roll {
  return Roll.create(
    {
      id: RollId.fromPersistence(opts.id ?? ROLL_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      materialTypeId: MaterialTypeId.fromPersistence(MT_UUID),
      supplierId: SupplierId.fromPersistence(SUPPLIER_UUID),
      sourceType: "received",
      widthMm: 1500,
      lengthMm: 50000,
      remainingLengthMm: opts.remainingMm ?? 50000,
      thicknessMm: 0.5,
      cost: Money.fromCents(5400, USD),
      dateReceived: new Date("2026-04-01T00:00:00.000Z"),
      createdBy: ProfileId.fromPersistence(ACTOR_UUID),
    },
    new Date("2026-04-01T09:00:00.000Z")
  )
}

function makeFakeRepo(): IRollsRepository {
  return {
    findById: vi.fn(),
    findActive: vi.fn(),
    findByMaterialType: vi.fn(),
    findChildOffcuts: vi.fn(),
    findByPurchaseOrderItemId: vi.fn().mockResolvedValue(null),
    insert: vi.fn(),
    update: vi.fn(),
    getAllRolls: vi.fn(),
    getActiveRolls: vi.fn(),
    getRollById: vi.fn(),
    addRoll: vi.fn(),
    updateRoll: vi.fn(),
    markAsDepleted: vi.fn(),
    markRollDepleted: vi.fn(),
    getInventoryValue: vi.fn(),
    searchRolls: vi.fn(),
    getLowStockCount: vi.fn(),
    deleteRoll: vi.fn(),
    getRecentRolls: vi.fn(),
    getRecentlyUpdatedRolls: vi.fn(),
    existsByMaterialType: vi.fn(),
    getRollMaterialTypeMap: vi.fn(),
    bulkAddRolls: vi.fn(),
    getInventoryGrowthPercentage: vi.fn(),
    getThicknessesByMaterialType: vi.fn(),
    getReusableOffcutSummary: vi.fn(),
    getChildOffcuts: vi.fn(),
  }
}

describe("RollService", () => {
  let repo: IRollsRepository
  let service: IRollService
  const actor = ProfileId.fromPersistence(ACTOR_UUID)

  beforeEach(() => {
    container.clearInstances()
    repo = makeFakeRepo()
    container.registerInstance<IRollsRepository>(TOKENS.IRollsRepository, repo)
    service = container.resolve(RollService)
  })

  describe("reads", () => {
    it("delegates getById to repo.findById", async () => {
      const roll = makeReceivedRoll()
      vi.mocked(repo.findById).mockResolvedValue(roll)
      await expect(service.getById(ROLL_UUID)).resolves.toBe(roll)
      expect(repo.findById).toHaveBeenCalledWith(ROLL_UUID)
    })

    it("delegates getActive to repo.findActive", async () => {
      const rolls = [makeReceivedRoll()]
      vi.mocked(repo.findActive).mockResolvedValue(rolls)
      await expect(service.getActive()).resolves.toBe(rolls)
    })

    it("delegates getByMaterialType to repo.findByMaterialType", async () => {
      const rolls = [makeReceivedRoll()]
      vi.mocked(repo.findByMaterialType).mockResolvedValue(rolls)
      await expect(service.getByMaterialType(MT_UUID)).resolves.toBe(rolls)
      expect(repo.findByMaterialType).toHaveBeenCalledWith(MT_UUID)
    })

    it("delegates getChildOffcuts to repo.findChildOffcuts", async () => {
      const rolls = [makeReceivedRoll()]
      vi.mocked(repo.findChildOffcuts).mockResolvedValue(rolls)
      await expect(service.getChildOffcuts(ROLL_UUID)).resolves.toBe(rolls)
      expect(repo.findChildOffcuts).toHaveBeenCalledWith(ROLL_UUID)
    })
  })

  describe("createRoll", () => {
    it("constructs a Roll entity via Roll.create and persists it", async () => {
      const persisted = makeReceivedRoll()
      vi.mocked(repo.insert).mockResolvedValue(persisted)

      const result = await service.createRoll({
        id: RollId.fromPersistence(ROLL_UUID),
        tenantId: TenantId.fromPersistence(TENANT_UUID),
        materialTypeId: MaterialTypeId.fromPersistence(MT_UUID),
        supplierId: SupplierId.fromPersistence(SUPPLIER_UUID),
        sourceType: "received",
        widthMm: 1500,
        lengthMm: 50000,
        thicknessMm: 0.5,
        cost: Money.fromCents(5400, USD),
      })

      expect(result).toBe(persisted)
      const insertedRoll = vi.mocked(repo.insert).mock.calls[0]![0]
      expect(insertedRoll).toBeInstanceOf(Roll)
      expect(insertedRoll.sourceType).toBe("received")
      expect(insertedRoll.remainingLengthMm).toBe(50000)
    })
  })

  describe("consumeLength", () => {
    it("loads roll, invokes mutator, persists update", async () => {
      const roll = makeReceivedRoll({ remainingMm: 50000 })
      vi.mocked(repo.findById).mockResolvedValue(roll)
      vi.mocked(repo.update).mockImplementation(async (r) => r)

      const result = await service.consumeLength(ROLL_UUID, 2000, actor)

      expect(repo.findById).toHaveBeenCalledWith(ROLL_UUID)
      expect(result.remainingLengthMm).toBe(48000)
      expect(result.status).toBe("active")
      expect(repo.update).toHaveBeenCalledWith(roll)
    })

    it("auto-flips status to depleted when consumed to zero", async () => {
      const roll = makeReceivedRoll({ remainingMm: 500 })
      vi.mocked(repo.findById).mockResolvedValue(roll)
      vi.mocked(repo.update).mockImplementation(async (r) => r)

      const result = await service.consumeLength(ROLL_UUID, 500, actor)
      expect(result.remainingLengthMm).toBe(0)
      expect(result.isDepleted).toBe(true)
    })

    it("propagates entity errors and does NOT persist on failure", async () => {
      const roll = makeReceivedRoll({ remainingMm: 500 })
      vi.mocked(repo.findById).mockResolvedValue(roll)

      await expect(service.consumeLength(ROLL_UUID, 1000, actor)).rejects.toThrow(
        /only 500mm remaining/
      )
      expect(repo.update).not.toHaveBeenCalled()
    })
  })

  describe("reserve / release", () => {
    it("reserve flips active → reserved and persists", async () => {
      const roll = makeReceivedRoll()
      vi.mocked(repo.findById).mockResolvedValue(roll)
      vi.mocked(repo.update).mockImplementation(async (r) => r)

      const result = await service.reserve(ROLL_UUID, actor)
      expect(result.isReserved).toBe(true)
      expect(repo.update).toHaveBeenCalledOnce()
    })

    it("release flips reserved → active and persists", async () => {
      const roll = makeReceivedRoll()
      roll.reserve(actor)
      vi.mocked(repo.findById).mockResolvedValue(roll)
      vi.mocked(repo.update).mockImplementation(async (r) => r)

      const result = await service.release(ROLL_UUID, actor)
      expect(result.isActive).toBe(true)
    })
  })

  describe("relocate / updateNotes", () => {
    it("relocate updates location and persists", async () => {
      const roll = makeReceivedRoll()
      vi.mocked(repo.findById).mockResolvedValue(roll)
      vi.mocked(repo.update).mockImplementation(async (r) => r)

      const result = await service.relocate(ROLL_UUID, "Bay C", actor)
      expect(result.location).toBe("Bay C")
    })

    it("updateNotes updates notes and persists", async () => {
      const roll = makeReceivedRoll()
      vi.mocked(repo.findById).mockResolvedValue(roll)
      vi.mocked(repo.update).mockImplementation(async (r) => r)

      const result = await service.updateNotes(ROLL_UUID, "scratched edge", actor)
      expect(result.notes).toBe("scratched edge")
    })
  })

  describe("recordBarcode / recordQrGenerated", () => {
    it("recordBarcode stores format + path + timestamp", async () => {
      const roll = makeReceivedRoll()
      vi.mocked(repo.findById).mockResolvedValue(roll)
      vi.mocked(repo.update).mockImplementation(async (r) => r)

      const result = await service.recordBarcode(
        ROLL_UUID,
        "code128",
        "roll-barcodes/2026/05/RF-000123.png",
        actor
      )
      expect(result.barcodeAssetPath).toBe("roll-barcodes/2026/05/RF-000123.png")
      expect(result.barcodeGeneratedAt).not.toBeNull()
    })

    it("recordQrGenerated bumps qrGeneratedAt", async () => {
      const roll = makeReceivedRoll()
      vi.mocked(repo.findById).mockResolvedValue(roll)
      vi.mocked(repo.update).mockImplementation(async (r) => r)

      const result = await service.recordQrGenerated(ROLL_UUID, actor)
      expect(result.qrGeneratedAt).not.toBeNull()
    })
  })

  describe("softDelete", () => {
    it("soft-deletes and persists", async () => {
      const roll = makeReceivedRoll()
      vi.mocked(repo.findById).mockResolvedValue(roll)
      vi.mocked(repo.update).mockImplementation(async (r) => r)

      const result = await service.softDelete(ROLL_UUID, actor)
      expect(result.isDeleted).toBe(true)
    })
  })
})

describe("getPublicRollByPartNumberOrId", () => {
  const ROLL = {
    id: "11111111-2222-3333-4444-555555555555",
    part_number: "RF-000123",
    material_type: "Butyl",
    width: 60,
    length: 240,
    thickness: 0.5,
    remaining_length: 180,
    status: "active" as const,
    color: "black",
    location: "Bay A",
    date_received: "2026-01-01",
    is_offcut: false,
    parent_roll_id: null,
  }

  it("looks up by part_number first", async () => {
    const client = makeFakeClient({
      tables: { rolls: { select: { data: [ROLL], error: null } } },
    })
    expect(await getPublicRollByPartNumberOrId(client, "RF-000123")).toEqual(ROLL)
  })

  it("returns null on empty input", async () => {
    const client = makeFakeClient({
      tables: { rolls: { select: { data: null, error: null } } },
    })
    expect(await getPublicRollByPartNumberOrId(client, "   ")).toBeNull()
  })

  it("returns null when not found and input isn't UUID-shaped", async () => {
    const client = makeFakeClient({
      tables: { rolls: { select: { data: null, error: null } } },
    })
    expect(await getPublicRollByPartNumberOrId(client, "not-a-uuid-name")).toBeNull()
  })
})
