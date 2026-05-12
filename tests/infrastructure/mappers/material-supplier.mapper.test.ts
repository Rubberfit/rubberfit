import { describe, expect, it } from "vitest"

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
import {
  materialSupplierToInsertRow,
  materialSupplierToUpdateRow,
  rowToMaterialSupplier,
  type MaterialSupplierRow,
} from "@/src/infrastructure/mappers/material-supplier.mapper"

const LINK_UUID = "11111111-1111-4111-8111-111111111111"
const TENANT_UUID = "22222222-2222-4222-8222-222222222222"
const MATERIAL_TYPE_UUID = "33333333-3333-4333-8333-333333333333"
const SUPPLIER_UUID = "44444444-4444-4444-8444-444444444444"
const ACTOR_UUID = "55555555-5555-4555-8555-555555555555"

const FULL_ROW: MaterialSupplierRow = {
  id: LINK_UUID,
  tenant_id: TENANT_UUID,
  material_type_id: MATERIAL_TYPE_UUID,
  supplier_id: SUPPLIER_UUID,
  supplier_material_code: "AC-NEO-001",
  cost_per_sqm_cents: 5400,
  minimum_order_sqm: 10,
  lead_time_days: 14,
  preferred_supplier: true,
  active: true,
  notes: "primary neoprene supplier",
  effective_date: "2026-04-01",
  expiration_date: "2026-12-31",
  created_at: "2026-03-15T09:00:00.000Z",
  created_by: ACTOR_UUID,
  updated_at: "2026-04-05T17:00:00.000Z",
  updated_by: ACTOR_UUID,
  deleted_at: null,
}

describe("rowToMaterialSupplier", () => {
  it("hydrates every column into a MaterialSupplier entity", () => {
    const link = rowToMaterialSupplier(FULL_ROW)

    expect(link).toBeInstanceOf(MaterialSupplier)
    expect(link.id.value).toBe(LINK_UUID)
    expect(link.tenantId.value).toBe(TENANT_UUID)
    expect(link.materialTypeId.value).toBe(MATERIAL_TYPE_UUID)
    expect(link.supplierId.value).toBe(SUPPLIER_UUID)
    expect(link.cost.cents).toBe(5400)
    expect(link.cost.currency.value).toBe("USD")
    expect(link.supplierMaterialCode).toBe("AC-NEO-001")
    expect(link.minimumOrderSqm).toBe(10)
    expect(link.leadTimeDays).toBe(14)
    expect(link.preferredSupplier).toBe(true)
    expect(link.isActive).toBe(true)
    expect(link.notes).toBe("primary neoprene supplier")
    expect(link.effectiveDate.toISOString().slice(0, 10)).toBe("2026-04-01")
    expect(link.expirationDate?.toISOString().slice(0, 10)).toBe("2026-12-31")
    expect(link.createdAt.toISOString()).toBe("2026-03-15T09:00:00.000Z")
    expect(link.createdBy?.value).toBe(ACTOR_UUID)
    expect(link.deletedAt).toBeNull()
  })

  it("handles null expiration_date and nullables", () => {
    const link = rowToMaterialSupplier({
      ...FULL_ROW,
      supplier_material_code: null,
      notes: null,
      expiration_date: null,
      created_by: null,
      updated_by: null,
    })
    expect(link.supplierMaterialCode).toBeNull()
    expect(link.notes).toBeNull()
    expect(link.expirationDate).toBeNull()
    expect(link.createdBy).toBeNull()
    expect(link.updatedBy).toBeNull()
  })

  it("flags isDeleted when deleted_at is populated", () => {
    const link = rowToMaterialSupplier({
      ...FULL_ROW,
      deleted_at: "2026-05-01T00:00:00.000Z",
    })
    expect(link.isDeleted).toBe(true)
  })
})

describe("materialSupplierToInsertRow", () => {
  it("produces the persistence shape from MaterialSupplier.create", () => {
    const link = MaterialSupplier.create(
      {
        id: MaterialSupplierId.fromPersistence(LINK_UUID),
        tenantId: TenantId.fromPersistence(TENANT_UUID),
        materialTypeId: MaterialTypeId.fromPersistence(MATERIAL_TYPE_UUID),
        supplierId: SupplierId.fromPersistence(SUPPLIER_UUID),
        cost: Money.fromCents(5400, Currency.fromPersistence("USD")),
        effectiveDate: new Date("2026-04-01T00:00:00.000Z"),
        expirationDate: new Date("2026-12-31T00:00:00.000Z"),
        supplierMaterialCode: " AC-NEO-001 ",
        minimumOrderSqm: 10,
        leadTimeDays: 14,
        preferredSupplier: true,
        notes: "primary neoprene supplier",
        createdBy: ProfileId.fromPersistence(ACTOR_UUID),
      },
      new Date("2026-03-15T09:00:00.000Z")
    )

    const row = materialSupplierToInsertRow(link)

    expect(row).toEqual({
      id: LINK_UUID,
      tenant_id: TENANT_UUID,
      material_type_id: MATERIAL_TYPE_UUID,
      supplier_id: SUPPLIER_UUID,
      supplier_material_code: "AC-NEO-001",
      cost_per_sqm_cents: 5400,
      minimum_order_sqm: 10,
      lead_time_days: 14,
      preferred_supplier: true,
      active: true,
      notes: "primary neoprene supplier",
      effective_date: "2026-04-01",
      expiration_date: "2026-12-31",
      created_by: ACTOR_UUID,
    })
  })
})

describe("materialSupplierToUpdateRow", () => {
  it("captures audit fields after updatePricing", () => {
    const link = rowToMaterialSupplier(FULL_ROW)
    link.updatePricing(
      Money.fromCents(6200, Currency.fromPersistence("USD")),
      new Date("2026-05-01T00:00:00.000Z"),
      null,
      ProfileId.fromPersistence(ACTOR_UUID),
      new Date("2026-04-30T12:00:00.000Z")
    )

    const row = materialSupplierToUpdateRow(link)

    expect(row.cost_per_sqm_cents).toBe(6200)
    expect(row.effective_date).toBe("2026-05-01")
    expect(row.expiration_date).toBeNull()
    expect(row.updated_at).toBe("2026-04-30T12:00:00.000Z")
    expect(row.updated_by).toBe(ACTOR_UUID)
  })

  it("stamps deleted_at on soft delete", () => {
    const link = rowToMaterialSupplier(FULL_ROW)
    link.softDelete(ProfileId.fromPersistence(ACTOR_UUID), new Date("2026-05-11T12:00:00.000Z"))

    const row = materialSupplierToUpdateRow(link)
    expect(row.deleted_at).toBe("2026-05-11T12:00:00.000Z")
  })
})

describe("round-trip", () => {
  it("row → entity → update row preserves persistence-relevant fields", () => {
    const link = rowToMaterialSupplier(FULL_ROW)
    const row = materialSupplierToUpdateRow(link)

    expect(row.supplier_material_code).toBe(FULL_ROW.supplier_material_code)
    expect(row.cost_per_sqm_cents).toBe(FULL_ROW.cost_per_sqm_cents)
    expect(row.minimum_order_sqm).toBe(FULL_ROW.minimum_order_sqm)
    expect(row.lead_time_days).toBe(FULL_ROW.lead_time_days)
    expect(row.preferred_supplier).toBe(FULL_ROW.preferred_supplier)
    expect(row.active).toBe(FULL_ROW.active)
    expect(row.notes).toBe(FULL_ROW.notes)
    expect(row.effective_date).toBe(FULL_ROW.effective_date)
    expect(row.expiration_date).toBe(FULL_ROW.expiration_date)
  })
})
