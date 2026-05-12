import "reflect-metadata"
import { inject, injectable } from "tsyringe"

import type { IMaterialSupplierService } from "@/src/application/services/material-supplier.service.interface"
import type { IPriceHistoryService } from "@/src/application/services/price-history.service.interface"
import type { MaterialSupplier } from "@/src/entities/material-supplier"
import { Currency } from "@/src/entities/value-objects/currency"
import { ProfileId } from "@/src/entities/value-objects/id"
import { Money } from "@/src/entities/value-objects/money"
import { TOKENS } from "@/di/tokens"

export interface UpdateMaterialPricingInput {
  materialSupplierId: string
  newCostCents: number
  newEffectiveDate: Date
  newExpirationDate: Date | null
  changeReason?: string | null
  actorId: string
}

export interface UpdateMaterialPricingResult {
  materialSupplier: MaterialSupplier
}

export interface IUpdateMaterialPricingUseCase {
  execute(input: UpdateMaterialPricingInput): Promise<UpdateMaterialPricingResult>
}

/**
 * Orchestrates a real price change against a `material_suppliers` row.
 *
 * Loads the existing entity → captures the prior cost → calls
 * `materialSupplierService.updatePricing` (which validates the change
 * and stamps audit fields) → appends an entry to `price_history` so
 * the change is auditable.
 *
 * The two writes are NOT in a DB transaction. If the cost update
 * succeeds but the price-history append fails, the material_supplier
 * row has the new cost without a matching audit row — surfaced via
 * the thrown error so operators can manually backfill. Bringing them
 * under a transaction is a separate follow-up.
 */
@injectable()
export class UpdateMaterialPricingUseCase implements IUpdateMaterialPricingUseCase {
  private static readonly USD = Currency.fromPersistence("USD")

  constructor(
    @inject(TOKENS.IMaterialSupplierService)
    private readonly materialSupplierService: IMaterialSupplierService,
    @inject(TOKENS.IPriceHistoryService)
    private readonly priceHistoryService: IPriceHistoryService
  ) {}

  async execute(input: UpdateMaterialPricingInput): Promise<UpdateMaterialPricingResult> {
    const existing = await this.materialSupplierService.getById(input.materialSupplierId)
    const priorCostCents = existing.cost.cents

    const actor = ProfileId.fromPersistence(input.actorId)
    const newCost = Money.fromCents(input.newCostCents, UpdateMaterialPricingUseCase.USD)

    const updated = await this.materialSupplierService.updatePricing(
      input.materialSupplierId,
      newCost,
      input.newEffectiveDate,
      input.newExpirationDate,
      actor
    )

    await this.priceHistoryService.appendPriceChange({
      materialSupplierId: input.materialSupplierId,
      oldCostCents: priorCostCents,
      newCostCents: input.newCostCents,
      changeReason: input.changeReason ?? null,
      changedBy: input.actorId,
      effectiveDate: input.newEffectiveDate,
    })

    return { materialSupplier: updated }
  }
}
