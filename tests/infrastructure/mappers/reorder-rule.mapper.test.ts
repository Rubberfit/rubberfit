import { describe, expect, it } from "vitest"

import { ReorderRule } from "@/src/entities/reorder-rule"
import {
  MaterialTypeId,
  ProfileId,
  ReorderRuleId,
  SupplierId,
  TenantId,
} from "@/src/entities/value-objects/id"
import {
  reorderRuleToInsertRow,
  reorderRuleToUpdateRow,
  rowToReorderRule,
  type ReorderRuleRow,
} from "@/src/infrastructure/mappers/reorder-rule.mapper"

const RULE_UUID = "10000000-1000-4000-8000-100000000001"
const TENANT_UUID = "20000000-2000-4000-8000-200000000002"
const MT_UUID = "30000000-3000-4000-8000-300000000003"
const SUPPLIER_UUID = "40000000-4000-4000-8000-400000000004"
const ACTOR_UUID = "50000000-5000-4000-8000-500000000005"

const FULL_ROW: ReorderRuleRow = {
  id: RULE_UUID,
  tenant_id: TENANT_UUID,
  material_type_id: MT_UUID,
  supplier_id: SUPPLIER_UUID,
  reorder_point_sqm: 12.5,
  reorder_quantity_sqm: 40,
  max_stock_level_sqm: 100,
  lead_time_days: 14,
  safety_stock_days: 5,
  auto_reorder: true,
  active: true,
  notes: "Restock before Q3",
  last_triggered_at: "2026-04-15T08:30:00.000Z",
  created_at: "2026-01-01T00:00:00.000Z",
  created_by: ACTOR_UUID,
  updated_at: "2026-04-10T10:00:00.000Z",
  updated_by: ACTOR_UUID,
  deleted_at: null,
}

const MINIMAL_ROW: ReorderRuleRow = {
  id: RULE_UUID,
  tenant_id: TENANT_UUID,
  material_type_id: MT_UUID,
  supplier_id: null,
  reorder_point_sqm: 0,
  reorder_quantity_sqm: 25,
  max_stock_level_sqm: null,
  lead_time_days: 7,
  safety_stock_days: 3,
  auto_reorder: false,
  active: true,
  notes: null,
  last_triggered_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  created_by: null,
  updated_at: "2026-01-01T00:00:00.000Z",
  updated_by: null,
  deleted_at: null,
}

describe("rowToReorderRule", () => {
  it("hydrates every column of a fully-populated row", () => {
    const rule = rowToReorderRule(FULL_ROW)
    expect(rule.id.value).toBe(RULE_UUID)
    expect(rule.tenantId.value).toBe(TENANT_UUID)
    expect(rule.materialTypeId.value).toBe(MT_UUID)
    expect(rule.supplierId?.value).toBe(SUPPLIER_UUID)
    expect(rule.reorderPointSqm).toBe(12.5)
    expect(rule.reorderQuantitySqm).toBe(40)
    expect(rule.maxStockLevelSqm).toBe(100)
    expect(rule.leadTimeDays).toBe(14)
    expect(rule.safetyStockDays).toBe(5)
    expect(rule.autoReorder).toBe(true)
    expect(rule.isActive).toBe(true)
    expect(rule.notes).toBe("Restock before Q3")
    expect(rule.lastTriggeredAt?.toISOString()).toBe("2026-04-15T08:30:00.000Z")
    expect(rule.createdBy?.value).toBe(ACTOR_UUID)
    expect(rule.updatedBy?.value).toBe(ACTOR_UUID)
    expect(rule.deletedAt).toBeNull()
  })

  it("handles all nullable columns being null", () => {
    const rule = rowToReorderRule(MINIMAL_ROW)
    expect(rule.supplierId).toBeNull()
    expect(rule.maxStockLevelSqm).toBeNull()
    expect(rule.notes).toBeNull()
    expect(rule.lastTriggeredAt).toBeNull()
    expect(rule.createdBy).toBeNull()
    expect(rule.updatedBy).toBeNull()
    expect(rule.autoReorder).toBe(false)
  })
})

