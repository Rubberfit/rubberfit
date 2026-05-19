import "reflect-metadata"
import { randomUUID } from "node:crypto"
import { inject, injectable } from "tsyringe"

import type { IPriceHistoryRepository } from "@/src/application/repositories/price-history.repository.interface"
import type {
  IPriceHistoryService,
  PriceHistoryWithJoins,
} from "@/src/application/services/price-history.service.interface"
import { PriceHistory } from "@/src/entities/price-history"
import { Currency } from "@/src/entities/value-objects/currency"
import {
  MaterialSupplierId,
  PriceHistoryId,
  ProfileId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Money } from "@/src/entities/value-objects/money"
import { priceHistoryRepository } from "@/src/infrastructure/repositories/price-history.repository"
import { getCurrentUserId } from "@/src/infrastructure/services/getCurrentUserId"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"
import { TOKENS } from "@/di/tokens"

export type {
  BestPriceOption,
  PriceBulkChange,
  PriceComparison,
  PriceHistoryWithJoins,
  PriceTrend,
} from "@/src/application/services/price-history.service.interface"

const USD = Currency.fromPersistence("USD")

@injectable()
export class PriceHistoryService implements IPriceHistoryService {
  constructor(
    @inject(TOKENS.IPriceHistoryRepository)
    private readonly repo: IPriceHistoryRepository
  ) {}

  /**
   * Looks up `tenant_id` for a material_supplier and constructs a
   * `PriceHistory` entity, then persists it. Use-cases that already
   * have the parent entity in hand can call this directly; the
   * `materialSupplierId → tenantId` lookup is here so loose callers
   * don't have to thread it manually.
   */
  async appendPriceChange(input: {
    materialSupplierId: string
    oldCostCents: number | null
    newCostCents: number
    changeReason?: string | null
    changedBy?: string | null
    effectiveDate?: Date
    notes?: string | null
  }): Promise<PriceHistory> {
    const client = await getDatabaseClient()
    const { data: ms, error: msError } = await client
      .from("material_suppliers")
      .select("tenant_id")
      .eq("id", input.materialSupplierId)
      .single()
    if (msError) throw msError

    const tenantId = TenantId.fromPersistence((ms as { tenant_id: string }).tenant_id)
    const changedBy = input.changedBy ?? (await getCurrentUserId().catch(() => null))

    const entity = PriceHistory.create({
      id: PriceHistoryId.fromPersistence(randomUUID()),
      tenantId,
      materialSupplierId: MaterialSupplierId.fromPersistence(input.materialSupplierId),
      oldCost: input.oldCostCents !== null ? Money.fromCents(input.oldCostCents, USD) : null,
      newCost: Money.fromCents(input.newCostCents, USD),
      changeReason: input.changeReason ?? null,
      effectiveDate: input.effectiveDate,
      changedBy: changedBy ? ProfileId.fromPersistence(changedBy) : null,
      notes: input.notes ?? null,
    })

    return this.repo.insert(entity)
  }

  getHistoryFor(materialSupplierId: string, limit?: number): Promise<PriceHistory[]> {
    return this.repo.findByMaterialSupplier(materialSupplierId, limit)
  }

  getMaterialPriceHistory(
    materialTypeId: string,
    daysBack: number = 90
  ): Promise<PriceHistoryWithJoins[]> {
    return this.repo.findByMaterialType(materialTypeId, daysBack)
  }

  getPriceHistoryByDateRange(startDate: Date): Promise<PriceHistoryWithJoins[]> {
    return this.repo.findByDateRange(startDate)
  }

  getSignificantPriceChanges(
    thresholdPercentage: number = 5,
    daysBack: number = 7
  ): Promise<PriceHistoryWithJoins[]> {
    return this.repo.findSignificantChanges(thresholdPercentage, daysBack)
  }
}

/**
 * Module-level singleton bound to the concrete `priceHistoryRepository`.
 * DI-resolved consumers get a fresh instance via the container; both
 * share the same repository.
 */
export const priceHistoryService: IPriceHistoryService = new PriceHistoryService(
  priceHistoryRepository
)
