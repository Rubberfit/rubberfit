import { describe, it, expect } from "vitest"
import "reflect-metadata"
import fs from "node:fs"
import path from "node:path"
import { RustPackingService } from "@/src/infrastructure/services/rustPackingService"
import type { PackRequest, PackResult } from "@/src/application/packing/types"

const FIXTURE_DIR = path.join(__dirname, "fixtures")
const RUST_BINARY = path.resolve("engine/target/release/pack-cli")

const files = fs
  .readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()

function stable(result: PackResult): unknown {
  // Efficiency rounded to 3 decimal places (0.1% resolution). LBF
  // multistart is seeded-deterministic but the polish pass introduces
  // ~1-in-10000 float drift across runs (f32→f64 rounding inside
  // jagua-rs → TS pipeline). 3 decimals is a fine regression gate
  // without being snapshot-flaky on float noise.
  return {
    placedCount: result.placedCount,
    overflowCount: result.overflowCount,
    perBin: result.perBin.map((bin) => ({
      binId: bin.binId,
      efficiency: Math.round(bin.efficiency * 1000) / 1000,
    })),
  }
}

function loadFixture(file: string): PackRequest {
  return JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, file), "utf-8")
  ) as PackRequest
}

const rustAvailable = fs.existsSync(RUST_BINARY)

// After Phase 3 rollout (commit 2026-04-19), pack-cli is the only engine.
// The legacy TS baseline + strict-dominance regression guard were removed
// when LegacyPackingService was deleted. Rust snapshots now serve as
// both the baseline and the regression gate — a placement-count change
// on any fixture will break the snapshot match and force a reviewer to
// either accept the new number or investigate.

describe("parity fixtures — rust baseline", () => {
  for (const file of files) {
    it.skipIf(!rustAvailable)(`rust: ${file}`, async () => {
      const result = await new RustPackingService().pack(loadFixture(file))
      expect(stable(result)).toMatchSnapshot(`rust_${file}`)
    })
  }
})
