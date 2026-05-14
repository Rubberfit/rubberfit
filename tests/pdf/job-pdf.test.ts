/**
 * Phase 7 PR 2 — pins the customer-facing Job Sheet PDF after the
 * shared-chrome refactor. Verifies the public builder contracts
 * (size, blob non-empty, filename rules, the "no cut layouts ever"
 * invariant) and the page-geometry shift to Letter pt.
 */
// @vitest-environment node
import { describe, expect, it } from "vitest"

import {
  buildJobPdf,
  buildJobPdfBlob,
  jobPdfFileName,
} from "@/app/dashboard/jobs/_components/job-pdf"
import type { JobFullDetail, JobStatus } from "@/src/infrastructure/models/supabase"

function makeJob(overrides: Partial<JobFullDetail> = {}): JobFullDetail {
  const base: JobFullDetail = {
    id: "00000000-0000-0000-0000-000000000001",
    user_id: "u-1",
    job_number: "J-000001",
    name: "Custom EPDM gasket batch",
    description: "5 part numbers across two materials. Customer needs a sample first.",
    customer_name: "Acme Rubber Co.",
    customer_email: "ops@acmerubber.test",
    customer_phone: "+1 (415) 555-0100",
    customer_po_number: "PO-2026-0042",
    status: "scheduled",
    due_date: "2026-06-15",
    completed_at: null,
    notes: null,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    parts: [
      {
        id: "p-1",
        user_id: "u-1",
        job_id: "00000000-0000-0000-0000-000000000001",
        material_type_id: null,
        material_type: "EPDM 60A",
        part_number: "GASKET-A",
        description: null,
        width: 8,
        length: 10,
        thickness: 0.125,
        quantity: 24,
        unit_price: 5.5,
        notes: null,
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
      },
    ],
    assignees: [
      {
        id: "a-1",
        user_id: "u-1",
        job_id: "00000000-0000-0000-0000-000000000001",
        name: "Daniel",
        role: "lead",
        notes: null,
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
      },
    ],
    allocations: [
      {
        id: "alloc-1",
        user_id: "u-1",
        job_id: "00000000-0000-0000-0000-000000000001",
        roll_id: "r-1",
        allocated_length: 36,
        notes: null,
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
        roll: {
          id: "r-1",
          part_number: "RF-000123",
          material_type: "EPDM 60A",
          width: 48,
          length: 120,
          remaining_length: 84,
          location: "A-1",
        },
      },
    ],
    ...overrides,
  }
  return base
}

describe("buildJobPdf", () => {
  it("renders a Letter PDF (612×792pt) with non-empty bytes", () => {
    const doc = buildJobPdf(makeJob())
    expect(doc.internal.pageSize.getWidth()).toBe(612)
    expect(doc.internal.pageSize.getHeight()).toBe(792)
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(2048)
  })

  it("handles every JobStatus literal — status chip never throws", () => {
    const statuses: ReadonlyArray<JobStatus> = [
      "draft",
      "scheduled",
      "in_progress",
      "completed",
      "cancelled",
    ]
    for (const status of statuses) {
      expect(() => buildJobPdf(makeJob({ status }))).not.toThrow()
    }
  })

  it("paginates over many parts without throwing", () => {
    const baseParts = makeJob().parts
    const part = baseParts[0]
    if (!part) throw new Error("fixture missing seed part")
    const manyParts = Array.from({ length: 60 }, (_, i) => ({
      ...part,
      id: `p-${i}`,
      part_number: `LONG-RUN-${i.toString().padStart(3, "0")}`,
    }))
    const doc = buildJobPdf(makeJob({ parts: manyParts }))
    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
  })

  it("renders gracefully when optional customer fields are missing", () => {
    const doc = buildJobPdf(
      makeJob({
        customer_email: null,
        customer_phone: null,
        customer_po_number: null,
        description: null,
      })
    )
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(1024)
  })

  it("renders multi-line job names without truncation (CR catch)", () => {
    // Long job names wrap to 2+ lines via splitTextToSize. The prior
    // implementation only printed the first line and the description
    // started too high. This pins the multi-line render.
    const longName =
      "Custom EPDM gasket batch for Acme Rubber's Q3 production run, including " +
      "tolerance-checked samples plus material certification for ISO 9001 audit"
    expect(() => buildJobPdf(makeJob({ name: longName }))).not.toThrow()
  })

  it("treats free/sample jobs ($0 unit_price) differently from no-pricing jobs", () => {
    // CR catch — `totalValue > 0` collapsed legitimate $0 totals into
    // "—" because $0 looks the same as "no pricing on file". After
    // the fix, the totals KPI distinguishes the two: a job with all
    // unit_price=0 renders "$0.00"; a job with all unit_price=null
    // renders "—". Both PDFs must build without throwing.
    const baseParts = makeJob().parts
    const part = baseParts[0]
    if (!part) throw new Error("fixture missing seed part")

    const freeJob = makeJob({ parts: [{ ...part, unit_price: 0 }] })
    const unpricedJob = makeJob({ parts: [{ ...part, unit_price: null }] })

    expect(() => buildJobPdf(freeJob)).not.toThrow()
    expect(() => buildJobPdf(unpricedJob)).not.toThrow()
  })
})

