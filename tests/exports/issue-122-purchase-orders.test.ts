/**
 * Regression tests for the Purchase Orders half of GitHub issue #122 — the
 * Export button on `app/dashboard/inventory/purchase-orders/page.tsx` had no
 * `onClick`, so clicking it did nothing. Pure-helper coverage for the new
 * `buildPurchaseOrdersCsv` and `buildPurchaseOrdersPdfHtml` data shapers.
 */
import { describe, expect, it } from "vitest"

import {
  buildPurchaseOrdersCsv,
  buildPurchaseOrdersPdfHtml,
  type PurchaseOrdersExportInput,
} from "@/app/dashboard/inventory/purchase-orders/_components/po-export-utils"
import type { PurchaseOrderWithDetails } from "@/src/infrastructure/models/supabase"

function makePO(overrides: Partial<PurchaseOrderWithDetails>): PurchaseOrderWithDetails {
  return {
    id: "po-1",
    user_id: "u",
    po_number: "PO-0001",
    supplier_id: "s-1",
    status: "ordered",
    order_date: "2026-04-20T00:00:00Z",
    requested_delivery_date: "2026-04-30T00:00:00Z",
    actual_delivery_date: undefined,
    subtotal: 1000,
    tax_amount: 80,
    shipping_cost: 20,
    total_amount: 1100,
    notes: "Rush job",
    auto_generated: false,
    created_at: "2026-04-20T00:00:00Z",
    updated_at: "2026-04-20T00:00:00Z",
    supplier: { id: "s-1", name: "Acme Rubber" } as PurchaseOrderWithDetails["supplier"],
    items_count: 3,
    ...overrides,
  } as PurchaseOrderWithDetails
}

const FIXTURE: PurchaseOrdersExportInput = {
  pos: [
    makePO({ po_number: "PO-0001", status: "ordered", total_amount: 1100 }),
    makePO({
      id: "po-2",
      po_number: "PO-0002",
      status: "received",
      total_amount: 540,
      supplier: { id: "s-2", name: "Bay Polymers" } as PurchaseOrderWithDetails["supplier"],
      items_count: 1,
    }),
  ],
  filters: { status: "all", supplier: "all", search: "" },
  stats: { total: 2, totalValue: 1640, draft: 0, pending: 0, ordered: 1, received: 1 },
}

describe("buildPurchaseOrdersCsv", () => {
  it("emits the documented twelve-column header", () => {
    const result = buildPurchaseOrdersCsv(FIXTURE)
    expect(result.headers).toEqual([
      "PO Number",
      "Supplier",
      "Status",
      "Order Date",
      "Requested Delivery",
      "Actual Delivery",
      "Items",
      "Subtotal",
      "Tax",
      "Shipping",
      "Total",
      "Notes",
    ])
    expect(result.filename).toBe("purchase-orders")
  })

  it("emits one row per PO with shaped values", () => {
    const { rows } = buildPurchaseOrdersCsv(FIXTURE)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual([
      "PO-0001",
      "Acme Rubber",
      "ordered",
      "2026-04-20",
      "2026-04-30",
      "",
      3,
      "1000.00",
      "80.00",
      "20.00",
      "1100.00",
      "Rush job",
    ])
  })

  it("falls back to items.length when items_count is missing", () => {
    const input: PurchaseOrdersExportInput = {
      ...FIXTURE,
      pos: [
        makePO({
          po_number: "PO-NO-COUNT",
          items_count: undefined,
          items: [
            { id: "i1" } as PurchaseOrderWithDetails["items"] extends infer T
              ? T extends Array<infer U>
                ? U
                : never
              : never,
            { id: "i2" } as PurchaseOrderWithDetails["items"] extends infer T
              ? T extends Array<infer U>
                ? U
                : never
              : never,
          ],
        }),
      ],
    }
    const { rows } = buildPurchaseOrdersCsv(input)
    expect(rows[0][6]).toBe(2)
  })

  it("emits zero rows when there are no POs but keeps headers", () => {
    const empty: PurchaseOrdersExportInput = { ...FIXTURE, pos: [] }
    const result = buildPurchaseOrdersCsv(empty)
    expect(result.rows).toEqual([])
    expect(result.headers).toHaveLength(12)
  })

  it("neutralizes CSV formula injection in user-controlled string cells", () => {
    const malicious = makePO({
      po_number: "=cmd|' /C calc'!A1",
      status: "@evil" as unknown as PurchaseOrderWithDetails["status"],
      notes: "+SUM(A1:A2)",
      supplier: { id: "s-x", name: "-Acme" } as PurchaseOrderWithDetails["supplier"],
    })
    const input: PurchaseOrdersExportInput = { ...FIXTURE, pos: [malicious] }
    const { rows } = buildPurchaseOrdersCsv(input)
    // Each formula-prefix character ( = + - @ \t \r ) gets a leading
    // single-quote so spreadsheet apps render the cell as text.
    expect(rows[0][0]).toBe("'=cmd|' /C calc'!A1")
    expect(rows[0][1]).toBe("'-Acme")
    expect(rows[0][2]).toBe("'@evil")
    expect(rows[0][11]).toBe("'+SUM(A1:A2)")
  })

  it("coerces null monetary fields to 0.00 instead of throwing", () => {
    const partialPo = makePO({
      po_number: "PO-NULL-MONEY",
      // Mimic a partially-loaded PO row from the wire.
      subtotal: null as unknown as number,
      tax_amount: undefined as unknown as number,
      shipping_cost: Number.NaN,
      total_amount: null as unknown as number,
    })
    const input: PurchaseOrdersExportInput = { ...FIXTURE, pos: [partialPo] }
    const { rows } = buildPurchaseOrdersCsv(input)
    // Subtotal, Tax, Shipping, Total are columns 7..10.
    expect(rows[0].slice(7, 11)).toEqual(["0.00", "0.00", "0.00", "0.00"])
  })
})

