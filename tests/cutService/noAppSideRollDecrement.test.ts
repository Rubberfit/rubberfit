import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

describe("cutService: no app-side roll decrement", () => {
  it("cutService does not update rolls.remaining_length", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../src/infrastructure/services/cutService.ts"),
      "utf-8"
    )
    // Any update to rolls with remaining_length field indicates app-side decrement
    expect(src).not.toMatch(/\.from\(["']rolls["']\)\s*\.update\([^)]*remaining_length/)
  })
})
