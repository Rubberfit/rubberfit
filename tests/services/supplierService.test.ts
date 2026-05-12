import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { container } from "tsyringe"

import type { ISuppliersRepository } from "@/src/application/repositories/suppliers.repository.interface"
import type { ISupplierService } from "@/src/application/services/supplier.service.interface"
import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { Supplier } from "@/src/entities/supplier"
import { ProfileId, SupplierId, TenantId } from "@/src/entities/value-objects/id"
import { SupplierService } from "@/src/infrastructure/services/supplierService"
import { TOKENS } from "@/di/tokens"

const SUPPLIER_UUID = "11111111-1111-4111-8111-111111111111"
const TENANT_UUID = "22222222-2222-4222-8222-222222222222"
const ACTOR_UUID = "44444444-4444-4444-8444-444444444444"

function makeSupplier(overrides: { name?: string; preferred?: boolean } = {}): Supplier {
  return Supplier.create(
    {
      id: SupplierId.fromPersistence(SUPPLIER_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      name: overrides.name ?? "Acme",
      preferred: overrides.preferred ?? false,
    },
    new Date("2026-04-21T09:00:00.000Z")
  )
}

function makeFakeRepo(): ISuppliersRepository {
  return {
    findAll: vi.fn(),
    findActive: vi.fn(),
    findPreferred: vi.fn(),
    findById: vi.fn(),
    search: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  }
}

describe("SupplierService", () => {
  let repo: ISuppliersRepository
  let service: ISupplierService
  const actor = ProfileId.fromPersistence(ACTOR_UUID)

  beforeEach(() => {
    container.clearInstances()
    repo = makeFakeRepo()
    container.registerInstance<ISuppliersRepository>(TOKENS.ISuppliersRepository, repo)
    service = container.resolve(SupplierService)
  })

  describe("reads", () => {
    it("getAllSuppliers delegates to repo.findAll", async () => {
      const rows = [makeSupplier()]
      vi.mocked(repo.findAll).mockResolvedValue(rows)
      expect(await service.getAllSuppliers()).toBe(rows)
      expect(repo.findAll).toHaveBeenCalledOnce()
    })

    it("getActiveSuppliers delegates to repo.findActive", async () => {
      const rows = [makeSupplier()]
      vi.mocked(repo.findActive).mockResolvedValue(rows)
      expect(await service.getActiveSuppliers()).toBe(rows)
    })

    it("getPreferredSuppliers delegates to repo.findPreferred", async () => {
      vi.mocked(repo.findPreferred).mockResolvedValue([])
      expect(await service.getPreferredSuppliers()).toEqual([])
    })

    it("getSupplierById delegates to repo.findById with the same id", async () => {
      const s = makeSupplier()
      vi.mocked(repo.findById).mockResolvedValue(s)
      expect(await service.getSupplierById(SUPPLIER_UUID)).toBe(s)
      expect(repo.findById).toHaveBeenCalledWith(SUPPLIER_UUID)
    })

    it("searchSuppliers delegates to repo.search", async () => {
      vi.mocked(repo.search).mockResolvedValue([])
      await service.searchSuppliers("acme")
      expect(repo.search).toHaveBeenCalledWith("acme")
    })
  })

  describe("createSupplier", () => {
    it("builds the entity via Supplier.create and inserts it", async () => {
      vi.mocked(repo.insert).mockImplementation(async (s) => s)

      const result = await service.createSupplier({
        id: SupplierId.fromPersistence(SUPPLIER_UUID),
        tenantId: TenantId.fromPersistence(TENANT_UUID),
        name: "Cobra",
      })

      expect(result.name).toBe("Cobra")
      expect(repo.insert).toHaveBeenCalledOnce()
      expect(vi.mocked(repo.insert).mock.calls[0]![0]).toBeInstanceOf(Supplier)
    })

    it("propagates InvalidEntityError from Supplier.create before touching the repo", () => {
      // Supplier.create throws synchronously; the service does not catch.
      expect(() =>
        service.createSupplier({
          id: SupplierId.fromPersistence(SUPPLIER_UUID),
          tenantId: TenantId.fromPersistence(TENANT_UUID),
          name: " ",
        })
      ).toThrow(InvalidEntityError)
      expect(repo.insert).not.toHaveBeenCalled()
    })
  })

  describe("updateSupplier", () => {
    it("loads the entity, calls updateDetails, and persists via repo.update", async () => {
      const current = makeSupplier({ name: "Old Name" })
      vi.mocked(repo.findById).mockResolvedValue(current)
      vi.mocked(repo.update).mockImplementation(async (s) => s)

      const result = await service.updateSupplier(
        SUPPLIER_UUID,
        {
          name: "New Name",
          addressId: null,
          email: null,
          generalPhone: null,
          website: null,
          taxId: null,
          taxRate: null,
          taxExempt: false,
          paymentTerms: null,
          shippingCost: null,
          rating: null,
          preferred: true,
          notes: null,
        },
        actor
      )

      expect(result.name).toBe("New Name")
      expect(result.preferred).toBe(true)
      expect(result.updatedBy?.value).toBe(ACTOR_UUID)
      expect(repo.update).toHaveBeenCalledOnce()
    })
  })

  describe("deactivateSupplier", () => {
    it("flips isActive and persists", async () => {
      const current = makeSupplier()
      vi.mocked(repo.findById).mockResolvedValue(current)
      vi.mocked(repo.update).mockImplementation(async (s) => s)

      const result = await service.deactivateSupplier(SUPPLIER_UUID, actor)

      expect(result.isActive).toBe(false)
      expect(result.updatedBy?.value).toBe(ACTOR_UUID)
    })
  })

  describe("reactivateSupplier", () => {
    it("brings a deactivated supplier back to active", async () => {
      const s = makeSupplier()
      s.deactivate(actor, new Date("2026-04-22T00:00:00.000Z"))
      vi.mocked(repo.findById).mockResolvedValue(s)
      vi.mocked(repo.update).mockImplementation(async (entity) => entity)

      const result = await service.reactivateSupplier(SUPPLIER_UUID, actor)

      expect(result.isActive).toBe(true)
    })
  })

  describe("softDeleteSupplier", () => {
    it("stamps deletedAt and persists", async () => {
      const current = makeSupplier()
      vi.mocked(repo.findById).mockResolvedValue(current)
      vi.mocked(repo.update).mockImplementation(async (s) => s)

      const result = await service.softDeleteSupplier(SUPPLIER_UUID, actor)

      expect(result.isDeleted).toBe(true)
    })
  })

  describe("updateSupplierRating", () => {
    it("updates only the rating field via the entity mutator", async () => {
      const current = makeSupplier({ name: "ACME" })
      vi.mocked(repo.findById).mockResolvedValue(current)
      vi.mocked(repo.update).mockImplementation(async (s) => s)

      const result = await service.updateSupplierRating(SUPPLIER_UUID, 5, actor)

      expect(result.rating).toBe(5)
      expect(result.name).toBe("ACME")
    })

    it("propagates InvalidEntityError when rating is out of range", async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeSupplier())
      await expect(service.updateSupplierRating(SUPPLIER_UUID, 99, actor)).rejects.toThrow(
        InvalidEntityError
      )
    })
  })

  describe("error propagation", () => {
    it("does not swallow repo errors on reads", async () => {
      vi.mocked(repo.findActive).mockRejectedValue(new Error("rls denied"))
      await expect(service.getActiveSuppliers()).rejects.toThrow("rls denied")
    })

    it("does not swallow repo errors on writes", async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeSupplier())
      vi.mocked(repo.update).mockRejectedValue(new Error("network blip"))
      await expect(service.deactivateSupplier(SUPPLIER_UUID, actor)).rejects.toThrow("network blip")
    })
  })
})
