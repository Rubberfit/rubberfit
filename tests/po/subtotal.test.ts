import { describe, it, expect } from "vitest"
import { computePoSubtotal } from "@/src/application/computePoSubtotal"

describe("computePoSubtotal", () => {
  it("sums quantitySqft * unitCost per line", () => {
    expect(
      computePoSubtotal([
        { quantitySqft: 10, unitCost: 2 },
        { quantitySqft: 5, unitCost: 3 },
      ])
    ).toBe(35)
  })
  it("returns 0 on empty", () => {
    expect(computePoSubtotal([])).toBe(0)
  })
})
