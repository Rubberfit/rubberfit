import "reflect-metadata"
import { injectable, inject } from "tsyringe"

import { ReorderRule, type ReorderRuleUpdateProps } from "@/src/entities/reorder-rule"
import type { ProfileId } from "@/src/entities/value-objects/id"
import type { IReorderRulesRepository } from "@/src/application/repositories/reorder-rules.repository.interface"
import type {
  CreateReorderRuleInput,
  IReorderService,
} from "@/src/application/services/reorder.service.interface"
import { TOKENS } from "@/di/tokens"

/**
 * Entity-typed orchestrator over `IReorderRulesRepository`. Each
 * mutator follows the load → entity-mutate → repo.update pattern.
 *
 * State-machine discipline (transition guards, idempotence, audit
 * stamping) lives in the `ReorderRule` entity. The service only wires
 * actor identity into the entity method and persists the result.
 */
@injectable()
export class ReorderService implements IReorderService {
  constructor(
    @inject(TOKENS.IReorderRulesRepository) private readonly repo: IReorderRulesRepository
  ) {}

  // ─── Reads ──────────────────────────────────────────────────────────────

  getRuleById(id: string): Promise<ReorderRule> {
    return this.repo.findById(id)
  }

  getActiveRules(): Promise<ReorderRule[]> {
    return this.repo.findActive()
  }

  getRuleByMaterialType(materialTypeId: string): Promise<ReorderRule | null> {
    return this.repo.findByMaterialType(materialTypeId)
  }

  // ─── Writes ─────────────────────────────────────────────────────────────

  createRule(input: CreateReorderRuleInput): Promise<ReorderRule> {
    const rule = ReorderRule.create({
      id: input.id,
      tenantId: input.tenantId,
      materialTypeId: input.materialTypeId,
      supplierId: input.supplierId ?? null,
      reorderPointSqm: input.reorderPointSqm,
      reorderQuantitySqm: input.reorderQuantitySqm,
      maxStockLevelSqm: input.maxStockLevelSqm,
      leadTimeDays: input.leadTimeDays,
      safetyStockDays: input.safetyStockDays,
      autoReorder: input.autoReorder,
      notes: input.notes,
      createdBy: input.actor,
    })
    return this.repo.insert(rule)
  }

  async updateRule(
    id: string,
    props: ReorderRuleUpdateProps,
    actor: ProfileId
  ): Promise<ReorderRule> {
    const rule = await this.repo.findById(id)
    rule.updateDetails(props, actor)
    return this.repo.update(rule)
  }

  async enableAutoReorder(id: string, actor: ProfileId): Promise<ReorderRule> {
    const rule = await this.repo.findById(id)
    rule.enableAutoReorder(actor)
    return this.repo.update(rule)
  }

  async disableAutoReorder(id: string, actor: ProfileId): Promise<ReorderRule> {
    const rule = await this.repo.findById(id)
    rule.disableAutoReorder(actor)
    return this.repo.update(rule)
  }

  async deactivate(id: string, actor: ProfileId): Promise<ReorderRule> {
    const rule = await this.repo.findById(id)
    rule.deactivate(actor)
    return this.repo.update(rule)
  }

  async reactivate(id: string, actor: ProfileId): Promise<ReorderRule> {
    const rule = await this.repo.findById(id)
    rule.reactivate(actor)
    return this.repo.update(rule)
  }

  async recordTrigger(id: string): Promise<ReorderRule> {
    const rule = await this.repo.findById(id)
    rule.recordTrigger()
    return this.repo.update(rule)
  }

  async softDelete(id: string, actor: ProfileId): Promise<ReorderRule> {
    const rule = await this.repo.findById(id)
    rule.softDelete(actor)
    return this.repo.update(rule)
  }
}
