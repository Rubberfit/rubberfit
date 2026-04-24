import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

describe("tax: single 8% fallback", () => {
  it("reorderCalculations does not hardcode 0.08", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../src/infrastructure/services/reorderCalculations.ts"),
      "utf-8"
    )
    expect(src).not.toMatch(/0\.08/)
  })

  it("create-reorder-purchase-order use-case does not hardcode 0.08", () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../src/application/use-cases/reorder/create-reorder-purchase-order.use-case.ts"
      ),
      "utf-8"
    )
    expect(src).not.toMatch(/0\.08/)
  })
})
