// Issue #126 regression: loading a saved cut with multiple shape types
// (e.g. trapezoid + rectangle) only restored one shape because
// `cut_history.part_id` is a scalar that can't encode mixed types. The
// fix persists per-template partType inside `layout_json` and reads it
// back in `buildTemplatesFromCutRecord`.
//
// These tests cover:
//   A. Round-trip mixed (trapezoid + rectangle) — both templates carry
//      the correct partType and their stored dims.
//   B. Legacy fallback: layout_json = null — every template collapses to
//      the scalar `part_id` (= today's behaviour, no regression).
//   C. layout_json present but missing perTemplatePartTypes — same
//      legacy fallback as B.
//   D. layout_json carries an invalid entry — runtime guard rejects the
//      whole array and falls back to the scalar (no mistyped templates).
//   E. Single-shape cut — perTemplatePartTypes = ["rectangle"] keeps the
//      single rectangle behaviour.

import { describe, it, expect } from "vitest"
import { buildTemplatesFromCutRecord } from "@/app/dashboard/cutting-engine/_components/cut-load-utils"
import type { CutHistory } from "@/src/infrastructure/models/supabase"

interface CutOverrides {
  part_id?: number
  part_selected_size_text?: string[] | null
  part_selected_label?: string[] | null
  part_custom_dimensions?: CutHistory["part_custom_dimensions"]
  layout_json?: CutHistory["layout_json"]
  cut_amount?: number
}

function makeCut(overrides: CutOverrides = {}): CutHistory {
  return {
    id: "cut-126-test",
    user_id: null,
    roll_id: null,
    job_id: null,
    job_part_id: null,
    material_id: 0,
    part_id: overrides.part_id ?? 1,
    cut_length: 96,
    cut_width: 48,
    cut_thickness: 0.5,
    part_custom_width: null,
    part_custom_height: null,
    part_selected_size: null,
    part_selected_size_text: overrides.part_selected_size_text ?? null,
    part_selected_label: overrides.part_selected_label ?? null,
    part_custom_dimensions: overrides.part_custom_dimensions ?? null,
    cut_amount: overrides.cut_amount ?? 1,
    parts_completed: 0,
    material_used_sqft: 0,
    reusable_offset_sqft: 0,
    scrap_sqft: 0,
    fab_score: 0,
    cut_pieces: 0,
    stock_label: null,
    cost_per_sqft: null,
    pdf_url: null,
    source: "auto",
    layout_json: overrides.layout_json ?? null,
    cut_date: "2026-04-25T00:00:00Z",
    created_at: "2026-04-25T00:00:00Z",
    updated_at: "2026-04-25T00:00:00Z",
  }
}

