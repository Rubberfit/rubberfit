import { describe, expect, it } from "vitest"

import { MaterialType } from "@/src/entities/material-type"
import { MaterialTypeId, ProfileId, TenantId } from "@/src/entities/value-objects/id"
import {
  materialTypeToInsertRow,
  materialTypeToUpdateRow,
  rowToMaterialType,
  type MaterialTypeRow,
} from "@/src/infrastructure/mappers/material-type.mapper"

const MT_UUID = "11111111-1111-4111-8111-111111111111"
const TENANT_UUID = "22222222-2222-4222-8222-222222222222"
const ACTOR_UUID = "44444444-4444-4444-8444-444444444444"

const FULL_ROW: MaterialTypeRow = {
  id: MT_UUID,
  tenant_id: TENANT_UUID,
  name: "Acrylic 3mm",
  description: "Cast acrylic sheet, clear",
  min_stock_sqm: 5,
  created_at: "2026-03-15T09:00:00.000Z",
  created_by: ACTOR_UUID,
  updated_at: "2026-04-05T17:00:00.000Z",
  updated_by: ACTOR_UUID,
  deleted_at: null,
}

describe("rowToMaterialType", () => {
  it("hydrates every column into a MaterialType entity", () => {
    const mt = rowToMaterialType(FULL_ROW)
    expect(mt).toBeInstanceOf(MaterialType)
    expect(mt.id.value).toBe(MT_UUID)
    expect(mt.tenantId.value).toBe(TENANT_UUID)
    expect(mt.name).toBe("Acrylic 3mm")
    expect(mt.description).toBe("Cast acrylic sheet, clear")
    expect(mt.minStockSqm).toBe(5)
    expect(mt.createdAt.toISOString()).toBe("2026-03-15T09:00:00.000Z")
    expect(mt.createdBy?.value).toBe(ACTOR_UUID)
    expect(mt.deletedAt).toBeNull()
  })

  it("handles nullables (description / min_stock_sqm / audit FKs)", () => {
    const mt = rowToMaterialType({
      ...FULL_ROW,
      description: null,
      min_stock_sqm: null,
      created_by: null,
      updated_by: null,
    })
    expect(mt.description).toBeNull()
    expect(mt.minStockSqm).toBeNull()
    expect(mt.createdBy).toBeNull()
    expect(mt.updatedBy).toBeNull()
  })

  it("flags isDeleted when deleted_at is populated", () => {
    const mt = rowToMaterialType({
      ...FULL_ROW,
      deleted_at: "2026-05-01T00:00:00.000Z",
    })
    expect(mt.isDeleted).toBe(true)
  })
})

describe("materialTypeToInsertRow", () => {
  it("produces the persistence shape from MaterialType.create", () => {
    const mt = MaterialType.create(
      {
        id: MaterialTypeId.fromPersistence(MT_UUID),
        tenantId: TenantId.fromPersistence(TENANT_UUID),
        name: "  Acrylic 3mm  ",
        description: " clear ",
        minStockSqm: 5,
        createdBy: ProfileId.fromPersistence(ACTOR_UUID),
      },
      new Date("2026-03-15T09:00:00.000Z")
    )

    const row = materialTypeToInsertRow(mt)
    expect(row).toEqual({
      id: MT_UUID,
      tenant_id: TENANT_UUID,
      name: "Acrylic 3mm",
      description: "clear",
      min_stock_sqm: 5,
      created_by: ACTOR_UUID,
    })
  })
})

describe("materialTypeToUpdateRow", () => {
  it("captures audit fields after updateDetails", () => {
    const mt = rowToMaterialType(FULL_ROW)
    mt.updateDetails(
      "Acrylic 4mm",
      "Updated",
      10,
      ProfileId.fromPersistence(ACTOR_UUID),
      new Date("2026-04-30T12:00:00.000Z")
    )

    const row = materialTypeToUpdateRow(mt)
    expect(row.name).toBe("Acrylic 4mm")
    expect(row.description).toBe("Updated")
    expect(row.min_stock_sqm).toBe(10)
    expect(row.updated_at).toBe("2026-04-30T12:00:00.000Z")
    expect(row.updated_by).toBe(ACTOR_UUID)
    expect(row.deleted_at).toBeNull()
  })

  it("stamps deleted_at on soft delete", () => {
    const mt = rowToMaterialType(FULL_ROW)
    mt.softDelete(ProfileId.fromPersistence(ACTOR_UUID), new Date("2026-05-11T12:00:00.000Z"))
    expect(materialTypeToUpdateRow(mt).deleted_at).toBe("2026-05-11T12:00:00.000Z")
  })
})

describe("round-trip", () => {
  it("row → entity → update row preserves persistence-relevant fields", () => {
    const mt = rowToMaterialType(FULL_ROW)
    const row = materialTypeToUpdateRow(mt)
    expect(row.name).toBe(FULL_ROW.name)
    expect(row.description).toBe(FULL_ROW.description)
    expect(row.min_stock_sqm).toBe(FULL_ROW.min_stock_sqm)
  })
})
