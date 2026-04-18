import { describe, it, expect } from "vitest"
import { generatePoNumber } from "@/src/infrastructure/services/generatePoNumber"

describe("generatePoNumber", () => {
  it("pads year to 2 digits and sequence to 4 digits", () => {
    expect(generatePoNumber(2026, 42)).toBe("PO-26-0042")
  })
  it("handles sequence rollover at 9999 (format-preserving)", () => {
    expect(generatePoNumber(2026, 12345)).toBe("PO-26-12345")
  })
  it("handles year beyond 99 (modulo)", () => {
    expect(generatePoNumber(2100, 1)).toBe("PO-00-0001")
  })
})
