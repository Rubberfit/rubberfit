import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

describe("cutService: no app-side roll decrement", () => {
  it("legacyCutService does not update rolls.remaining_length", () => {
    // The legacy raw-row recordCut path is what historically risked
    // an app-side decrement. The new entity-typed cutService.ts is a
    // thin orchestrator over ICutsRepository and never touches rolls
    // — checking it would be redundant. Guard the legacy shim where
    // the hazard actually lives.
    const src = fs.readFileSync(
      path.join(__dirname, "../../src/infrastructure/services/legacyCutService.ts"),
      "utf-8"
    )
    // Any update to rolls with remaining_length field indicates app-side decrement
    expect(src).not.toMatch(/\.from\(["']rolls["']\)\s*\.update\([^)]*remaining_length/)
  })
})
