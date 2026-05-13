import { describe, expect, it } from "vitest"

import { PurchaseOrder } from "@/src/entities/purchase-order"
import { PurchaseOrderItem } from "@/src/entities/purchase-order-item"
import { Currency } from "@/src/entities/value-objects/currency"
import {
  MaterialTypeId,
  ProfileId,
  PurchaseOrderId,
  SupplierId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Money } from "@/src/entities/value-objects/money"
import {
  purchaseOrderItemToInsertRow,
  purchaseOrderItemToUpdateRow,
  purchaseOrderToInsertRow,
  purchaseOrderToUpdateRow,
  rowToPurchaseOrder,
  type PurchaseOrderItemRow,
  type PurchaseOrderRow,
} from "@/src/infrastructure/mappers/purchase-order.mapper"

const PO_UUID = "10000000-1000-4000-8000-aaaaaaaaaaa1"
const TENANT_UUID = "20000000-2000-4000-8000-aaaaaaaaaaa2"
const SUPPLIER_UUID = "30000000-3000-4000-8000-aaaaaaaaaaa3"
const MT_UUID_1 = "40000000-4000-4000-8000-aaaaaaaaaaa4"
const MT_UUID_2 = "50000000-5000-4000-8000-aaaaaaaaaaa5"
const ACTOR_UUID = "60000000-6000-4000-8000-aaaaaaaaaaa6"

const USD = Currency.fromPersistence("USD")

const PO_ROW: PurchaseOrderRow = {
  id: PO_UUID,
  tenant_id: TENANT_UUID,
  supplier_id: SUPPLIER_UUID,
  shipping_address_id: null,
  billing_address_id: null,
  reorder_rule_id: null,
  job_id: null,
  po_number: "PO-2026-0042",
  status: "approved",
  order_date: null,
  requested_delivery_date: "2026-06-01",
  actual_delivery_date: null,
  subtotal_cents: 12000,
  tax_amount_cents: 800,
  shipping_cost_cents: 500,
  total_amount_cents: 13300,
  payment_terms: "Net 30",
  notes: "Standard reorder",
  auto_generated: false,
  approved_by: ACTOR_UUID,
  approved_at: "2026-04-15T08:30:00.000Z",
  created_at: "2026-04-10T00:00:00.000Z",
  created_by: ACTOR_UUID,
  updated_at: "2026-04-15T08:30:00.000Z",
  updated_by: ACTOR_UUID,
  deleted_at: null,
}

const ITEM_ROW_1: PurchaseOrderItemRow = {
  id: "item-1",
  tenant_id: TENANT_UUID,
  purchase_order_id: PO_UUID,
  material_type_id: MT_UUID_1,
  line_number: 1,
  description: "Vinyl 60 inch",
  width_mm: 1524,
  length_mm: 50000,
  thickness_mm: 0.5,
  color: "black",
  quantity_sqm: 50,
  quantity_received_sqm: 0,
  unit_cost_cents: 200,
  line_total_cents: 10000,
  received_date: null,
  notes: null,
  created_at: "2026-04-10T00:00:00.000Z",
  created_by: ACTOR_UUID,
  updated_at: "2026-04-10T00:00:00.000Z",
  updated_by: null,
  deleted_at: null,
}

const ITEM_ROW_2: PurchaseOrderItemRow = {
  ...ITEM_ROW_1,
  id: "item-2",
  material_type_id: MT_UUID_2,
  line_number: 2,
  description: "Leather strap",
  quantity_sqm: 10,
  unit_cost_cents: 200,
  line_total_cents: 2000,
}

