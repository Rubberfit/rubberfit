/**
 * PR C rework: gasket holes (ring bore, full-face bolt holes) emit
 * as `LayoutRegion` entries with `source: "cutout"` so the 3D
 * renderer can paint them as actual extruded waste pieces instead
 * of vanishing into the gasket footprint.
 *
 * Verifies the Codex-approved threshold logic: a large bore disc
 * (≥ reusable thresholds) lands in offcuts; small bolt holes land
 * in scrap; the originating PlacedPart.id is preserved on
 * `parentPartId` for the hover-link follow-up.
 */
import { describe, expect, it } from "vitest"

import { computeAdaptiveRegions } from "@/app/dashboard/cutting-engine/_components/manual-layout/regions"
import type { ManualPlacement } from "@/app/dashboard/cutting-engine/_components/manual-layout/collision"
import type { PartTemplate } from "@/app/dashboard/cutting-engine/_components/preset-template-data"
import type { StockConfig } from "@/app/dashboard/cutting-engine/_components/stock-preview-configurator"
import { gasketSpecToPartTemplate } from "@/app/dashboard/cutting-engine/_components/gasket-template"

const STOCK: StockConfig = {
  width: 96,
  length: 48,
  material: "EPDM",
  thickness: 0.5,
  kerf: 0.0625,
}

function makeTemplate(
  id: string,
  template: ReturnType<typeof gasketSpecToPartTemplate>
): PartTemplate {
  return { ...template, id, quantity: 1 }
}

function makePlacement(id: string, templateId: string, x: number, y: number): ManualPlacement {
  return { id, templateId, x, y, rotationRad: 0 }
}

describe("computeAdaptiveRegions · hole-cutout pass", () => {
  it("a ring gasket emits its bore as a cutout-source region", () => {
    const ring = makeTemplate(
      "ring-1",
      gasketSpecToPartTemplate({ kind: "ring", outerDiameter: 12, innerDiameter: 8 })
    )
    const placement = makePlacement("p1", "ring-1", 10, 10)
    const { offcuts, scrap } = computeAdaptiveRegions([placement], [ring], STOCK)
    const cutouts = [...offcuts, ...scrap].filter((r) => r.source === "cutout")
    expect(cutouts).toHaveLength(1)
    expect(cutouts[0].parentPartId).toBe("p1")
    expect(cutouts[0].polygon).toBeDefined()
    expect((cutouts[0].polygon ?? []).length).toBeGreaterThan(10)
  })

  it("a full-face gasket with 8 bolt holes emits 9 cutout regions (bore + 8 bolts)", () => {
    const fullFace = makeTemplate(
      "ff-1",
      gasketSpecToPartTemplate({
        kind: "full-face",
        outerDiameter: 16,
        boreInnerDiameter: 8,
        boltCircleDiameter: 12,
        boltCount: 8,
        boltHoleDiameter: 0.75,
      })
    )
    const placement = makePlacement("p2", "ff-1", 5, 5)
    const { offcuts, scrap } = computeAdaptiveRegions([placement], [fullFace], STOCK)
    const cutouts = [...offcuts, ...scrap].filter((r) => r.source === "cutout")
    expect(cutouts).toHaveLength(9)
    for (const c of cutouts) expect(c.parentPartId).toBe("p2")
  })

  it('bolt-hole cutouts (sub-1" discs) are classified as scrap, not offcuts', () => {
    const fullFace = makeTemplate(
      "ff-2",
      gasketSpecToPartTemplate({
        kind: "full-face",
        outerDiameter: 16,
        boreInnerDiameter: 8,
        boltCircleDiameter: 12,
        boltCount: 4,
        boltHoleDiameter: 0.75,
      })
    )
    const placement = makePlacement("p3", "ff-2", 0, 0)
    const { offcuts, scrap } = computeAdaptiveRegions([placement], [fullFace], STOCK)
    const boltCutouts = scrap.filter((r) => r.source === "cutout" && r.width < 2 && r.height < 2)
    expect(boltCutouts.length).toBeGreaterThanOrEqual(4)
    // Sub-1\" bolt holes can't possibly meet the 11.5×12 or 6×24
    // reusable thresholds; none should leak into offcuts.
    const boltLeakedToOffcut = offcuts.filter((r) => r.source === "cutout" && r.width < 2)
    expect(boltLeakedToOffcut).toHaveLength(0)
  })

  it("obround gasket (no holes) emits no cutout regions", () => {
    const obround = makeTemplate(
      "ob-1",
      gasketSpecToPartTemplate({ kind: "obround", length: 6, width: 3 })
    )
    const placement = makePlacement("p4", "ob-1", 20, 20)
    const { offcuts, scrap } = computeAdaptiveRegions([placement], [obround], STOCK)
    const cutouts = [...offcuts, ...scrap].filter((r) => r.source === "cutout")
    expect(cutouts).toHaveLength(0)
  })
})
