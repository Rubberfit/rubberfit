import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { container } from "tsyringe"

import type { IMaterialTypeRepository } from "@/src/application/repositories/material_types.repository.interface"
import type { IMaterialTypeService } from "@/src/application/services/material-type.service.interface"
import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { MaterialType } from "@/src/entities/material-type"
import { MaterialTypeId, ProfileId, TenantId } from "@/src/entities/value-objects/id"
import { MaterialTypeService } from "@/src/infrastructure/services/materialTypeService"
import { TOKENS } from "@/di/tokens"

const MT_UUID = "11111111-1111-4111-8111-111111111111"
const TENANT_UUID = "22222222-2222-4222-8222-222222222222"
const ACTOR_UUID = "44444444-4444-4444-8444-444444444444"

function makeMt(name = "Acrylic 3mm"): MaterialType {
  return MaterialType.create(
    {
      id: MaterialTypeId.fromPersistence(MT_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      name,
    },
    new Date("2026-04-21T09:00:00.000Z")
  )
}

function makeFakeRepo(): IMaterialTypeRepository {
  return {
    findAll: vi.fn(),
    findById: vi.fn(),
    findByIds: vi.fn(),
    insert: vi.fn(),
    updateEntity: vi.fn(),
    // legacy methods — present on the interface but not called by the new service
    getAll: vi.fn(),
    getByIds: vi.fn(),
    getNames: vi.fn(),
    getTopByCost: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }
}

describe("MaterialTypeService", () => {
  let repo: IMaterialTypeRepository
  let service: IMaterialTypeService
  const actor = ProfileId.fromPersistence(ACTOR_UUID)

  beforeEach(() => {
    container.clearInstances()
    repo = makeFakeRepo()
    container.registerInstance<IMaterialTypeRepository>(TOKENS.IMaterialTypesRepository, repo)
    service = container.resolve(MaterialTypeService)
  })

  describe("reads", () => {
    it("getAll delegates to repo.findAll", async () => {
      const rows = [makeMt()]
      vi.mocked(repo.findAll).mockResolvedValue(rows)
      expect(await service.getAll()).toBe(rows)
    })

    it("getById delegates to repo.findById", async () => {
      const mt = makeMt()
      vi.mocked(repo.findById).mockResolvedValue(mt)
      expect(await service.getById(MT_UUID)).toBe(mt)
    })

    it("getByIds delegates to repo.findByIds", async () => {
      vi.mocked(repo.findByIds).mockResolvedValue([])
      await service.getByIds(["a", "b"])
      expect(repo.findByIds).toHaveBeenCalledWith(["a", "b"])
    })
  })

  describe("createMaterialType", () => {
    it("builds via MaterialType.create and inserts", async () => {
      vi.mocked(repo.insert).mockImplementation(async (e) => e)
      const result = await service.createMaterialType({
        id: MaterialTypeId.fromPersistence(MT_UUID),
        tenantId: TenantId.fromPersistence(TENANT_UUID),
        name: "Acrylic",
      })
      expect(result.name).toBe("Acrylic")
      expect(repo.insert).toHaveBeenCalledOnce()
      expect(vi.mocked(repo.insert).mock.calls[0]![0]).toBeInstanceOf(MaterialType)
    })

    it("propagates InvalidEntityError for empty name", () => {
      expect(() =>
        service.createMaterialType({
          id: MaterialTypeId.fromPersistence(MT_UUID),
          tenantId: TenantId.fromPersistence(TENANT_UUID),
          name: " ",
        })
      ).toThrow(InvalidEntityError)
      expect(repo.insert).not.toHaveBeenCalled()
    })
  })

  describe("updateMaterialType", () => {
    it("loads, calls updateDetails, and persists via updateEntity", async () => {
      const mt = makeMt("Old")
      vi.mocked(repo.findById).mockResolvedValue(mt)
      vi.mocked(repo.updateEntity).mockImplementation(async (e) => e)

      const result = await service.updateMaterialType(
        MT_UUID,
        { name: "New", description: "updated", minStockSqm: 10 },
        actor
      )

      expect(result.name).toBe("New")
      expect(result.description).toBe("updated")
      expect(result.minStockSqm).toBe(10)
      expect(result.updatedBy?.value).toBe(ACTOR_UUID)
    })

    it("propagates InvalidEntityError on bad input (e.g. negative min stock)", async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeMt())
      await expect(
        service.updateMaterialType(
          MT_UUID,
          { name: "ok", description: null, minStockSqm: -1 },
          actor
        )
      ).rejects.toThrow(InvalidEntityError)
    })
  })

  describe("softDeleteMaterialType", () => {
    it("stamps deletedAt and persists", async () => {
      const mt = makeMt()
      vi.mocked(repo.findById).mockResolvedValue(mt)
      vi.mocked(repo.updateEntity).mockImplementation(async (e) => e)

      const result = await service.softDeleteMaterialType(MT_UUID, actor)
      expect(result.isDeleted).toBe(true)
    })
  })

  describe("error propagation", () => {
    it("does not swallow repo errors", async () => {
      vi.mocked(repo.findAll).mockRejectedValue(new Error("rls denied"))
      await expect(service.getAll()).rejects.toThrow("rls denied")
    })
  })
})
