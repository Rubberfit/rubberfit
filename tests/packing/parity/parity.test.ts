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

// S2 scope: the Rust engine uses warm-start greedy bottom-left only. The real
// metaheuristic search (sparrow LNS+SA) lands in S2.5, and the strict
// "rust >= legacy" tolerance belongs in the S2.5 benchmark harness.
//
// For S2 we only guarantee conservation (items are fully accounted for) and
// non-trivial output (engine did something). The snapshots above lock in the
// per-engine behavior so either side regressing is still caught.
//
// TODO(S2.5): tighten to rust.placedCount >= legacy.placedCount and per-bin
// efficiency within 0.5%. See docs/superpowers/specs/2026-04-17-migration-
// overview-design.md section 3 (S2.5).
describe("parity fixtures — rust regression guard", () => {
  for (const file of files) {
    it.skipIf(!rustAvailable)(
      `rust accounts for all items: ${file}`,
      async () => {
        const fixture = loadFixture(file)
        const [legacy, rust] = await Promise.all([
          new LegacyPackingService().pack(fixture),
          new RustPackingService().pack(fixture),
        ])
        expect(rust.placedCount + rust.overflowCount).toBe(
          legacy.placedCount + legacy.overflowCount
        )
        expect(rust.placedCount + rust.overflowCount).toBeGreaterThan(0)
      }
    )
  }
})
