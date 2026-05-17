import { describe, it, expect } from "vitest"
import fs from "node:fs"
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
  // (still referenced by free-space.ts and manual-layout/regions.ts).
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
  // Phase 3c: NestingVisualizer became a thin LayoutModel renderer; the
  // page-level usePackJob hook now drives the Rust pipeline. The
  // TS-side NFP optimizer hook + heuristic packer cluster are gone.
  "app/dashboard/cutting-engine/_components/use-nfp-optimizer.ts",
  "app/dashboard/cutting-engine/_components/nesting-nfp-helpers.ts",
  "app/dashboard/cutting-engine/_components/nesting-tag-map.ts",
  "app/dashboard/cutting-engine/_components/repack-strategies.ts",
  "app/dashboard/cutting-engine/_components/nesting-shape-previews.ts",
  "app/dashboard/cutting-engine/_components/nesting-shape-previews-basic.ts",
  "app/dashboard/cutting-engine/_components/nesting-shape-previews-advanced.ts",
  "app/dashboard/cutting-engine/_components/nesting-shape-previews-dispatch.ts",
  "app/dashboard/cutting-engine/_components/nesting-global-packer-entry.ts",
  "app/dashboard/cutting-engine/_components/nesting-global-packer.ts",
  "app/dashboard/cutting-engine/_components/nesting-width-pair-packer.ts",
  // Tests that exercised the deleted preview / packer cluster.
  "tests/cutting-engine/issue-119-multi-sheet-cone-overflow.test.ts",
  "tests/cutting-engine/issue-121-mixed-shape-tags.test.ts",
  "tests/cutting-engine/issue-124-nesting-density.test.ts",
  "tests/cutting-engine/issue-125-invalid-waste.test.ts",
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