describe("rowToPurchaseOrder", () => {
  it("hydrates the aggregate including the items VO collection", () => {
    const po = rowToPurchaseOrder(PO_ROW, [ITEM_ROW_1, ITEM_ROW_2], USD)

    expect(po.id.value).toBe(PO_UUID)
    expect(po.tenantId.value).toBe(TENANT_UUID)
    expect(po.supplierId.value).toBe(SUPPLIER_UUID)
    expect(po.poNumber).toBe("PO-2026-0042")
    expect(po.status).toBe("approved")
    expect(po.subtotal.cents).toBe(12000)
    expect(po.taxAmount.cents).toBe(800)
    expect(po.shippingCost.cents).toBe(500)
    expect(po.totalAmount.cents).toBe(13300)
    expect(po.items.length).toBe(2)
    expect(po.items[0]?.lineNumber).toBe(1)
    expect(po.items[1]?.lineNumber).toBe(2)
    expect(po.items[0]?.quantitySqm).toBe(50)
    expect(po.items[0]?.unitCost.cents).toBe(200)
    expect(po.items[0]?.lineTotal.cents).toBe(10000)
  })

  it("handles a PO with no items (empty array)", () => {
    const po = rowToPurchaseOrder(
      { ...PO_ROW, subtotal_cents: 0, total_amount_cents: 1300 },
      [],
      USD
    )
    expect(po.items.length).toBe(0)
    expect(po.subtotal.cents).toBe(0)
  })
})

describe("purchaseOrderToInsertRow", () => {
  it("round-trips a freshly-created aggregate into an insert payload", () => {
    const po = PurchaseOrder.create({
      id: PurchaseOrderId.fromPersistence(PO_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      supplierId: SupplierId.fromPersistence(SUPPLIER_UUID),
      currency: USD,
      poNumber: "PO-2026-0050",
      createdBy: ProfileId.fromPersistence(ACTOR_UUID),
      items: [
        {
          lineNumber: 1,
          materialTypeId: MaterialTypeId.fromPersistence(MT_UUID_1),
          quantitySqm: 25,
          unitCost: Money.fromCents(200, USD),
        },
      ],
    })

    const row = purchaseOrderToInsertRow(po)
    expect(row.id).toBe(PO_UUID)
    expect(row.tenant_id).toBe(TENANT_UUID)
    expect(row.supplier_id).toBe(SUPPLIER_UUID)
    expect(row.po_number).toBe("PO-2026-0050")
    expect(row.status).toBe("draft")
    // 25 sqm × $2.00 = $50 = 5000 cents
    expect(row.subtotal_cents).toBe(5000)
    expect(row.total_amount_cents).toBe(5000)
    expect(row.created_by).toBe(ACTOR_UUID)
  })
})

describe("purchaseOrderToUpdateRow", () => {
  it("reflects entity status transition", () => {
    const po = rowToPurchaseOrder(PO_ROW, [ITEM_ROW_1], USD)
    const actor = ProfileId.fromPersistence(ACTOR_UUID)
    po.cancel(actor, new Date("2026-05-01T00:00:00.000Z"))

    const row = purchaseOrderToUpdateRow(po)
    expect(row.status).toBe("cancelled")
    expect(row.updated_at).toBe("2026-05-01T00:00:00.000Z")
    expect(row.updated_by).toBe(ACTOR_UUID)
  })
})

describe("purchaseOrderItemToInsertRow / UpdateRow", () => {
  it("emits insert payload with PO + tenant carried from parent", () => {
    const item = PurchaseOrderItem.create({
      lineNumber: 3,
      materialTypeId: MaterialTypeId.fromPersistence(MT_UUID_1),
      quantitySqm: 12,
      unitCost: Money.fromCents(150, USD),
    })
    const row = purchaseOrderItemToInsertRow(item, PO_UUID, TENANT_UUID)
    expect(row.purchase_order_id).toBe(PO_UUID)
    expect(row.tenant_id).toBe(TENANT_UUID)
    expect(row.line_number).toBe(3)
    expect(row.quantity_sqm).toBe(12)
    expect(row.unit_cost_cents).toBe(150)
    expect(row.line_total_cents).toBe(1800)
  })

  it("emits update payload with caller-supplied audit fields", () => {
    const item = PurchaseOrderItem.create({
      lineNumber: 1,
      materialTypeId: MaterialTypeId.fromPersistence(MT_UUID_1),
      quantitySqm: 10,
      unitCost: Money.fromCents(100, USD),
    })
    const row = purchaseOrderItemToUpdateRow(item, "2026-05-01T00:00:00.000Z", ACTOR_UUID)
    expect(row.updated_at).toBe("2026-05-01T00:00:00.000Z")
    expect(row.updated_by).toBe(ACTOR_UUID)
    expect(row.quantity_sqm).toBe(10)
  })
})
