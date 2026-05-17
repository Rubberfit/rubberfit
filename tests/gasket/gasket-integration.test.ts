import { describe, expect, it } from "vitest"

import { gasketSpecToPartTemplate } from "@/app/dashboard/cutting-engine/_components/gasket-template"
import { templateToPart } from "@/app/dashboard/cutting-engine/_components/template-to-part"
import { assertNotNull } from "../_helpers/assert-not-null"

/**
 * End-to-end smoke: gasket spec → PartTemplate → templateToPart → Part.
 * `templateToPart` calls `buildPart` internally, so this exercises the
 * full PolygonWithHoles wire contract added by PR 0a/0b/0c plus PR A's
 * `buildPart::normalizePolygon` hole-preservation work. Failure here
 * would point at a contract regression upstream, not at gasket-template.
 */
describe("gasket → templateToPart → Part end-to-end", () => {
  it("ring spec yields a Part with outer + 1 hole", () => {
    const partial = gasketSpecToPartTemplate({
      kind: "ring",
      outerDiameter: 12,
      innerDiameter: 8,
    })
    const tmpl = { ...partial, id: "test-ring", quantity: 1 }
    const part = templateToPart(tmpl, "A")
    assertNotNull(part)
    assertNotNull(part.polygon)
    expect(part.polygon.outer.length).toBeGreaterThanOrEqual(16)
    expect(part.polygon.holes).toHaveLength(1)
    expect(part.polygon.holes[0].length).toBeGreaterThanOrEqual(16)
    // Tag round-trips so Konva labels show the operator's tag letter.
    expect(part.tag).toBe("A")
  })

  it("full-face spec yields a Part with outer + (1 + boltCount) holes", () => {
    const partial = gasketSpecToPartTemplate({
      kind: "full-face",
      outerDiameter: 16,
      boreInnerDiameter: 8,
      boltCircleDiameter: 12,
      boltCount: 8,
      boltHoleDiameter: 0.75,
    })
    const tmpl = { ...partial, id: "test-fullface", quantity: 2 }
    const part = templateToPart(tmpl, "B")
    assertNotNull(part)
    assertNotNull(part.polygon)
    expect(part.polygon.holes).toHaveLength(9)
    expect(part.quantity).toBe(2)
  })

  it("obround spec yields a Part with no holes", () => {
    const partial = gasketSpecToPartTemplate({
      kind: "obround",
      length: 6,
      width: 3,
    })
    const tmpl = { ...partial, id: "test-obround", quantity: 1 }
    const part = templateToPart(tmpl, undefined)
    assertNotNull(part)
    assertNotNull(part.polygon)
    expect(part.polygon.holes).toHaveLength(0)
    expect(part.polygon.outer.length).toBeGreaterThan(16)
  })

  it("Part allows rotation (matches existing polygon-template behavior)", () => {
    const partial = gasketSpecToPartTemplate({
      kind: "ring",
      outerDiameter: 10,
      innerDiameter: 6,
    })
    const part = templateToPart({ ...partial, id: "rot-test", quantity: 1 }, undefined)
    assertNotNull(part)
    expect(part.allowRotation).toBe(true)
  })
})
