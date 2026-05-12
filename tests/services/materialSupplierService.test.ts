import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { container } from "tsyringe"

import type { IMaterialSuppliersRepository } from "@/src/application/repositories/material_suppliers.repository.interface"
import type { IMaterialSupplierService } from "@/src/application/services/material-supplier.service.interface"
import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { MaterialSupplier } from "@/src/entities/material-supplier"
import {
  MaterialSupplierId,
  MaterialTypeId,
  ProfileId,
  SupplierId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Currency } from "@/src/entities/value-objects/currency"
import { Money } from "@/src/entities/value-objects/money"
import { MaterialSupplierService } from "@/src/infrastructure/services/materialSupplierService"
import { TOKENS } from "@/di/tokens"

const TENANT_UUID = "22222222-2222-4222-8222-222222222222"
const MATERIAL_TYPE_UUID = "33333333-3333-4333-8333-333333333333"
const SUPPLIER_A_UUID = "44444444-4444-4444-8444-444444444444"
const SUPPLIER_B_UUID = "44444444-4444-4444-8444-555555555555"
const ACTOR_UUID = "55555555-5555-4555-8555-555555555555"
const LINK_A_UUID = "11111111-1111-4111-8111-aaaaaaaaaaaa"
const LINK_B_UUID = "11111111-1111-4111-8111-bbbbbbbbbbbb"

const USD = Currency.fromPersistence("USD")

function makeLink(opts: { id: string; supplierId: string; preferred: boolean }): MaterialSupplier {
  return MaterialSupplier.create(
    {
      id: MaterialSupplierId.fromPersistence(opts.id),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      materialTypeId: MaterialTypeId.fromPersistence(MATERIAL_TYPE_UUID),
      supplierId: SupplierId.fromPersistence(opts.supplierId),
      cost: Money.fromCents(5000, USD),
      effectiveDate: new Date("2026-04-01T00:00:00.000Z"),
      preferredSupplier: opts.preferred,
    },
    new Date("2026-03-15T09:00:00.000Z")
  )
}

function makeFakeRepo(): IMaterialSuppliersRepository {
  return {
    findById: vi.fn(),
    findActive: vi.fn(),
    findByMaterialType: vi.fn(),
    findBySupplier: vi.fn(),
    findPreferredForMaterialType: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    getActiveWithDetails: vi.fn(),
  }
}

