import { describe, it, expect } from "vitest"
import "reflect-metadata"
import fs from "node:fs"
import path from "node:path"
import { LegacyPackingService } from "@/src/infrastructure/services/legacyPackingService"
import { RustPackingService } from "@/src/infrastructure/services/rustPackingService"
import type { PackRequest, PackResult } from "@/src/application/packing/types"

const FIXTURE_DIR = path.join(__dirname, "fixtures")
const RUST_BINARY = path.resolve("engine/target/release/pack-cli")

const files = fs
  .readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()

function stable(result: PackResult): unknown {
  return {
    placedCount: result.placedCount,
    overflowCount: result.overflowCount,
    perBin: result.perBin.map((bin) => ({
      binId: bin.binId,
      efficiency: Math.round(bin.efficiency * 10000) / 10000,
    })),
  }
}

function loadFixture(file: string): PackRequest {
  return JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, file), "utf-8")
  ) as PackRequest
}

const rustAvailable = fs.existsSync(RUST_BINARY)

describe("parity fixtures — legacy baseline", () => {
  for (const file of files) {
    it(`legacy: ${file}`, async () => {
      const result = await new LegacyPackingService().pack(loadFixture(file))
      expect(stable(result)).toMatchSnapshot(`legacy_${file}`)
    })
  }
})

describe("parity fixtures — rust baseline", () => {
  for (const file of files) {
    it.skipIf(!rustAvailable)(`rust: ${file}`, async () => {
      const result = await new RustPackingService().pack(loadFixture(file))
      expect(stable(result)).toMatchSnapshot(`rust_${file}`)
    })
  }
})

// Task 19b (S2.5c): strict regression guard — `rust.placedCount >=
// legacy.placedCount` and `rust.overflowCount <= legacy.overflowCount`
// on every fixture. Task 19a's 2D grid warm-start closed the gap that
// used to block this tightening (the 4 homogeneous fixtures where
// Rust's old vertical stacker placed fewer items than legacy).
//
// Efficiency tolerance is loose (1%) to absorb per-bin rounding noise
// without masking real regressions. Rust's density >= legacy's on
// every touched bin is asserted separately by the top-level bench
// report at docs/superpowers/benchmarks/2026-04-18-s2.5-results.md.
const EFFICIENCY_TOLERANCE = 0.01

describe("parity fixtures — rust regression guard (S2.5 strict)", () => {
  for (const file of files) {
    it.skipIf(!rustAvailable)(
      `rust >= legacy on ${file}`,
      async () => {
        const fixture = loadFixture(file)
        const [legacy, rust] = await Promise.all([
          new LegacyPackingService().pack(fixture),
          new RustPackingService().pack(fixture),
        ])

        // 1. Conservation — same total items accounted for.
        expect(rust.placedCount + rust.overflowCount).toBe(
          legacy.placedCount + legacy.overflowCount
        )
        expect(rust.placedCount + rust.overflowCount).toBeGreaterThan(0)

        // 2. Strict dominance — Rust places at least as many items.
        expect(rust.placedCount).toBeGreaterThanOrEqual(legacy.placedCount)
        expect(rust.overflowCount).toBeLessThanOrEqual(legacy.overflowCount)

        // 3. Per-bin efficiency — Rust within EFFICIENCY_TOLERANCE of
        //    legacy on bins both engines used. Cross-bin operators can
        //    legitimately shift items between bins, so empty-vs-filled
        //    pairs are skipped.
        for (const legBin of legacy.perBin) {
          const rustBin = rust.perBin.find((b) => b.binId === legBin.binId)
          if (!rustBin) continue
          const bothHavePlacements =
            legBin.efficiency > 0 && rustBin.efficiency > 0
          if (!bothHavePlacements) continue
          expect(rustBin.efficiency).toBeGreaterThanOrEqual(
            legBin.efficiency - EFFICIENCY_TOLERANCE
          )
        }
      }
    )
  }
})
