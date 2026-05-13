import { describe, expect, it } from "vitest"

import { Roll } from "@/src/entities/roll"
import { Currency } from "@/src/entities/value-objects/currency"
import {
  CutHistoryId,
  MaterialTypeId,
  ProfileId,
  RollId,
  SupplierId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Money } from "@/src/entities/value-objects/money"
import {
  rollToInsertRow,
  rollToUpdateRow,
  rowToRoll,
  type RollRow,
} from "@/src/infrastructure/mappers/roll.mapper"

const ROLL_UUID = "11111111-1111-4111-8111-111111111111"
const TENANT_UUID = "22222222-2222-4222-8222-222222222222"
const MT_UUID = "33333333-3333-4333-8333-333333333333"
const SUPPLIER_UUID = "44444444-4444-4444-8444-444444444444"
const PARENT_UUID = "55555555-5555-4555-8555-555555555555"
const CUT_UUID = "66666666-6666-4666-8666-666666666666"
const ACTOR_UUID = "77777777-7777-4777-8777-777777777777"
const USD = Currency.fromPersistence("USD")

const RECEIVED_ROW: RollRow = {
  id: ROLL_UUID,
  tenant_id: TENANT_UUID,
  material_type_id: MT_UUID,
  supplier_id: SUPPLIER_UUID,
  source_type: "received",
  parent_roll_id: null,
  source_cut_history_id: null,
  purchase_order_item_id: null,
  width_mm: 1500,
  length_mm: 50000,
  remaining_length_mm: 42000,
  thickness_mm: 0.5,
  color: "black",
  location: "Bay A",
  date_received: "2026-04-01",
  cost_per_sqm_cents: 5400,
  status: "active",
  notes: "primary neoprene roll",
  qr_generated_at: null,
  barcode_format: "code128",
  barcode_asset_path: "roll-barcodes/2026/04/RF-000001.png",
  barcode_generated_at: "2026-04-02T08:00:00.000Z",
  created_at: "2026-04-01T09:00:00.000Z",
  created_by: ACTOR_UUID,
  updated_at: "2026-04-05T17:00:00.000Z",
  updated_by: ACTOR_UUID,
  deleted_at: null,
}

const OFFCUT_ROW: RollRow = {
  id: "88888888-8888-4888-8888-888888888888",
  tenant_id: TENANT_UUID,
  material_type_id: MT_UUID,
  supplier_id: SUPPLIER_UUID,
  source_type: "offcut",
  parent_roll_id: PARENT_UUID,
  source_cut_history_id: CUT_UUID,
  purchase_order_item_id: null,
  width_mm: 800,
  length_mm: 1200,
  remaining_length_mm: 1200,
  thickness_mm: 0.5,
  color: null,
  location: null,
  date_received: "2026-04-08",
  cost_per_sqm_cents: null,
  status: "active",
  notes: null,
  qr_generated_at: null,
  barcode_format: "code128",
  barcode_asset_path: null,
  barcode_generated_at: null,
  created_at: "2026-04-08T11:00:00.000Z",
  created_by: ACTOR_UUID,
  updated_at: "2026-04-08T11:00:00.000Z",
  updated_by: null,
  deleted_at: null,
}

describe("rowToRoll", () => {
  it("hydrates every column into a Roll entity (received)", () => {
    const roll = rowToRoll(RECEIVED_ROW)
    expect(roll).toBeInstanceOf(Roll)
    expect(roll.id.value).toBe(ROLL_UUID)
    expect(roll.tenantId.value).toBe(TENANT_UUID)
    expect(roll.materialTypeId.value).toBe(MT_UUID)
    expect(roll.supplierId?.value).toBe(SUPPLIER_UUID)
    expect(roll.sourceType).toBe("received")
    expect(roll.parentRollId).toBeNull()
    expect(roll.sourceCutHistoryId).toBeNull()
    expect(roll.widthMm).toBe(1500)
    expect(roll.lengthMm).toBe(50000)
    expect(roll.remainingLengthMm).toBe(42000)
    expect(roll.thicknessMm).toBe(0.5)
    expect(roll.color).toBe("black")
    expect(roll.location).toBe("Bay A")
    expect(roll.dateReceived.toISOString().slice(0, 10)).toBe("2026-04-01")
    expect(roll.cost?.cents).toBe(5400)
    expect(roll.cost?.currency.value).toBe("USD")
    expect(roll.status).toBe("active")
    expect(roll.notes).toBe("primary neoprene roll")
    expect(roll.barcodeFormat).toBe("code128")
    expect(roll.barcodeAssetPath).toBe("roll-barcodes/2026/04/RF-000001.png")
    expect(roll.barcodeGeneratedAt?.toISOString()).toBe("2026-04-02T08:00:00.000Z")
    expect(roll.createdBy?.value).toBe(ACTOR_UUID)
    expect(roll.updatedBy?.value).toBe(ACTOR_UUID)
    expect(roll.deletedAt).toBeNull()
  })

  it("hydrates offcut lineage fields", () => {
    const roll = rowToRoll(OFFCUT_ROW)
    expect(roll.sourceType).toBe("offcut")
    expect(roll.parentRollId?.value).toBe(PARENT_UUID)
    expect(roll.sourceCutHistoryId?.value).toBe(CUT_UUID)
    expect(roll.isOffcut).toBe(true)
    expect(roll.cost).toBeNull()
  })

  it("handles depleted rolls with null supplier and deleted_at set", () => {
    const roll = rowToRoll({
      ...RECEIVED_ROW,
      supplier_id: null,
      status: "depleted",
      remaining_length_mm: 0,
      deleted_at: "2026-05-01T12:00:00.000Z",
    })
    expect(roll.supplierId).toBeNull()
    expect(roll.isDepleted).toBe(true)
    expect(roll.isDeleted).toBe(true)
  })
})

