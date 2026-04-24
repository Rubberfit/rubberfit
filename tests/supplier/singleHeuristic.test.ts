import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

describe("supplier selection: single heuristic", () => {
  it("reorderCalculations does not cheapest-per-sqft rank", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../src/infrastructure/services/reorderCalculations.ts"),
      "utf-8"
    )
    // heuristic signature: sorting suppliers by cost_per_sqft
    expect(src).not.toMatch(/cost_per_sqft\s*-\s*[a-zA-Z_]+\.cost_per_sqft/)
  })
})