describe("reorderRuleToInsertRow", () => {
  it("round-trips a freshly-created entity into an insert payload", () => {
    const rule = ReorderRule.create({
      id: ReorderRuleId.fromPersistence(RULE_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      materialTypeId: MaterialTypeId.fromPersistence(MT_UUID),
      supplierId: SupplierId.fromPersistence(SUPPLIER_UUID),
      reorderPointSqm: 10,
      reorderQuantitySqm: 30,
      maxStockLevelSqm: 80,
      leadTimeDays: 10,
      safetyStockDays: 4,
      autoReorder: true,
      notes: "first build",
      createdBy: ProfileId.fromPersistence(ACTOR_UUID),
    })

    const row = reorderRuleToInsertRow(rule)
    expect(row.id).toBe(RULE_UUID)
    expect(row.tenant_id).toBe(TENANT_UUID)
    expect(row.material_type_id).toBe(MT_UUID)
    expect(row.supplier_id).toBe(SUPPLIER_UUID)
    expect(row.reorder_point_sqm).toBe(10)
    expect(row.reorder_quantity_sqm).toBe(30)
    expect(row.max_stock_level_sqm).toBe(80)
    expect(row.lead_time_days).toBe(10)
    expect(row.safety_stock_days).toBe(4)
    expect(row.auto_reorder).toBe(true)
    expect(row.active).toBe(true)
    expect(row.notes).toBe("first build")
    expect(row.created_by).toBe(ACTOR_UUID)
  })

  it("omits optional/null fields cleanly", () => {
    const rule = ReorderRule.create({
      id: ReorderRuleId.fromPersistence(RULE_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      materialTypeId: MaterialTypeId.fromPersistence(MT_UUID),
      reorderPointSqm: 0,
      reorderQuantitySqm: 5,
    })
    const row = reorderRuleToInsertRow(rule)
    expect(row.supplier_id).toBeNull()
    expect(row.max_stock_level_sqm).toBeNull()
    expect(row.notes).toBeNull()
    expect(row.created_by).toBeNull()
  })
})

describe("reorderRuleToUpdateRow", () => {
  it("reflects entity transitions in the update payload", () => {
    const rule = rowToReorderRule(FULL_ROW)
    const newActor = ProfileId.fromPersistence(ACTOR_UUID)

    rule.deactivate(newActor, new Date("2026-05-01T00:00:00.000Z"))
    const row = reorderRuleToUpdateRow(rule)

    expect(row.active).toBe(false)
    expect(row.updated_at).toBe("2026-05-01T00:00:00.000Z")
    expect(row.updated_by).toBe(ACTOR_UUID)
    // updateDetails wasn't called; other fields unchanged
    expect(row.reorder_point_sqm).toBe(12.5)
  })

  it("captures recordTrigger() bump on lastTriggeredAt without touching audit cols", () => {
    const rule = rowToReorderRule(FULL_ROW)
    const triggerTime = new Date("2026-05-10T16:00:00.000Z")
    rule.recordTrigger(triggerTime)
    const row = reorderRuleToUpdateRow(rule)
    expect(row.last_triggered_at).toBe("2026-05-10T16:00:00.000Z")
    // recordTrigger is a system event — it MUST NOT bump updated_at/by
    expect(row.updated_at).toBe(FULL_ROW.updated_at)
    expect(row.updated_by).toBe(ACTOR_UUID)
  })

  it("captures soft delete in the update payload", () => {
    const rule = rowToReorderRule(FULL_ROW)
    const deleter = ProfileId.fromPersistence(ACTOR_UUID)
    rule.softDelete(deleter, new Date("2026-06-01T00:00:00.000Z"))
    const row = reorderRuleToUpdateRow(rule)
    expect(row.deleted_at).toBe("2026-06-01T00:00:00.000Z")
  })
})
