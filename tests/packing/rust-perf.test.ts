import { describe, it, expect } from "vitest"
import "reflect-metadata"
import fs from "node:fs"
import path from "node:path"
import { RustPackingService } from "@/src/infrastructure/services/rustPackingService"
import type { PackRequest } from "@/src/application/packing/types"

const FIXTURE_DIR = path.join(__dirname, "parity/fixtures")
const RUST_BINARY = path.resolve("engine/target/release/pack-cli")

const files = fs
  .readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()

const rustAvailable = fs.existsSync(RUST_BINARY)
const FAST_WALL_CLOCK_BUDGET_MS = 3_000

describe("rust engine — time-budget regression guard", () => {
  for (const file of files) {
    it.skipIf(!rustAvailable)(
      `fast mode finishes < ${FAST_WALL_CLOCK_BUDGET_MS}ms: ${file}`,
      async () => {
        const fixture = JSON.parse(
          fs.readFileSync(path.join(FIXTURE_DIR, file), "utf-8")
        ) as PackRequest
        fixture.mode = "fast"
        const start = Date.now()
        await new RustPackingService().pack(fixture)
        const elapsed = Date.now() - start
        expect(elapsed).toBeLessThan(FAST_WALL_CLOCK_BUDGET_MS)
      }
    )
  }
})
