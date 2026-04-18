import { describe, it, expect } from "vitest"
import "reflect-metadata"
import fs from "node:fs"
import path from "node:path"
import { LegacyPackingService } from "@/src/infrastructure/services/legacyPackingService"
import type { PackRequest } from "@/src/application/packing/types"

const FIXTURE_DIR = path.join(__dirname, "fixtures")

describe("parity fixtures", () => {
  const files = fs.readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json"))

  for (const file of files) {
    it(`snapshot: ${file}`, async () => {
      const fixture = JSON.parse(
        fs.readFileSync(path.join(FIXTURE_DIR, file), "utf-8")
      ) as PackRequest
      const svc = new LegacyPackingService()
      const result = await svc.pack(fixture)

      const stable = {
        placedCount: result.placedCount,
        overflowCount: result.overflowCount,
        perBin: result.perBin.map((b) => ({
          binId: b.binId,
          efficiency: Math.round(b.efficiency * 10000) / 10000,
        })),
      }
      expect(stable).toMatchSnapshot()
    })
  }
})
