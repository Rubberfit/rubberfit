import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { container } from "tsyringe"

import type { IMaterialSupplierService } from "@/src/application/services/material-supplier.service.interface"
import type { IPriceHistoryService } from "@/src/application/services/price-history.service.interface"
import { MaterialSupplier } from "@/src/entities/material-supplier"
import { Currency } from "@/src/entities/value-objects/currency"
import {
  MaterialSupplierId,
  MaterialTypeId,
  SupplierId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Money } from "@/src/entities/value-objects/money"
import { UpdateMaterialPricingUseCase } from "@/src/application/use-cases/pricing/update-material-pricing.use-case"
import { TOKENS } from "@/di/tokens"

const TENANT_UUID = "22222222-2222-4222-8222-222222222222"
const MS_UUID = "11111111-1111-4111-8111-111111111111"
const MT_UUID = "33333333-3333-4333-8333-333333333333"
const SUPPLIER_UUID = "44444444-4444-4444-8444-444444444444"
const ACTOR_UUID = "55555555-5555-4555-8555-555555555555"

const USD = Currency.fromPersistence("USD")

function makeLink(costCents = 5000): MaterialSupplier {
  return MaterialSupplier.create(
    {
      id: MaterialSupplierId.fromPersistence(MS_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      materialTypeId: MaterialTypeId.fromPersistence(MT_UUID),
      supplierId: SupplierId.fromPersistence(SUPPLIER_UUID),
      cost: Money.fromCents(costCents, USD),
      effectiveDate: new Date("2026-04-01T00:00:00.000Z"),
    },
    new Date("2026-03-15T09:00:00.000Z")
  )
}

function makeFakeMaterialSupplierService(): IMaterialSupplierService {
  return {
    getById: vi.fn(),
    getActiveLinks: vi.fn(),
    getByMaterialType: vi.fn(),
    getBySupplier: vi.fn(),
    getPreferredForMaterialType: vi.fn(),
    createLink: vi.fn(),
    updateDetails: vi.fn(),
    updatePricing: vi.fn(),
    updatePricingWindow: vi.fn(),
    deactivate: vi.fn(),
    reactivate: vi.fn(),
    softDelete: vi.fn(),
    setPreferredForMaterial: vi.fn(),
  }
}

function makeFakePriceHistoryService(): IPriceHistoryService {
  return {
    appendPriceChange: vi.fn(),
    getHistoryFor: vi.fn(),
    getMaterialPriceHistory: vi.fn(),
    getPriceHistoryByDateRange: vi.fn(),
    getSignificantPriceChanges: vi.fn(),
  }
}

describe("UpdateMaterialPricingUseCase", () => {
  let msService: IMaterialSupplierService
  let phService: IPriceHistoryService
  let useCase: UpdateMaterialPricingUseCase

  beforeEach(() => {
    container.clearInstances()
    msService = makeFakeMaterialSupplierService()
    phService = makeFakePriceHistoryService()
    container.registerInstance<IMaterialSupplierService>(TOKENS.IMaterialSupplierService, msService)
    container.registerInstance<IPriceHistoryService>(TOKENS.IPriceHistoryService, phService)
    useCase = container.resolve(UpdateMaterialPricingUseCase)
  })

  it("loads existing link, captures priorCost, updates pricing, then appends history", async () => {
    const before = makeLink(5000)
    const after = makeLink(6200)
    vi.mocked(msService.getById).mockResolvedValue(before)
    vi.mocked(msService.updatePricing).mockResolvedValue(after)

    const result = await useCase.execute({
      materialSupplierId: MS_UUID,
      newCostCents: 6200,
      newEffectiveDate: new Date("2026-05-01T00:00:00.000Z"),
      newExpirationDate: null,
      changeReason: "supplier annual review",
      actorId: ACTOR_UUID,
    })

    expect(result.materialSupplier).toBe(after)
    expect(msService.getById).toHaveBeenCalledWith(MS_UUID)

    // updatePricing called with the new cost and dates
    const updatePricingArgs = vi.mocked(msService.updatePricing).mock.calls[0]!
    expect(updatePricingArgs[0]).toBe(MS_UUID)
    expect(updatePricingArgs[1].cents).toBe(6200)
    expect(updatePricingArgs[1].currency.value).toBe("USD")
    expect(updatePricingArgs[2]).toEqual(new Date("2026-05-01T00:00:00.000Z"))
    expect(updatePricingArgs[3]).toBeNull()
    expect(updatePricingArgs[4].value).toBe(ACTOR_UUID)

    // priceHistoryService.appendPriceChange called AFTER updatePricing
    // with the prior cost captured before the update.
    expect(phService.appendPriceChange).toHaveBeenCalledWith({
      materialSupplierId: MS_UUID,
      oldCostCents: 5000,
      newCostCents: 6200,
      changeReason: "supplier annual review",
      changedBy: ACTOR_UUID,
      effectiveDate: new Date("2026-05-01T00:00:00.000Z"),
    })
  })

  it("propagates a failed updatePricing without touching price history", async () => {
    const before = makeLink(5000)
    vi.mocked(msService.getById).mockResolvedValue(before)
    vi.mocked(msService.updatePricing).mockRejectedValue(new Error("entity invariant"))

    await expect(
      useCase.execute({
        materialSupplierId: MS_UUID,
        newCostCents: 6200,
        newEffectiveDate: new Date("2026-05-01T00:00:00.000Z"),
        newExpirationDate: null,
        actorId: ACTOR_UUID,
      })
    ).rejects.toThrow("entity invariant")

    expect(phService.appendPriceChange).not.toHaveBeenCalled()
  })
})