describe("rollToInsertRow", () => {
  it("flattens a Roll entity built via Roll.create back to row shape", () => {
    const roll = Roll.create(
      {
        id: RollId.fromPersistence(ROLL_UUID),
        tenantId: TenantId.fromPersistence(TENANT_UUID),
        materialTypeId: MaterialTypeId.fromPersistence(MT_UUID),
        supplierId: SupplierId.fromPersistence(SUPPLIER_UUID),
        sourceType: "received",
        widthMm: 1500,
        lengthMm: 50000,
        thicknessMm: 0.5,
        color: "  black  ",
        location: "Bay A",
        dateReceived: new Date("2026-04-01T00:00:00.000Z"),
        cost: Money.fromCents(5400, USD),
        notes: "primary neoprene roll",
        createdBy: ProfileId.fromPersistence(ACTOR_UUID),
      },
      new Date("2026-04-01T09:00:00.000Z")
    )

    const row = rollToInsertRow(roll)
    expect(row).toEqual({
      id: ROLL_UUID,
      tenant_id: TENANT_UUID,
      material_type_id: MT_UUID,
      supplier_id: SUPPLIER_UUID,
      source_type: "received",
      parent_roll_id: null,
      source_cut_history_id: null,
      purchase_order_item_id: null,
      width_mm: 1500,
      length_mm: 50000,
      remaining_length_mm: 50000,
      thickness_mm: 0.5,
      color: "black",
      location: "Bay A",
      date_received: "2026-04-01",
      cost_per_sqm_cents: 5400,
      status: "active",
      notes: "primary neoprene roll",
      barcode_format: "code128",
      created_by: ACTOR_UUID,
    })
  })

  it("inserts offcut with lineage fields set", () => {
    const roll = Roll.create(
      {
        id: RollId.fromPersistence("88888888-8888-4888-8888-888888888888"),
        tenantId: TenantId.fromPersistence(TENANT_UUID),
        materialTypeId: MaterialTypeId.fromPersistence(MT_UUID),
        supplierId: SupplierId.fromPersistence(SUPPLIER_UUID),
        sourceType: "offcut",
        parentRollId: RollId.fromPersistence(PARENT_UUID),
        sourceCutHistoryId: CutHistoryId.fromPersistence(CUT_UUID),
        widthMm: 800,
        lengthMm: 1200,
        thicknessMm: 0.5,
        dateReceived: new Date("2026-04-08T00:00:00.000Z"),
      },
      new Date("2026-04-08T11:00:00.000Z")
    )
    const row = rollToInsertRow(roll)
    expect(row.source_type).toBe("offcut")
    expect(row.parent_roll_id).toBe(PARENT_UUID)
    expect(row.source_cut_history_id).toBe(CUT_UUID)
    expect(row.cost_per_sqm_cents).toBeNull()
  })
})

describe("rollToUpdateRow", () => {
  it("captures the mutator-driven mutable fields", () => {
    const roll = rowToRoll(RECEIVED_ROW)
    roll.consumeLength(
      2000,
      ProfileId.fromPersistence(ACTOR_UUID),
      new Date("2026-04-10T10:00:00.000Z")
    )
    const row = rollToUpdateRow(roll)
    expect(row.remaining_length_mm).toBe(40000)
    expect(row.status).toBe("active")
    expect(row.location).toBe("Bay A")
    expect(row.notes).toBe("primary neoprene roll")
    expect(row.updated_at).toBe("2026-04-10T10:00:00.000Z")
    expect(row.updated_by).toBe(ACTOR_UUID)
    expect(row.deleted_at).toBeNull()
  })

  it("flips status to depleted when consumeLength brings remaining to zero", () => {
    const roll = rowToRoll({ ...RECEIVED_ROW, remaining_length_mm: 100 })
    roll.consumeLength(100, ProfileId.fromPersistence(ACTOR_UUID))
    const row = rollToUpdateRow(roll)
    expect(row.remaining_length_mm).toBe(0)
    expect(row.status).toBe("depleted")
  })
})

describe("round-trip", () => {
  it("row → entity → insert row preserves persistence-relevant fields", () => {
    const roll = rowToRoll(RECEIVED_ROW)
    const row = rollToInsertRow(roll)
    expect(row.width_mm).toBe(RECEIVED_ROW.width_mm)
    expect(row.length_mm).toBe(RECEIVED_ROW.length_mm)
    expect(row.remaining_length_mm).toBe(RECEIVED_ROW.remaining_length_mm)
    expect(row.thickness_mm).toBe(RECEIVED_ROW.thickness_mm)
    expect(row.cost_per_sqm_cents).toBe(RECEIVED_ROW.cost_per_sqm_cents)
    expect(row.date_received).toBe(RECEIVED_ROW.date_received)
    expect(row.source_type).toBe(RECEIVED_ROW.source_type)
    expect(row.color).toBe(RECEIVED_ROW.color)
    expect(row.location).toBe(RECEIVED_ROW.location)
  })
})
