/**
 * Regression tests for the Purchase Orders half of GitHub issue #122 — the
 * Export button on `app/dashboard/inventory/purchase-orders/page.tsx` had no
 * `onClick`, so clicking it did nothing. Pure-helper coverage for
 * `buildPurchaseOrdersCsv` (unchanged) plus a smoke for
 * `buildPurchaseOrdersListPdf` (Phase 7 PR 4 — replaced the HTML stamper
 * with an imperative jsPDF builder).
 */
// @vitest-environment node
import { jsPDF } from "jspdf"
import { describe, expect, it, vi } from "vitest"

import { footerTimestamp } from "@/app/dashboard/inventory/purchase-orders/_components/po-pdf"
import {
  buildPurchaseOrdersCsv,
  buildPurchaseOrdersListPdf,
  type PurchaseOrdersExportInput,
} from "@/app/dashboard/inventory/purchase-orders/_components/po-export-utils"
import { CUSTOMER_PAGE, TYPE } from "@/app/lib/pdf"
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

    // Whitespace-prefixed formulas should also be neutralized — Excel/Sheets
    // trim leading whitespace before evaluating the formula chars. Carriage
    // return acts as a paste/cell-break sentinel and must be neutralized too.
    const tricky = makePO({
      po_number: "  =SUM(A1:A2)",
      notes: "\t=evil",
      supplier: { id: "s-r", name: "\r=DANGER" } as PurchaseOrderWithDetails["supplier"],
    })
    const trickyOut = buildPurchaseOrdersCsv({ ...FIXTURE, pos: [tricky] })
    expect(trickyOut.rows[0][0]).toBe("'  =SUM(A1:A2)")
    expect(trickyOut.rows[0][1]).toBe("'\r=DANGER")
    expect(trickyOut.rows[0][11]).toBe("'\t=evil")
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

describe("buildPurchaseOrdersListPdf", () => {
  // Phase 7 PR 4 — replaced the HTML-stamper builder with an
  // imperative jsPDF builder. The XSS escape coverage from the prior
  // test suite doesn't apply because jsPDF never renders user input
  // as HTML; characters are drawn as literal glyphs. The remaining
  // assertions pin the public contract: builder returns a non-empty
  // Letter-sized jsPDF doc, handles every input shape without
  // throwing, and produces multi-page output when POs warrant it.

  it("returns a non-empty Letter-sized jsPDF for a populated input", () => {
    const doc = buildPurchaseOrdersListPdf(FIXTURE)
    expect(doc.internal.pageSize.getWidth()).toBe(612)
    expect(doc.internal.pageSize.getHeight()).toBe(792)
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(2048)
  })

  it("renders one page per PO (each PO is one section + page break)", () => {
    // FIXTURE has 2 POs → 2 pages minimum (one per PO + any spill).
    const doc = buildPurchaseOrdersListPdf(FIXTURE)
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2)
  })

  it("handles non-default filters without throwing", () => {
    const filtered: PurchaseOrdersExportInput = {
      ...FIXTURE,
      filters: { status: "ordered", supplier: "Acme", search: "rush" },
    }
    expect(() => buildPurchaseOrdersListPdf(filtered)).not.toThrow()
  })

  it("renders an empty-state when no POs match the filters", () => {
    const empty: PurchaseOrdersExportInput = { ...FIXTURE, pos: [] }
    const doc = buildPurchaseOrdersListPdf(empty)
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(1024)
  })

  it("handles user-controlled string fields safely (no HTML interpretation)", () => {
    // Imperative jsPDF draws characters as literal glyphs — no HTML
    // interpretation, so the historical XSS path doesn't exist. Pin
    // that the builder accepts arbitrary content without crashing.
    const malicious = makePO({
      po_number: "PO-<script>alert(1)</script>",
      supplier: { id: "s-x", name: 'Acme & "Sons"' } as PurchaseOrderWithDetails["supplier"],
    })
    const input: PurchaseOrdersExportInput = {
      ...FIXTURE,
      pos: [malicious],
      filters: { status: "all", supplier: "all", search: "<img onerror=x>" },
    }
    expect(() => buildPurchaseOrdersListPdf(input)).not.toThrow()
  })

  it("accepts non-default operator preferences without throwing", () => {
    // PR 2 contract: body dates + footer timestamp render in the
    // operator's chosen format/locale/timezone. Filenames stay ISO
    // (validated by the downloader's separate filename test).
    const withPrefs: PurchaseOrdersExportInput = {
      ...FIXTURE,
      preferences: {
        dateFormat: "dd/MM/yyyy",
        timeZone: "Europe/Paris",
        locale: "es-MX",
      },
    }
    const doc = buildPurchaseOrdersListPdf(withPrefs)
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(2048)
  })

  it("footer docMeta fits the right-half width budget under worst-case prefs", () => {
    // PR 2b — CodeRabbit's deferred recommendation. The PO list footer
    // is `Purchase orders · ${generatedAt}`. With the compact
    // `<date> HH:mm` timestamp and yyyy-MM-dd / dd/MM/yyyy at their
    // widest, the right-aligned docMeta must still fit half the page
    // width minus the page-counter centre column gap.
    //
    // Fake clock pins the timestamp so the assertion can't drift across
    // midnight or DST transitions in CI. `footerTimestamp` reads
    // `new Date()` internally; vi.setSystemTime feeds it a constant.
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-12-31T23:59:00.000Z"))
    const worstCase = {
      dateFormat: "yyyy-MM-dd" as const,
      timeZone: "Europe/London" as const,
      locale: "es-MX" as const,
    }
    // Mirror production geometry exactly: po-pdf.ts:374 calls
    // `new jsPDF({ format: [CUSTOMER_PAGE.width, CUSTOMER_PAGE.height] })`.
    // A "letter" shortcut is equivalent today (612x792pt) but would
    // silently drift if CUSTOMER_PAGE ever changes.
    const doc = new jsPDF({
      unit: "pt",
      format: [CUSTOMER_PAGE.width, CUSTOMER_PAGE.height],
    })
    doc.setFont(TYPE.caption.family, TYPE.caption.weight)
    doc.setFontSize(TYPE.caption.size)
    const docMeta = `Purchase orders · ${footerTimestamp(worstCase)}`
    const width = doc.getTextWidth(docMeta)
    const budget = CUSTOMER_PAGE.contentWidth / 2 - 16
    expect(
      width,
      `PO list footer "${docMeta}" measured ${width.toFixed(1)}pt vs budget ${budget.toFixed(1)}pt`
    ).toBeLessThan(budget)
    vi.useRealTimers()
  })
})