describe("issue #126 — mixed-shape cut load restores every template's partType", () => {
  it("A. round-trip: trapezoid + rectangle produces two templates with correct partTypes", () => {
    const cut = makeCut({
      part_id: 4, // trapezoid (the primary template at save time)
      part_selected_size_text: ['8" / 18" × 30"', '24" × 12"'],
      part_selected_label: ["Custom trap", "Custom rect"],
      part_custom_dimensions: [
        { topWidth: 8, bottomWidth: 18, height: 30 },
        { width: 24, length: 12 },
      ],
      cut_amount: 1,
      layout_json: {
        version: 1,
        kind: "auto",
        perTemplateQuantities: [3, 5],
        perTemplatePartTypes: ["trapezoid", "rectangle"],
      },
    })

    const result = buildTemplatesFromCutRecord(cut)

    expect(result.templates).toHaveLength(2)
    expect(result.perTemplatePartTypes).toEqual(["trapezoid", "rectangle"])

    const [trap, rect] = result.templates
    expect(trap.partType).toBe("trapezoid")
    expect(trap.topWidth).toBe(8)
    expect(trap.bottomWidth).toBe(18)
    expect(trap.height).toBe(30)
    expect(trap.quantity).toBe(3)

    expect(rect.partType).toBe("rectangle")
    expect(rect.width).toBe(24)
    expect(rect.length).toBe(12)
    expect(rect.quantity).toBe(5)
  })

  it("B. legacy row (layout_json = null): every template collapses to part_id's type", () => {
    const cut = makeCut({
      part_id: 1, // rectangle
      part_selected_size_text: ['24" × 12"', '36" × 18"'],
      part_selected_label: ["A", "B"],
      part_custom_dimensions: [
        { width: 24, length: 12 },
        { width: 36, length: 18 },
      ],
      layout_json: null,
    })

    const result = buildTemplatesFromCutRecord(cut)

    expect(result.templates).toHaveLength(2)
    expect(result.perTemplatePartTypes).toEqual(["rectangle", "rectangle"])
    expect(result.templates.every((t) => t.partType === "rectangle")).toBe(true)
  })

  it("C. layout_json present but no perTemplatePartTypes: same legacy fallback", () => {
    const cut = makeCut({
      part_id: 1,
      part_selected_size_text: ['24" × 12"', '36" × 18"'],
      part_custom_dimensions: [
        { width: 24, length: 12 },
        { width: 36, length: 18 },
      ],
      layout_json: {
        version: 1,
        kind: "auto",
        perTemplateQuantities: [2, 4],
      },
    })

    const result = buildTemplatesFromCutRecord(cut)

    expect(result.perTemplatePartTypes).toEqual(["rectangle", "rectangle"])
    expect(result.templates[0].quantity).toBe(2)
    expect(result.templates[1].quantity).toBe(4)
  })

  it("D. invalid entry in perTemplatePartTypes: runtime guard rejects whole array, falls back", () => {
    const cut = makeCut({
      part_id: 1,
      part_selected_size_text: ['24" × 12"', '36" × 18"'],
      part_custom_dimensions: [
        { width: 24, length: 12 },
        { width: 36, length: 18 },
      ],
      layout_json: {
        version: 1,
        kind: "auto",
        perTemplateQuantities: [1, 1],
        // @ts-expect-error — intentionally invalid to verify the runtime guard
        perTemplatePartTypes: ["rectangle", "circle"],
      },
    })

    const result = buildTemplatesFromCutRecord(cut)

    // Mixed/unknown entry triggers full fallback to scalar `part_id`.
    expect(result.perTemplatePartTypes).toEqual(["rectangle", "rectangle"])
    expect(result.templates.every((t) => t.partType === "rectangle")).toBe(true)
  })

  it("E. single-shape cut: perTemplatePartTypes = ['rectangle'] no behavior change", () => {
    const cut = makeCut({
      part_id: 1,
      part_selected_size_text: ['24" × 12"'],
      part_custom_dimensions: [{ width: 24, length: 12 }],
      cut_amount: 7,
      layout_json: {
        version: 1,
        kind: "auto",
        perTemplateQuantities: [7],
        perTemplatePartTypes: ["rectangle"],
      },
    })

    const result = buildTemplatesFromCutRecord(cut)

    expect(result.templates).toHaveLength(1)
    expect(result.perTemplatePartTypes).toEqual(["rectangle"])
    expect(result.templates[0]).toMatchObject({
      partType: "rectangle",
      width: 24,
      length: 12,
      quantity: 7,
    })
  })

  it("F. quantity falls back to cut_amount when storedQtys is missing", () => {
    const cut = makeCut({
      part_id: 4,
      part_selected_size_text: ['8" / 18" × 30"'],
      part_custom_dimensions: [{ topWidth: 8, bottomWidth: 18, height: 30 }],
      cut_amount: 9,
      layout_json: null,
    })

    const result = buildTemplatesFromCutRecord(cut)

    expect(result.templates[0].quantity).toBe(9)
    expect(result.templates[0].partType).toBe("trapezoid")
  })

  it("H. perTemplatePartTypes shorter than sizeTexts: missing indices fall back to part_id", () => {
    // Validates the per-index fallback inside `partTypeForIndex` — the
    // runtime guard accepts a shorter array (all entries are valid),
    // and unknown indices fall back to the scalar part_id rather than
    // collapsing the whole array.
    const cut = makeCut({
      part_id: 1, // rectangle scalar fallback
      part_selected_size_text: ['8" / 18" × 30"', '24" × 12"', '36" × 18"'],
      part_custom_dimensions: [
        { topWidth: 8, bottomWidth: 18, height: 30 },
        { width: 24, length: 12 },
        { width: 36, length: 18 },
      ],
      layout_json: {
        version: 1,
        kind: "auto",
        perTemplateQuantities: [1, 1, 1],
        perTemplatePartTypes: ["trapezoid"],
      },
    })

    const result = buildTemplatesFromCutRecord(cut)

    expect(result.perTemplatePartTypes).toEqual(["trapezoid", "rectangle", "rectangle"])
    expect(result.templates[0].partType).toBe("trapezoid")
    expect(result.templates[1].partType).toBe("rectangle")
    expect(result.templates[2].partType).toBe("rectangle")
  })

  it("G. completely empty cut (no size_text): returns one template from cut dimensions", () => {
    const cut = makeCut({
      part_id: 1,
      part_selected_size_text: null,
    })

    const result = buildTemplatesFromCutRecord(cut)

    expect(result.templates).toHaveLength(1)
    expect(result.templates[0].partType).toBe("rectangle")
  })
})
