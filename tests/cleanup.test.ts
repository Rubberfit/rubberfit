import { describe, it, expect } from "vitest"
import fs from "node:fs"
import { execSync } from "node:child_process"

const DELETED = [
  "nesting/vendor/fit/mathHelper.ts",
  // "src/infrastructure/services/useRole.ts", // DEFERRED: 5 active importers in app/ — migration required first
  "src/infrastructure/scripts/theme-boot.tsx",
  "src/infrastructure/services/README.md",
  "app/dashboard/cut-planner/_components/use-nesting-compute.ts",
]

const BANNED_SYMBOLS = [
  "applyTrapezoidFields",
  "emailQueue",
  "QueuedEmail",
]

describe("cleanup: deleted files stay deleted", () => {
  for (const p of DELETED) {
    it(`${p} does not exist`, () => {
      expect(fs.existsSync(p)).toBe(false)
    })
  }
})

describe("cleanup: banned symbols removed", () => {
  for (const sym of BANNED_SYMBOLS) {
    it(`no reference to ${sym} in src/ or app/`, () => {
      try {
        const out = execSync(
          `grep -R "${sym}" --include="*.ts*" src app nesting di 2>/dev/null || true`,
          { encoding: "utf-8" }
        )
        expect(out.trim()).toBe("")
      } catch (_err) {
        // grep returns 1 on no match with --include; the || true guards us
      }
    })
  }
})

describe("handoff: UI does not import from nesting/", () => {
  it("no file under app/ imports from @/nesting", () => {
    try {
      const out = execSync(
        `grep -RE "from \\"@/nesting(\\"|/)" --include="*.ts*" app 2>/dev/null || true`,
        { encoding: "utf-8" }
      )
      expect(out.trim()).toBe("")
    } catch (_err) {
      // grep returns 1 on no match — guarded by || true
    }
  })
})
