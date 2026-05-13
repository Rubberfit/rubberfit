/**
 * Phase 7 PR 1 — pins the locked design tokens against accidental drift.
 *
 * Kimi's design direction at `.claude/research/phase7/kimi-design-direction.md`
 * is the source of truth. These assertions are the code's contract with
 * that doc: if a value drifts here without a corresponding direction-doc
 * update, this test fails and forces the conversation.
 */
import { describe, it, expect } from "vitest"

import {
  BARCODE_HEADER_HEIGHT,
  BASELINE,
  BLUEPRINT,
  CHARCOAL,
  CHIP_HEIGHT,
  CHIP_PADDING_X,
  CHIP_STROKE,
  CUSTOMER_ACCENT_HEIGHT,
  CUSTOMER_PAGE,
  DIVIDER_GAP,
  DIVIDER_RULE,
  INK,
  INTERNAL_PAGE,
  KPI_MIN_HEIGHT,
  KPI_PADDING,
  KPI_TOP_BORDER,
  LABEL_TOP_RULE,
  LOGO_HEIGHT,
  PAGE_BY_CANVAS,
  type RGB,
  RULE,
  SIGNAL,
  SLATE,
  STATUS_CHIPS,
  SURFACE,
  TYPE,
  WHITE,
} from "@/app/lib/pdf"

function isRgb(value: unknown): value is RGB {
  if (!Array.isArray(value) || value.length !== 3) return false
  return value.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)
}

describe("tokens — page geometry", () => {
  it("customer canvas is US Letter at 612×792pt", () => {
    expect(CUSTOMER_PAGE.width).toBe(612)
    expect(CUSTOMER_PAGE.height).toBe(792)
    expect(CUSTOMER_PAGE.margin).toBe(48)
    expect(CUSTOMER_PAGE.contentWidth).toBe(612 - 48 * 2)
  })

  it("internal canvas is A4-in-pt at 595×842pt", () => {
    expect(INTERNAL_PAGE.width).toBe(595)
    expect(INTERNAL_PAGE.height).toBe(842)
    expect(INTERNAL_PAGE.margin).toBe(42)
    expect(INTERNAL_PAGE.contentWidth).toBe(595 - 42 * 2)
  })

  it("PAGE_BY_CANVAS maps every canvas to its geometry", () => {
    expect(PAGE_BY_CANVAS.customer).toBe(CUSTOMER_PAGE)
    expect(PAGE_BY_CANVAS.internal).toBe(INTERNAL_PAGE)
  })

  it("all spacing constants are multiples of the 4pt baseline", () => {
    const multiples = [
      KPI_PADDING,
      KPI_MIN_HEIGHT,
      CHIP_HEIGHT,
      CHIP_PADDING_X,
      DIVIDER_GAP,
      BARCODE_HEADER_HEIGHT,
    ]
    for (const value of multiples) {
      expect(value % BASELINE).toBe(0)
    }
  })
})

describe("tokens — color palette", () => {
  it("all named colors are valid RGB triples in 0-255 integer range", () => {
    const colors = { SIGNAL, INK, CHARCOAL, SLATE, RULE, SURFACE, WHITE, BLUEPRINT }
    for (const [name, color] of Object.entries(colors)) {
      expect(isRgb(color), `${name} must be a valid RGB triple`).toBe(true)
    }
  })

  it("primary signal accent is locked to Rubberfit signal orange (#ee5a24)", () => {
    // Phase 7 brand correction (2026-05-12) — the PDFs are
    // Rubberfit-branded, not Arc & Anchor. Signal orange replaces
    // the prior `[37, 99, 235]` Arc & Anchor blue. Source of truth:
    // `rubberfit-marketing/src/app/globals.css` `--color-signal`.
    expect(SIGNAL).toEqual([238, 90, 36])
  })

  it("ink is the warmed Rubberfit graphite (#14171b)", () => {
    expect(INK).toEqual([20, 23, 27])
  })

  it("all four status chip palettes have valid fill / text / stroke triples", () => {
    for (const intent of ["info", "success", "warning", "error"] as const) {
      const palette = STATUS_CHIPS[intent]
      expect(isRgb(palette.fill), `${intent}.fill`).toBe(true)
      expect(isRgb(palette.text), `${intent}.text`).toBe(true)
      expect(isRgb(palette.stroke), `${intent}.stroke`).toBe(true)
    }
  })

  it("chip palette stays on-brand — info uses BLUEPRINT, error uses SIGNAL", () => {
    expect(STATUS_CHIPS.info.stroke).toEqual(BLUEPRINT)
    expect(STATUS_CHIPS.error.stroke).toEqual(SIGNAL)
    // Success is the inverted-ink "official stamp" with no alien green.
    expect(STATUS_CHIPS.success.fill).toEqual(INK)
    expect(STATUS_CHIPS.success.text).toEqual(WHITE)
  })
})

describe("tokens — type system", () => {
  it("uses standard PDF fonts only (helvetica + courier) — no embedded fonts", () => {
    for (const role of Object.values(TYPE)) {
      expect(["helvetica", "courier"]).toContain(role.family)
    }
  })

  it("uses normal/bold weights only — no embedded weights", () => {
    for (const role of Object.values(TYPE)) {
      expect(["normal", "bold"]).toContain(role.weight)
    }
  })

  it("type roles are ordered by size from caption (8pt) up to display (24pt)", () => {
    expect(TYPE.caption.size).toBeLessThanOrEqual(TYPE.body.size)
    expect(TYPE.body.size).toBeLessThanOrEqual(TYPE.h2.size)
    expect(TYPE.h2.size).toBeLessThanOrEqual(TYPE.h1.size)
    expect(TYPE.h1.size).toBeLessThanOrEqual(TYPE.display.size)
  })

  it("mono role uses courier so per-PDF mono columns render with tabular widths", () => {
    expect(TYPE.mono.family).toBe("courier")
  })
})

describe("tokens — chrome + primitive constants", () => {
  it("chrome offsets carry sensible defaults", () => {
    expect(LOGO_HEIGHT).toBe(20)
    expect(CUSTOMER_ACCENT_HEIGHT).toBe(3)
    expect(KPI_TOP_BORDER).toBe(2)
    expect(DIVIDER_RULE).toBe(2)
    expect(LABEL_TOP_RULE).toBe(2)
  })

  it("chip + table strokes stay sub-pt so they read as engineered rules", () => {
    expect(CHIP_STROKE).toBeLessThan(1)
  })
})
