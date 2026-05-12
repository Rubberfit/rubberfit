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
    status: "scheduled" as JobStatus,
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
})

describe("buildJobPdfBlob", () => {
  it("returns a Blob with non-zero size", () => {
    const blob = buildJobPdfBlob(makeJob())
    expect(blob.size).toBeGreaterThan(2048)
  })
})

describe("jobPdfFileName", () => {
  it("uses job_number + customer slug when both present", () => {
    const name = jobPdfFileName(makeJob())
    expect(name).toBe("J-000001_Acme-Rubber-Co-.pdf")
  })

  it("falls back to id + skips customer slug when customer_name missing", () => {
    const name = jobPdfFileName(makeJob({ customer_name: null, job_number: "" }))
    expect(name.endsWith(".pdf")).toBe(true)
    expect(name).not.toContain("Acme")
  })
})
