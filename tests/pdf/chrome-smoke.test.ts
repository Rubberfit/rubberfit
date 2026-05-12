/**
 * Phase 7 PR 1 — smoke test for the shared chrome + primitives.
 *
 * jsPDF runs in Node without a DOM. Each primitive draws into the doc
 * and we assert the result is a non-empty buffer (chrome / primitive
 * runtime didn't throw, document has bytes). Visual correctness is
 * verified manually by attaching fixture PDFs to each phase-7 PR;
 * this test pins the API surface and detects "module compiled but
 * blows up at draw time" regressions.
 */
// @vitest-environment node
import { jsPDF } from "jspdf"
import { describe, it, expect, vi } from "vitest"

import {
  CUSTOMER_PAGE,
  contentStartY,
  drawCustomerChrome,
  drawInternalChrome,
  drawKpiCard,
  drawLabelTopRule,
  drawRuledTable,
  drawSectionDivider,
  drawStatusChip,
  ensureSpace,
  INTERNAL_PAGE,
  stampFooterOnEveryPage,
} from "@/app/lib/pdf"

function makeCustomerDoc(): jsPDF {
  return new jsPDF({ unit: "pt", format: [CUSTOMER_PAGE.width, CUSTOMER_PAGE.height] })
}

function makeInternalDoc(): jsPDF {
  return new jsPDF({ unit: "pt", format: [INTERNAL_PAGE.width, INTERNAL_PAGE.height] })
}

function pdfHasBytes(doc: jsPDF): boolean {
  const buffer = doc.output("arraybuffer")
  return buffer.byteLength > 1024
}

describe("chrome — customer canvas", () => {
  it("renders header + footer without throwing on a single-page document", () => {
    const doc = makeCustomerDoc()
    drawCustomerChrome(doc, { title: "JOB SHEET", subtitle: "J-000124" })
    stampFooterOnEveryPage(doc, "customer", () => "J-000124 • 2026-05-12")
    expect(pdfHasBytes(doc)).toBe(true)
  })

  it("contentStartY returns a Y below the header divider", () => {
    const y = contentStartY("customer")
    expect(y).toBeGreaterThan(CUSTOMER_PAGE.margin)
  })
})

describe("chrome — internal canvas", () => {
  it("renders header + footer on a multi-page document with the right page count", () => {
    const doc = makeInternalDoc()
    drawInternalChrome(doc, { title: "CUT HISTORY" })
    doc.addPage()
    drawInternalChrome(doc, { title: "CUT HISTORY" })
    stampFooterOnEveryPage(doc, "internal", (page) => `CH-001 • page ${page}`)
    expect(doc.getNumberOfPages()).toBe(2)
    expect(pdfHasBytes(doc)).toBe(true)
  })
})

describe("primitives — KPI card", () => {
  it("draws a card with label, value, and optional unit", () => {
    const doc = makeCustomerDoc()
    drawCustomerChrome(doc, { title: "DASHBOARD" })
    drawKpiCard(doc, {
      x: 48,
      y: contentStartY("customer"),
      width: 160,
      label: "Total parts",
      value: "1,248",
      unit: "PARTS",
    })
    expect(pdfHasBytes(doc)).toBe(true)
  })
})

