import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { container } from "tsyringe"

import { ReorderRule } from "@/src/entities/reorder-rule"
import {
  MaterialTypeId,
  ProfileId,
  ReorderRuleId,
  SupplierId,
  TenantId,
} from "@/src/entities/value-objects/id"
import type { IReorderRulesRepository } from "@/src/application/repositories/reorder-rules.repository.interface"
import type { IReorderService } from "@/src/application/services/reorder.service.interface"
import { ReorderService } from "@/src/infrastructure/services/reorderService"
import { TOKENS } from "@/di/tokens"

const RULE_UUID = "10000000-1000-4000-8000-100000000001"
const TENANT_UUID = "20000000-2000-4000-8000-200000000002"
const MT_UUID = "30000000-3000-4000-8000-300000000003"
const SUPPLIER_UUID = "40000000-4000-4000-8000-400000000004"
const ACTOR_UUID = "50000000-5000-4000-8000-500000000005"

function makeRule(): ReorderRule {
  return ReorderRule.create(
    {
      id: ReorderRuleId.fromPersistence(RULE_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      materialTypeId: MaterialTypeId.fromPersistence(MT_UUID),
      supplierId: SupplierId.fromPersistence(SUPPLIER_UUID),
      reorderPointSqm: 10,
      reorderQuantitySqm: 30,
      maxStockLevelSqm: 80,
      leadTimeDays: 7,
      safetyStockDays: 3,
      autoReorder: false,
      notes: null,
      createdBy: ProfileId.fromPersistence(ACTOR_UUID),
    },
    new Date("2026-04-01T00:00:00.000Z")
  )
}

function makeFakeRepo(): IReorderRulesRepository {
  return {
    findById: vi.fn(),
    findActive: vi.fn(),
    findByMaterialType: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  }
}

describe("ReorderService", () => {
  let repo: IReorderRulesRepository
  let service: IReorderService
  const actor = ProfileId.fromPersistence(ACTOR_UUID)

  beforeEach(() => {
    container.clearInstances()
    repo = makeFakeRepo()
    container.registerInstance<IReorderRulesRepository>(TOKENS.IReorderRulesRepository, repo)
    service = container.resolve(ReorderService)
  })

  describe("reads", () => {
    it("getRuleById delegates to repo.findById", async () => {
      const rule = makeRule()
      vi.mocked(repo.findById).mockResolvedValue(rule)
      await expect(service.getRuleById(RULE_UUID)).resolves.toBe(rule)
      expect(repo.findById).toHaveBeenCalledWith(RULE_UUID)
    })

    it("getActiveRules delegates to repo.findActive", async () => {
      const rules = [makeRule()]
      vi.mocked(repo.findActive).mockResolvedValue(rules)
      await expect(service.getActiveRules()).resolves.toBe(rules)
    })

    it("getRuleByMaterialType delegates with the material id", async () => {
      vi.mocked(repo.findByMaterialType).mockResolvedValue(null)
      await expect(service.getRuleByMaterialType(MT_UUID)).resolves.toBeNull()
      expect(repo.findByMaterialType).toHaveBeenCalledWith(MT_UUID)
    })
  })

  describe("createRule", () => {
    it("builds a ReorderRule via entity factory and persists it", async () => {
      const persisted = makeRule()
      vi.mocked(repo.insert).mockResolvedValue(persisted)

      const result = await service.createRule({
        id: ReorderRuleId.fromPersistence(RULE_UUID),
        tenantId: TenantId.fromPersistence(TENANT_UUID),
        materialTypeId: MaterialTypeId.fromPersistence(MT_UUID),
        supplierId: SupplierId.fromPersistence(SUPPLIER_UUID),
        reorderPointSqm: 10,
        reorderQuantitySqm: 30,
        maxStockLevelSqm: 80,
        actor,
      })

      expect(result).toBe(persisted)
      const inserted = vi.mocked(repo.insert).mock.calls[0]![0]
      expect(inserted).toBeInstanceOf(ReorderRule)
      expect(inserted.reorderPointSqm).toBe(10)
      expect(inserted.isActive).toBe(true)
      expect(inserted.createdBy?.value).toBe(ACTOR_UUID)
    })
  })

  describe("updateRule", () => {
    it("loads → mutates → persists", async () => {
      const rule = makeRule()
      vi.mocked(repo.findById).mockResolvedValue(rule)
      vi.mocked(repo.update).mockImplementation(async (r) => r)

      const updated = await service.updateRule(
        RULE_UUID,
        {
          supplierId: SupplierId.fromPersistence(SUPPLIER_UUID),
          reorderPointSqm: 15,
          reorderQuantitySqm: 35,
          maxStockLevelSqm: 90,
          leadTimeDays: 10,
          safetyStockDays: 4,
          notes: "bumped",
        },
        actor
      )

      expect(repo.findById).toHaveBeenCalledWith(RULE_UUID)
      expect(updated.reorderPointSqm).toBe(15)
      expect(updated.notes).toBe("bumped")
      expect(updated.updatedBy?.value).toBe(ACTOR_UUID)
      expect(repo.update).toHaveBeenCalledWith(rule)
    })

    it("propagates entity invariant violations and does NOT persist", async () => {
      const rule = makeRule()
      vi.mocked(repo.findById).mockResolvedValue(rule)

      await expect(
        service.updateRule(
          RULE_UUID,
          {
            supplierId: null,
            reorderPointSqm: 50,
            reorderQuantitySqm: 30,
            // CHECK: max must be > reorder point — 40 < 50 fails
            maxStockLevelSqm: 40,
            leadTimeDays: 7,
            safetyStockDays: 3,
            notes: null,
          },
          actor
        )
      ).rejects.toThrow(/maxStockLevelSqm/)
      expect(repo.update).not.toHaveBeenCalled()
    })
  })

  describe("enableAutoReorder / disableAutoReorder", () => {
    it("enable flips off → on and persists", async () => {
      const rule = makeRule()
      vi.mocked(repo.findById).mockResolvedValue(rule)
      vi.mocked(repo.update).mockImplementation(async (r) => r)

      const updated = await service.enableAutoReorder(RULE_UUID, actor)
      expect(updated.autoReorder).toBe(true)
      expect(repo.update).toHaveBeenCalledOnce()
    })

    it("disable is a no-op when already off (entity idempotence)", async () => {
      const rule = makeRule() // autoReorder defaults to false
      vi.mocked(repo.findById).mockResolvedValue(rule)
      vi.mocked(repo.update).mockImplementation(async (r) => r)

      const updated = await service.disableAutoReorder(RULE_UUID, actor)
      expect(updated.autoReorder).toBe(false)
    })
  })

  describe("deactivate / reactivate", () => {
    it("deactivate flips isActive off and persists", async () => {
      const rule = makeRule()
      vi.mocked(repo.findById).mockResolvedValue(rule)
      vi.mocked(repo.update).mockImplementation(async (r) => r)

      const updated = await service.deactivate(RULE_UUID, actor)
      expect(updated.isActive).toBe(false)
    })

    it("reactivate flips a deactivated rule back to active", async () => {
      const rule = makeRule()
      rule.deactivate(actor)
      vi.mocked(repo.findById).mockResolvedValue(rule)
      vi.mocked(repo.update).mockImplementation(async (r) => r)

      const updated = await service.reactivate(RULE_UUID, actor)
      expect(updated.isActive).toBe(true)
    })
  })

  describe("recordTrigger", () => {
    it("bumps lastTriggeredAt without touching updatedAt/updatedBy", async () => {
      const rule = makeRule()
      const originalUpdatedAt = rule.updatedAt
      const originalUpdatedBy = rule.updatedBy
      vi.mocked(repo.findById).mockResolvedValue(rule)
      vi.mocked(repo.update).mockImplementation(async (r) => r)

      const updated = await service.recordTrigger(RULE_UUID)
      expect(updated.lastTriggeredAt).not.toBeNull()
      expect(updated.updatedAt).toEqual(originalUpdatedAt)
      expect(updated.updatedBy).toEqual(originalUpdatedBy)
    })
  })

  describe("softDelete", () => {
    it("soft-deletes and persists", async () => {
      const rule = makeRule()
      vi.mocked(repo.findById).mockResolvedValue(rule)
      vi.mocked(repo.update).mockImplementation(async (r) => r)

      const updated = await service.softDelete(RULE_UUID, actor)
      expect(updated.isDeleted).toBe(true)
    })
  })
})
