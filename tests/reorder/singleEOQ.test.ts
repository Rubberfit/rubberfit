import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

describe("reorder: single EOQ implementation", () => {
  it("generate-reorder-suggestions does not hardcode DAILY_USAGE", () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../src/application/use-cases/reorder/generate-reorder-suggestions.use-case.ts"
      ),
      "utf-8"
    )
    expect(src).not.toMatch(/DAILY_USAGE\s*=\s*10/)
  })

  it("generate-reorder-suggestions delegates to reorderCalculations", () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../src/application/use-cases/reorder/generate-reorder-suggestions.use-case.ts"
      ),
      "utf-8"
    )
    expect(src).toMatch(/reorderCalculations|IReorderCalculationsService|ReorderCalculationsService/)
  })
})
