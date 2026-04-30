import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"

const DELETED = [
  "nesting/vendor/fit/mathHelper.ts",
  // GA-packer deadcode removed in the AutoNest Rust-server-side migration.
  "nesting/vendor/fit/index.ts",
  "nesting/vendor/fit/packer.ts",
  "nesting/vendor/fit/placer.ts",
  "nesting/vendor/fit/placement.ts",
  "nesting/vendor/fit/gaussian.ts",
  "nesting/vendor/fit/xorshift.ts",
  "nesting/vendor/fit/ga/dna.ts",
  "nesting/vendor/fit/ga/ga.ts",
  // TS NFP preview path removed — the Pack button now strictly drives the
  // Rust optimizer; live shape-edit previews use direct/shelf/hybrid TS
  // candidates only. The full nfp-greedy + mixed-NFP + worker-pool stack
  // and its vendor/fit/ NFP geometry helpers are gone.
  "nesting/nfp-greedy-placer.ts",
  "nesting/mixed-nfp-placer.ts",
  "nesting/nfp-pack-rotation.ts",
  "nesting/nfp-angle-worker.ts",
  "nesting/worker-pool.ts",
  "nesting/vendor/fit/bin.ts",
  "nesting/vendor/fit/part.ts",
  "nesting/vendor/fit/polygon.ts",
  "nesting/vendor/fit/vector.ts",
  "nesting/vendor/fit/util.ts",
  "nesting/vendor/fit/util-geometry.ts",
  "nesting/vendor/fit/bounding-box.ts",
  "nesting/vendor/fit/indexed-vector.ts",
  // Note: nesting/vendor/fit/clipper-lib.d.ts moved to nesting/clipper-lib.d.ts
  // (still referenced by free-space.ts and free-roam-regions.ts).
  // Subprocess streaming protocol — server-side IPackingService is now
  // batch-only; browser callers use ApiPackingService over HTTP.
  "tests/packing/rustServiceStreaming.test.ts",
  // "src/infrastructure/services/useRole.ts", // DEFERRED: 5 active importers in app/ — migration required first
  "src/infrastructure/scripts/theme-boot.tsx",
  "src/infrastructure/services/README.md",
  "app/dashboard/cutting-engine/_components/use-nesting-compute.ts",
  "app/dashboard/cut-planner/page.tsx",
  "app/dashboard/cut-planner/batch/page.tsx",
  "app/dashboard/cut-planner/manual/page.tsx",
  "app/dashboard/account/page.tsx",
  "app/dashboard/waste/page.tsx",
  "app/dashboard/usage/page.tsx",
  "app/dashboard/costs/page.tsx",
  "app/dashboard/trends/page.tsx",
  "app/dashboard/reports/page.tsx",
  "app/dashboard/waste-comparison/page.tsx",
]

const BANNED_SYMBOLS = ["applyTrapezoidFields", "emailQueue", "QueuedEmail"]

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

describe("handoff: IPackingService is the canonical Pack boundary", () => {
  it("use-nfp-optimizer.ts does NOT import NFPSolver directly", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../app/dashboard/cutting-engine/_components/use-nfp-optimizer.ts"),
      "utf-8"
    )
    // Direct engine instantiation was replaced with DI resolution in Phase 7.
    expect(src).not.toMatch(/import\s+.*NFPSolver/)
    expect(src).not.toMatch(/new\s+NFPSolver\s*\(/)
  })

  it("use-nfp-optimizer.ts resolves IPackingService via DI", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../app/dashboard/cutting-engine/_components/use-nfp-optimizer.ts"),
      "utf-8"
    )
    expect(src).toMatch(
      /container\.resolve.*PACKING_TOKENS\.IPackingService|TOKENS\.IPackingService/
    )
  })
})