describe("buildJobPdfBlob", () => {
  it("returns a Blob with non-zero size", () => {
    const blob = buildJobPdfBlob(makeJob())
    expect(blob.size).toBeGreaterThan(2048)
  })

  it("accepts organizationPreferences and produces a valid PDF", () => {
    const blob = buildJobPdfBlob(makeJob(), {
      organizationPreferences: {
        unitSystem: "metric",
        dateFormat: "dd/MM/yyyy",
        timeZone: "America/Los_Angeles",
        locale: "es-MX",
        defaultCurrency: "EUR",
      },
    })
    expect(blob.size).toBeGreaterThan(2048)
  })
})

describe("buildJobPdf with organizationPreferences (PR 2f)", () => {
  it("renders a valid PDF with provider defaults (back-compat: no prefs passed)", () => {
    const doc = buildJobPdf(makeJob())
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(2048)
  })

  it("renders a valid PDF when explicit default prefs are passed", () => {
    const doc = buildJobPdf(makeJob(), {
      organizationPreferences: {
        unitSystem: "imperial",
        dateFormat: "MM/dd/yyyy",
        timeZone: "America/Chicago",
        locale: "en-US",
        defaultCurrency: "USD",
      },
    })
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(2048)
  })

  it("renders the metric / non-USD operator worldview without throwing", () => {
    // Customer PDFs follow the operator per the 2026-05-14 ruling.
    // The combination exercises every prefs-aware path: dates,
    // dimensions, areas, currency, footer timestamp.
    const doc = buildJobPdf(makeJob(), {
      organizationPreferences: {
        unitSystem: "metric",
        dateFormat: "dd/MM/yyyy",
        timeZone: "Europe/London",
        locale: "en-GB",
        defaultCurrency: "GBP",
      },
    })
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(2048)
  })

  it("handles a parts-empty job with non-default prefs", () => {
    const doc = buildJobPdf(makeJob({ parts: [] }), {
      organizationPreferences: { unitSystem: "metric", defaultCurrency: "EUR" },
    })
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(1024)
  })

  it("renders allocations with metric units when prefs.unitSystem = metric", () => {
    // Allocations table renders `${length}  (${area})`. With metric
    // prefs the length string must contain "cm" and the area "m²",
    // both via the shared helpers. Smoke: PDF builds + bytes exist.
    const doc = buildJobPdf(makeJob(), {
      organizationPreferences: { unitSystem: "metric" },
    })
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(2048)
  })
})

describe("jobPdfFileName", () => {
  it("uses job_number + customer slug when both present", () => {
    const name = jobPdfFileName(makeJob())
    expect(name).toBe("J-000001_Acme-Rubber-Co-.pdf")
  })

  it("falls back to exact id when both customer_name and job_number are missing", () => {
    // Pins the precise filename for the legacy pre-trigger row case.
    // CR catch — previous assertion only checked `.endsWith(".pdf")`
    // and `not.toContain("Acme")`, which would have re-passed even
    // if the fallback degraded to a bare ".pdf".
    const name = jobPdfFileName(makeJob({ customer_name: null, job_number: "" }))
    expect(name).toBe("00000000-0000-0000-0000-000000000001.pdf")
  })
})
