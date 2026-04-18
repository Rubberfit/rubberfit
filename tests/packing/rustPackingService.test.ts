import { describe, it, expect } from "vitest"
import "reflect-metadata"
import fs from "node:fs"
import path from "node:path"
import { RustPackingService } from "@/src/infrastructure/services/rustPackingService"
import type { PackRequest } from "@/src/application/packing/types"

const BINARY = path.resolve("engine/target/release/pack-cli")
const rustAvailable = fs.existsSync(BINARY)

describe("RustPackingService", () => {
  it.skipIf(!rustAvailable)(
    "spawns pack-cli and returns PackResult",
    async () => {
      const svc = new RustPackingService()
      const req: PackRequest = {
        bins: [{ binId: "b1", width: 48, height: 96, kind: "fresh" }],
        clearance: 0.125,
        items: [
          {
            shapeId: "r",
            quantity: 1,
            polygon: [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
              { x: 10, y: 5 },
              { x: 0, y: 5 },
            ],
            allowRotation: true,
          },
        ],
        mode: "fast",
        seed: 42,
      }
      const result = await svc.pack(req)
      expect(result.placedCount).toBe(1)
      expect(result.overflowCount).toBe(0)
      expect(result.placements).toHaveLength(1)
      expect(result.placements[0]?.binId).toBe("b1")
      expect(result.perBin).toHaveLength(1)
      expect(result.perBin[0]?.binId).toBe("b1")
    }
  )

  it.skipIf(!rustAvailable)(
    "rejects on empty items with stderr surfaced",
    async () => {
      const svc = new RustPackingService()
      const req: PackRequest = {
        bins: [{ binId: "b1", width: 48, height: 96, kind: "fresh" }],
        clearance: 0.125,
        items: [],
        mode: "fast",
      }
      await expect(svc.pack(req)).rejects.toThrow(/items/i)
    }
  )

  it.skipIf(!rustAvailable)(
    "rejects on empty bins with stderr surfaced",
    async () => {
      const svc = new RustPackingService()
      const req: PackRequest = {
        bins: [],
        clearance: 0.125,
        items: [
          {
            shapeId: "r",
            quantity: 1,
            polygon: [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
              { x: 10, y: 5 },
              { x: 0, y: 5 },
            ],
            allowRotation: true,
          },
        ],
        mode: "fast",
      }
      await expect(svc.pack(req)).rejects.toThrow(/bins/i)
    }
  )

  it("cancel() is a silent no-op", async () => {
    const svc = new RustPackingService()
    await expect(svc.cancel("any-job-id")).resolves.toBeUndefined()
  })

  it("reports missing binary as a spawn error", async () => {
    const svc = new RustPackingService("/definitely/not/a/real/path/pack-cli")
    const req: PackRequest = {
      bins: [{ binId: "b1", width: 48, height: 96, kind: "fresh" }],
      clearance: 0.125,
      items: [
        {
          shapeId: "r",
          quantity: 1,
          polygon: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 },
          ],
          allowRotation: true,
        },
      ],
      mode: "fast",
    }
    await expect(svc.pack(req)).rejects.toThrow()
  })
})