describe("buildPurchaseOrdersPdfHtml", () => {
  it("uses the Purchase Orders title", () => {
    expect(buildPurchaseOrdersPdfHtml(FIXTURE).title).toBe("Purchase Orders")
  })

  it("captures the active filter set when filters are non-default", () => {
    const filtered: PurchaseOrdersExportInput = {
      ...FIXTURE,
      filters: { status: "ordered", supplier: "Acme", search: "rush" },
    }
    const { content } = buildPurchaseOrdersPdfHtml(filtered)
    expect(content).toContain("status=ordered")
    expect(content).toContain("supplier=Acme")
    // The label is escaped before interpolation, so the `"` chars appear as
    // their HTML entity instead of raw quotes.
    expect(content).toContain("search=&quot;rush&quot;")
  })

  it("reports filters: none when nothing is filtered", () => {
    expect(buildPurchaseOrdersPdfHtml(FIXTURE).content).toContain("Filters: none")
  })

  it("renders summary cards and an order row per PO", () => {
    const { content } = buildPurchaseOrdersPdfHtml(FIXTURE)
    expect(content).toContain("Total POs")
    expect(content).toContain(">2<")
    expect(content).toContain("$1640.00")
    expect(content).toContain("PO-0001")
    expect(content).toContain("PO-0002")
    expect(content).toContain("Acme Rubber")
    expect(content).toContain("Bay Polymers")
  })

  it("renders an empty-state row when no POs match the filters", () => {
    const empty: PurchaseOrdersExportInput = { ...FIXTURE, pos: [] }
    const { content } = buildPurchaseOrdersPdfHtml(empty)
    expect(content).toContain("No purchase orders match the current filters.")
  })

  it("escapes HTML special chars in user-controlled string fields", () => {
    const malicious = makePO({
      po_number: "PO-<script>alert(1)</script>",
      supplier: { id: "s-x", name: 'Acme & "Sons"' } as PurchaseOrderWithDetails["supplier"],
    })
    const input: PurchaseOrdersExportInput = {
      ...FIXTURE,
      pos: [malicious],
      filters: { status: "all", supplier: "all", search: "<img onerror=x>" },
    }
    const { content } = buildPurchaseOrdersPdfHtml(input)
    expect(content).not.toContain("<script>alert(1)</script>")
    expect(content).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
    expect(content).toContain("Acme &amp; &quot;Sons&quot;")
    expect(content).not.toContain("<img onerror=x>")
    expect(content).toContain("&lt;img onerror=x&gt;")
  })
})
