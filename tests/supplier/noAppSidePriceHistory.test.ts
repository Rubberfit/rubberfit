import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

describe("supplierService: no app-side price_history insert on update", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../../src/infrastructure/services/supplierService.ts"),
    "utf-8"
  )

  it("supplierService does not directly insert into price_history", () => {
    expect(src).not.toMatch(/\.from\(["']price_history["']\)\s*\.insert/)
  })

  it("updateMaterialSupplier does not call priceHistoryService.trackPriceChange", () => {
    const updateMethod = src.match(/async updateMaterialSupplier[\s\S]*?^ {2}\}/m)?.[0] ?? ""
    expect(updateMethod).not.toMatch(/trackPriceChange/)
  })
})
