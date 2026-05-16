import { describe, expect, it } from "vitest"
import { detectSvgUnits } from "@/src/application/cad/detect-svg-units"

describe("detectSvgUnits", () => {
  it("returns mm + scale 1 for width='100mm' with matching viewBox", () => {
    const result = detectSvgUnits({ width: "100mm", height: "50mm", viewBox: "0 0 100 50" })
    expect(result.units).toBe("mm")
    expect(result.userUnitScale).toBeCloseTo(1, 9)
  })

  it("returns inch + scale 1 for width='4in'", () => {
    const result = detectSvgUnits({ width: "4in", height: "4in", viewBox: "0 0 4 4" })
    expect(result.units).toBe("inch")
    expect(result.userUnitScale).toBeCloseTo(1, 9)
  })

  it("converts cm to mm and computes scale relative to viewBox", () => {
    // 10cm = 100mm physical; viewBox width 200 user units -> 0.5 mm/user-unit.
    const result = detectSvgUnits({ width: "10cm", height: "10cm", viewBox: "0 0 200 200" })
    expect(result.units).toBe("mm")
    expect(result.userUnitScale).toBeCloseTo(0.5, 9)
  })

  it("returns undefined for unit-less width (operator picks)", () => {
    const result = detectSvgUnits({ width: "800", height: "600", viewBox: "0 0 800 600" })
    expect(result.units).toBeUndefined()
    expect(result.userUnitScale).toBe(1)
  })

  it("returns undefined for px-suffixed width (ambiguous DPI)", () => {
    const result = detectSvgUnits({ width: "800px", height: "600px", viewBox: "0 0 800 600" })
    expect(result.units).toBeUndefined()
    expect(result.userUnitScale).toBe(1)
  })

  it("returns undefined for missing width", () => {
    const result = detectSvgUnits({ viewBox: "0 0 200 200" })
    expect(result.units).toBeUndefined()
    expect(result.userUnitScale).toBe(1)
  })

  it("returns undefined for malformed width", () => {
    const result = detectSvgUnits({ width: "100abc", height: "100mm" })
    expect(result.units).toBeUndefined()
    expect(result.userUnitScale).toBe(1)
  })

  it("derives scale when viewBox is absent — falls back to 1:1 in the unit space", () => {
    const result = detectSvgUnits({ width: "100mm", height: "50mm" })
    expect(result.units).toBe("mm")
    expect(result.userUnitScale).toBeCloseTo(1, 9)
  })

  it("handles comma-separated viewBox", () => {
    const result = detectSvgUnits({ width: "100mm", viewBox: "0,0,50,50" })
    expect(result.units).toBe("mm")
    expect(result.userUnitScale).toBeCloseTo(2, 9)
  })
})
