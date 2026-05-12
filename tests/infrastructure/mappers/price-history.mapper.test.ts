import { describe, expect, it } from "vitest"

import { PriceHistory } from "@/src/entities/price-history"
import { Currency } from "@/src/entities/value-objects/currency"
import {
  MaterialSupplierId,
  PriceHistoryId,
  ProfileId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Money } from "@/src/entities/value-objects/money"
import {
  priceHistoryToInsertRow,
  rowToPriceHistory,
  type PriceHistoryRow,
} from "@/src/infrastructure/mappers/price-history.mapper"

const PH_UUID = "11111111-1111-4111-8111-111111111111"
const TENANT_UUID = "22222222-2222-4222-8222-222222222222"
const MS_UUID = "33333333-3333-4333-8333-333333333333"
const ACTOR_UUID = "44444444-4444-4444-8444-444444444444"
const USD = Currency.fromPersistence("USD")

const FULL_ROW: PriceHistoryRow = {
  id: PH_UUID,
  tenant_id: TENANT_UUID,
  material_supplier_id: MS_UUID,
  old_cost_per_sqm_cents: 5000,
  new_cost_per_sqm_cents: 5500,
  price_change_percentage: 10,
  change_reason: "supplier increase",
  effective_date: "2026-04-01",
  changed_by: ACTOR_UUID,
  notes: "Annual contract review",
  created_at: "2026-03-15T09:00:00.000Z",
}

describe("rowToPriceHistory", () => {
  it("hydrates every column into a PriceHistory entity", () => {
    const ph = rowToPriceHistory(FULL_ROW)
    expect(ph).toBeInstanceOf(PriceHistory)
    expect(ph.id.value).toBe(PH_UUID)
    expect(ph.tenantId.value).toBe(TENANT_UUID)
    expect(ph.materialSupplierId.value).toBe(MS_UUID)
    expect(ph.oldCost?.cents).toBe(5000)
    expect(ph.oldCost?.currency.value).toBe("USD")
    expect(ph.newCost.cents).toBe(5500)
    expect(ph.priceChangePercentage).toBe(10)
    expect(ph.changeReason).toBe("supplier increase")
    expect(ph.effectiveDate.toISOString().slice(0, 10)).toBe("2026-04-01")
    expect(ph.changedBy?.value).toBe(ACTOR_UUID)
    expect(ph.notes).toBe("Annual contract review")
    expect(ph.createdAt.toISOString()).toBe("2026-03-15T09:00:00.000Z")
  })

  it("handles first-ever price (oldCost null)", () => {
    const ph = rowToPriceHistory({
      ...FULL_ROW,
      old_cost_per_sqm_cents: null,
      price_change_percentage: null,
    })
    expect(ph.oldCost).toBeNull()
    expect(ph.isInitial).toBe(true)
    expect(ph.priceChangePercentage).toBeNull()
  })
})

describe("priceHistoryToInsertRow", () => {
  it("flattens an entity built via PriceHistory.create back to row shape", () => {
    const ph = PriceHistory.create(
      {
        id: PriceHistoryId.fromPersistence(PH_UUID),
        tenantId: TenantId.fromPersistence(TENANT_UUID),
        materialSupplierId: MaterialSupplierId.fromPersistence(MS_UUID),
        oldCost: Money.fromCents(5000, USD),
        newCost: Money.fromCents(5500, USD),
        changeReason: " supplier increase ",
        effectiveDate: new Date("2026-04-01T00:00:00.000Z"),
        changedBy: ProfileId.fromPersistence(ACTOR_UUID),
        notes: "Annual contract review",
      },
      new Date("2026-03-15T09:00:00.000Z")
    )

    const row = priceHistoryToInsertRow(ph)
    expect(row).toEqual({
      id: PH_UUID,
      tenant_id: TENANT_UUID,
      material_supplier_id: MS_UUID,
      old_cost_per_sqm_cents: 5000,
      new_cost_per_sqm_cents: 5500,
      // Entity computes the percentage from (5500 - 5000) / 5000 * 100 = 10
      price_change_percentage: 10,
      change_reason: "supplier increase",
      effective_date: "2026-04-01",
      changed_by: ACTOR_UUID,
      notes: "Annual contract review",
    })
  })

  it("inserts null oldCost and null percentage for first-ever price", () => {
    const ph = PriceHistory.create(
      {
        id: PriceHistoryId.fromPersistence(PH_UUID),
        tenantId: TenantId.fromPersistence(TENANT_UUID),
        materialSupplierId: MaterialSupplierId.fromPersistence(MS_UUID),
        oldCost: null,
        newCost: Money.fromCents(5500, USD),
        effectiveDate: new Date("2026-04-01T00:00:00.000Z"),
      },
      new Date("2026-03-15T09:00:00.000Z")
    )
    const row = priceHistoryToInsertRow(ph)
    expect(row.old_cost_per_sqm_cents).toBeNull()
    expect(row.price_change_percentage).toBeNull()
  })
})

describe("round-trip", () => {
  it("row → entity → insert row preserves persistence-relevant fields", () => {
    const ph = rowToPriceHistory(FULL_ROW)
    const row = priceHistoryToInsertRow(ph)
    expect(row.old_cost_per_sqm_cents).toBe(FULL_ROW.old_cost_per_sqm_cents)
    expect(row.new_cost_per_sqm_cents).toBe(FULL_ROW.new_cost_per_sqm_cents)
    expect(row.price_change_percentage).toBe(FULL_ROW.price_change_percentage)
    expect(row.effective_date).toBe(FULL_ROW.effective_date)
    expect(row.change_reason).toBe(FULL_ROW.change_reason)
    expect(row.notes).toBe(FULL_ROW.notes)
  })
})