describe("MaterialSupplierService", () => {
  let repo: IMaterialSuppliersRepository
  let service: IMaterialSupplierService
  const actor = ProfileId.fromPersistence(ACTOR_UUID)

  beforeEach(() => {
    container.clearInstances()
    repo = makeFakeRepo()
    container.registerInstance<IMaterialSuppliersRepository>(
      TOKENS.IMaterialSuppliersRepository,
      repo
    )
    service = container.resolve(MaterialSupplierService)
  })

  describe("reads", () => {
    it("delegates getById to repo.findById", async () => {
      const link = makeLink({
        id: LINK_A_UUID,
        supplierId: SUPPLIER_A_UUID,
        preferred: false,
      })
      vi.mocked(repo.findById).mockResolvedValue(link)
      expect(await service.getById(LINK_A_UUID)).toBe(link)
      expect(repo.findById).toHaveBeenCalledWith(LINK_A_UUID)
    })

    it("delegates getByMaterialType", async () => {
      vi.mocked(repo.findByMaterialType).mockResolvedValue([])
      await service.getByMaterialType(MATERIAL_TYPE_UUID)
      expect(repo.findByMaterialType).toHaveBeenCalledWith(MATERIAL_TYPE_UUID)
    })

    it("delegates getPreferredForMaterialType", async () => {
      vi.mocked(repo.findPreferredForMaterialType).mockResolvedValue(null)
      expect(await service.getPreferredForMaterialType(MATERIAL_TYPE_UUID)).toBeNull()
    })
  })

  describe("createLink", () => {
    it("builds via MaterialSupplier.create and inserts", async () => {
      vi.mocked(repo.insert).mockImplementation(async (l) => l)
      const result = await service.createLink({
        id: MaterialSupplierId.fromPersistence(LINK_A_UUID),
        tenantId: TenantId.fromPersistence(TENANT_UUID),
        materialTypeId: MaterialTypeId.fromPersistence(MATERIAL_TYPE_UUID),
        supplierId: SupplierId.fromPersistence(SUPPLIER_A_UUID),
        cost: Money.fromCents(5000, USD),
        effectiveDate: new Date("2026-04-01T00:00:00.000Z"),
      })
      expect(result).toBeInstanceOf(MaterialSupplier)
      expect(repo.insert).toHaveBeenCalledOnce()
    })

    it("rejects zero-cost via the entity invariant", () => {
      expect(() =>
        service.createLink({
          id: MaterialSupplierId.fromPersistence(LINK_A_UUID),
          tenantId: TenantId.fromPersistence(TENANT_UUID),
          materialTypeId: MaterialTypeId.fromPersistence(MATERIAL_TYPE_UUID),
          supplierId: SupplierId.fromPersistence(SUPPLIER_A_UUID),
          cost: Money.fromCents(0, USD),
          effectiveDate: new Date("2026-04-01T00:00:00.000Z"),
        })
      ).toThrow(InvalidEntityError)
      expect(repo.insert).not.toHaveBeenCalled()
    })
  })

  describe("updatePricing", () => {
    it("calls the entity's updatePricing and persists", async () => {
      const link = makeLink({ id: LINK_A_UUID, supplierId: SUPPLIER_A_UUID, preferred: false })
      vi.mocked(repo.findById).mockResolvedValue(link)
      vi.mocked(repo.update).mockImplementation(async (l) => l)

      const result = await service.updatePricing(
        LINK_A_UUID,
        Money.fromCents(6500, USD),
        new Date("2026-05-01T00:00:00.000Z"),
        null,
        actor
      )

      expect(result.cost.cents).toBe(6500)
      expect(result.effectiveDate.toISOString().slice(0, 10)).toBe("2026-05-01")
    })

    it("propagates the entity's no-op-cost rejection", async () => {
      const link = makeLink({ id: LINK_A_UUID, supplierId: SUPPLIER_A_UUID, preferred: false })
      vi.mocked(repo.findById).mockResolvedValue(link)

      await expect(
        service.updatePricing(
          LINK_A_UUID,
          link.cost,
          new Date("2026-05-01T00:00:00.000Z"),
          null,
          actor
        )
      ).rejects.toThrow(InvalidEntityError)
    })
  })

  describe("updatePricingWindow", () => {
    it("adjusts dates without touching cost", async () => {
      const link = makeLink({ id: LINK_A_UUID, supplierId: SUPPLIER_A_UUID, preferred: false })
      vi.mocked(repo.findById).mockResolvedValue(link)
      vi.mocked(repo.update).mockImplementation(async (l) => l)

      const newExpiration = new Date("2027-04-01T00:00:00.000Z")
      const result = await service.updatePricingWindow(
        LINK_A_UUID,
        link.effectiveDate,
        newExpiration,
        actor
      )

      expect(result.cost.cents).toBe(link.cost.cents)
      expect(result.expirationDate?.toISOString().slice(0, 10)).toBe("2027-04-01")
    })
  })

  describe("setPreferredForMaterial", () => {
    it("flips the current preferred(s) off and the target on", async () => {
      const a = makeLink({ id: LINK_A_UUID, supplierId: SUPPLIER_A_UUID, preferred: true })
      const b = makeLink({ id: LINK_B_UUID, supplierId: SUPPLIER_B_UUID, preferred: false })

      vi.mocked(repo.findByMaterialType).mockResolvedValue([a, b])
      vi.mocked(repo.update).mockImplementation(async (l) => l)

      const result = await service.setPreferredForMaterial(
        MATERIAL_TYPE_UUID,
        SUPPLIER_B_UUID,
        actor
      )

      expect(result.supplierId.value).toBe(SUPPLIER_B_UUID)
      expect(result.preferredSupplier).toBe(true)
      expect(a.preferredSupplier).toBe(false)
      // Two writes: one flipping A off, one flipping B on.
      expect(repo.update).toHaveBeenCalledTimes(2)
    })

    it("returns the target idempotently when it is already preferred", async () => {
      const a = makeLink({ id: LINK_A_UUID, supplierId: SUPPLIER_A_UUID, preferred: true })

      vi.mocked(repo.findByMaterialType).mockResolvedValue([a])
      vi.mocked(repo.update).mockImplementation(async (l) => l)

      const result = await service.setPreferredForMaterial(
        MATERIAL_TYPE_UUID,
        SUPPLIER_A_UUID,
        actor
      )

      expect(result).toBe(a)
      expect(repo.update).not.toHaveBeenCalled()
    })

    it("throws when no link exists for the (material, supplier) pair", async () => {
      vi.mocked(repo.findByMaterialType).mockResolvedValue([])
      await expect(
        service.setPreferredForMaterial(MATERIAL_TYPE_UUID, SUPPLIER_A_UUID, actor)
      ).rejects.toThrow(InvalidEntityError)
    })
  })

  describe("deactivate / softDelete", () => {
    it("deactivate flips isActive and persists", async () => {
      const link = makeLink({ id: LINK_A_UUID, supplierId: SUPPLIER_A_UUID, preferred: false })
      vi.mocked(repo.findById).mockResolvedValue(link)
      vi.mocked(repo.update).mockImplementation(async (l) => l)

      const result = await service.deactivate(LINK_A_UUID, actor)
      expect(result.isActive).toBe(false)
    })

    it("softDelete stamps deletedAt", async () => {
      const link = makeLink({ id: LINK_A_UUID, supplierId: SUPPLIER_A_UUID, preferred: false })
      vi.mocked(repo.findById).mockResolvedValue(link)
      vi.mocked(repo.update).mockImplementation(async (l) => l)

      const result = await service.softDelete(LINK_A_UUID, actor)
      expect(result.isDeleted).toBe(true)
    })
  })
})