describe("primitives — ruled table", () => {
  it("renders a header + body + totals row in a single call", () => {
    const doc = makeCustomerDoc()
    drawCustomerChrome(doc, { title: "JOB SHEET" })
    const finalY = drawRuledTable(doc, {
      x: 48,
      y: contentStartY("customer"),
      columns: [
        { header: "Part", width: 180 },
        { header: "Qty", width: 80, align: "right", mono: true },
        { header: "Unit", width: 100, align: "right", mono: true },
        { header: "Total", width: 120, align: "right", mono: true },
      ],
      rows: [
        { cells: ["Gasket A", "12", "$5.00", "$60.00"] },
        { cells: ["Gasket B", "8", "$7.50", "$60.00"] },
        { cells: ["Total", "20", "", "$120.00"], isTotals: true },
      ],
    })
    expect(finalY).toBeGreaterThan(contentStartY("customer"))
    expect(pdfHasBytes(doc)).toBe(true)
  })

  it("zebra default-on paints alternating Surface fills on odd body rows", () => {
    // CR catch in PR 2 — the zebra option was added to the interface
    // but the body row loop never read it. The original test only
    // checked "PDF has bytes," which would still pass if zebra wiring
    // broke again. This test counts the actual `setFillColor(SURFACE)`
    // calls and the matching `rect` fills.
    const doc = makeCustomerDoc()
    drawCustomerChrome(doc, { title: "JOB SHEET" })

    const fillColorSpy = vi.spyOn(doc, "setFillColor")
    const rectSpy = vi.spyOn(doc, "rect")
    const fillsBefore = fillColorSpy.mock.calls.length
    const rectsBefore = rectSpy.mock.calls.length

    drawRuledTable(doc, {
      x: 48,
      y: contentStartY("customer"),
      columns: [
        { header: "Item", width: 360 },
        { header: "Count", width: 156, align: "right", mono: true },
      ],
      // 6 rows → odd body rows are indices 1, 3, 5 → 3 zebra fills.
      rows: Array.from({ length: 6 }, (_, i) => ({
        cells: [`Row ${i + 1}`, String(i + 1)],
      })),
      // zebra omitted — defaults to true.
    })

    // SURFACE = [248, 250, 252] per tokens.ts.
    const surfaceFills = fillColorSpy.mock.calls
      .slice(fillsBefore)
      .filter((args) => args[0] === 248 && args[1] === 250 && args[2] === 252).length
    expect(surfaceFills).toBe(3)

    // Each Surface fill is followed by a `doc.rect(..., "F")` call.
    const filledRects = rectSpy.mock.calls
      .slice(rectsBefore)
      .filter((args) => args[args.length - 1] === "F").length
    expect(filledRects).toBeGreaterThanOrEqual(3)
  })

  it("zebra false makes the SURFACE fill count drop to zero", () => {
    const doc = makeCustomerDoc()
    drawCustomerChrome(doc, { title: "JOB SHEET" })

    const fillColorSpy = vi.spyOn(doc, "setFillColor")
    const fillsBefore = fillColorSpy.mock.calls.length

    drawRuledTable(doc, {
      x: 48,
      y: contentStartY("customer"),
      columns: [
        { header: "Item", width: 360 },
        { header: "Count", width: 156, align: "right", mono: true },
      ],
      rows: Array.from({ length: 4 }, (_, i) => ({
        cells: [`Row ${i + 1}`, String(i + 1)],
      })),
      zebra: false,
    })

    const surfaceFills = fillColorSpy.mock.calls
      .slice(fillsBefore)
      .filter((args) => args[0] === 248 && args[1] === 250 && args[2] === 252).length
    expect(surfaceFills).toBe(0)
  })

  it("auto-paginates and redraws chrome + header on overflow", () => {
    // Codex catch in PR 2 — drawRuledTable used to draw all rows in
    // one call without checking page bounds, so a long table
    // overflowed the page footer silently. This pins the new
    // pageBreak option: when set, a 60-row table must spill onto a
    // second page and call the redraw callback.
    const doc = makeCustomerDoc()
    drawCustomerChrome(doc, { title: "JOB SHEET" })

    let redrawCount = 0
    drawRuledTable(doc, {
      x: 48,
      y: contentStartY("customer"),
      columns: [
        { header: "Index", width: 80, align: "right", mono: true },
        { header: "Label", width: 436 },
      ],
      rows: Array.from({ length: 60 }, (_, i) => ({
        cells: [String(i + 1), `Long-running parts row #${i + 1}`],
      })),
      pageBreak: {
        canvas: "customer",
        redrawChrome: (page) => {
          redrawCount += 1
          drawCustomerChrome(page, { title: "JOB SHEET" })
          return contentStartY("customer")
        },
      },
    })

    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
    expect(redrawCount).toBeGreaterThanOrEqual(1)
  })
})

describe("primitives — status chip", () => {
  it("returns a non-zero chip width so callers can position adjacent content", () => {
    const doc = makeCustomerDoc()
    const width = drawStatusChip(doc, {
      x: 48,
      y: contentStartY("customer"),
      label: "Active",
      intent: "success",
    })
    expect(width).toBeGreaterThan(0)
  })
})

describe("primitives — section divider + label top rule", () => {
  it("renders both without throwing", () => {
    const doc = makeInternalDoc()
    drawInternalChrome(doc, { title: "ANALYTICS REPORT" })
    drawSectionDivider(doc, {
      x: 42,
      y: contentStartY("internal"),
      width: INTERNAL_PAGE.contentWidth,
      title: "Top parts",
    })
    drawLabelTopRule(doc, 100, 700, 200)
    expect(pdfHasBytes(doc)).toBe(true)
  })
})

describe("pagination — ensureSpace", () => {
  it("returns the cursor unchanged when there's room on the current page", () => {
    const doc = makeCustomerDoc()
    drawCustomerChrome(doc, { title: "TEST" })
    const start = contentStartY("customer")
    const next = ensureSpace(doc, {
      cursor: start,
      neededHeight: 100,
      canvas: "customer",
      redrawChrome: () => contentStartY("customer"),
    })
    expect(next).toBe(start)
    expect(doc.getNumberOfPages()).toBe(1)
  })

  it("adds a page + redraws chrome when the block doesn't fit", () => {
    const doc = makeCustomerDoc()
    drawCustomerChrome(doc, { title: "TEST" })
    const nearBottom = CUSTOMER_PAGE.height - CUSTOMER_PAGE.margin - 10
    let redrew = false
    const next = ensureSpace(doc, {
      cursor: nearBottom,
      neededHeight: 100,
      canvas: "customer",
      redrawChrome: (newPage) => {
        redrew = true
        drawCustomerChrome(newPage, { title: "TEST" })
        return contentStartY("customer")
      },
    })
    expect(redrew).toBe(true)
    expect(doc.getNumberOfPages()).toBe(2)
    expect(next).toBe(contentStartY("customer"))
  })

  it("page-breaks when content would overlap the footer band", async () => {
    // Codex post-impl review caught this: before the fix, contentBottomY
    // returned `height - margin`, so a row drawn at `bottomMargin - 1pt`
    // could collide with the footer divider drawn at
    // `height - margin - FOOTER_DIVIDER_OFFSET (16)`. After the fix,
    // contentBottomY subtracts FOOTER_RESERVED_HEIGHT (24) so this
    // assertion fails-loud if the boundary slips back.
    const { contentBottomY, FOOTER_RESERVED_HEIGHT, INTERNAL_PAGE } = await import("@/app/lib/pdf")
    expect(contentBottomY("internal")).toBe(
      INTERNAL_PAGE.height - INTERNAL_PAGE.margin - FOOTER_RESERVED_HEIGHT
    )
    expect(contentBottomY("customer")).toBeLessThan(CUSTOMER_PAGE.height - CUSTOMER_PAGE.margin)
  })
})
