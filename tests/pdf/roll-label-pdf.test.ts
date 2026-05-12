/**
 * Phase 7 PR 1 — pins the roll-label PDF builder against regressions
 * introduced by the tokenization pass.
 *
 * `roll-label-pdf.ts` lives in the browser bundle because it depends
 * on `bwip-js/browser` for barcode rendering. We force happy-dom here
 * so the bwip + canvas path resolves, then assert the builder still
 * produces a non-empty Letter PDF for both the single-roll and
 * multi-roll codepaths. Filename + page-size contracts stay intact.
 */
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

import type { Roll } from "@/src/infrastructure/models/supabase"

// bwip-js touches the DOM canvas heavily — easier (and faster) to
// stub it so the tests don't depend on happy-dom's canvas backend.
vi.mock("bwip-js/browser", () => ({
  default: {
    toCanvas: (canvas: HTMLCanvasElement) => {
      // Pretend we drew something so the consumer's `canvas.toDataURL`
      // returns a non-empty string. happy-dom canvases return a
      // tiny gif data-URL by default, which is fine for jsPDF.
      canvas.width = 64
      canvas.height = 64
      return canvas
    },
  },
}))

import { buildRollLabelPdf } from "@/app/dashboard/inventory/_components/roll-label-pdf"

function makeRoll(overrides: Partial<Roll> = {}): Roll {
  const fixture = {
    id: "11111111-2222-3333-4444-555555555555",
    user_id: "u-1",
    part_number: "RF-TEST-0001",
    material_type: "EPDM",
    width: 48,
    length: 120,
    thickness: 0.125,
    remaining_length: 96,
    location: "A-1",
    status: "active" as const,
    date_received: "2026-01-01",
    cost_per_sqft: 1.5,
    is_offcut: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } satisfies Roll
  return fixture
}

const ORIGINAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL

beforeEach(() => {
  // resolveOrigin() reads `NEXT_PUBLIC_APP_URL` — give it a stable
  // value so the QR encoding is deterministic.
  process.env.NEXT_PUBLIC_APP_URL = "https://app.rubberfit.com"
})

afterEach(() => {
  // Don't leak the override into other test files (vitest workers
  // share env). CodeRabbit catch.
  if (ORIGINAL_APP_URL === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL
    return
  }
  process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_URL
})

describe("buildRollLabelPdf", () => {
  it("renders a single-roll Letter PDF with non-empty bytes", () => {
    const doc = buildRollLabelPdf([makeRoll()])
    const buffer = doc.output("arraybuffer")
    expect(buffer.byteLength).toBeGreaterThan(1024)

    // jsPDF Letter @ 612pt × 792pt — preserved by Phase 7 (label aspect
    // is operator muscle memory; redesign tokenized colors/fonts only).
    expect(doc.internal.pageSize.getWidth()).toBe(612)
    expect(doc.internal.pageSize.getHeight()).toBe(792)
  })

  it("renders multi-roll labels onto a single page when they fit in the grid", () => {
    const rolls = [
      makeRoll({ part_number: "RF-A" }),
      makeRoll({ part_number: "RF-B" }),
      makeRoll({ part_number: "RF-C" }),
      makeRoll({ part_number: "RF-D" }),
    ]
    const doc = buildRollLabelPdf(rolls)
    // 4 labels in a 2-column grid → comfortably fits on page 1.
    expect(doc.getNumberOfPages()).toBe(1)
  })

  it("renders offcut rolls without throwing — chip path exercised", () => {
    const doc = buildRollLabelPdf([makeRoll({ is_offcut: true, part_number: "RF-OFFCUT" })])
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(1024)
  })

  it("returns an empty (single blank page) document when handed an empty list", () => {
    const doc = buildRollLabelPdf([])
    // jsPDF documents start with one page; the builder bails before
    // drawing anything but the doc is still well-formed.
    expect(doc.getNumberOfPages()).toBe(1)
  })
})
