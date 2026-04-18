import { describe, it, expect } from "vitest"
import "reflect-metadata"
import { LegacyPackingService } from "@/src/infrastructure/services/legacyPackingService"
import { buildPart } from "@/src/application/packing/buildPart"
import { buildPackRequest } from "@/src/application/packing/buildPackRequest"

describe("LegacyPackingService — multi-bin", () => {
  it("spills overflow onto a second bin", async () => {
    const svc = new LegacyPackingService()
    // 40 copies of a 10x10 rect on two 48x48 bins = can't all fit on one
    const part = buildPart({
      shapeId: "rect-a",
      quantity: 40,
      shapeSpec: { kind: "rect", params: { width: 10, height: 10 } },
      allowRotation: true,
    })
    const req = buildPackRequest({
      bins: [
        { binId: "b1", width: 48, height: 48, kind: "fresh" },
        { binId: "b2", width: 48, height: 48, kind: "fresh" },
      ],
      items: [part],
      clearance: 0.125,
      mode: "fast",
    })
    const result = await svc.pack(req)
    const binsUsed = new Set(result.placements.map((p) => p.binId))
    expect(binsUsed.size).toBeGreaterThan(1)

    // Quantity accounting: every requested piece accounted for
    expect(result.placedCount + result.overflowCount).toBe(40)

    // BinResult exists for each visited bin
    expect(result.perBin.length).toBeGreaterThanOrEqual(1)
    expect(result.perBin.length).toBeLessThanOrEqual(2)

    // All placements reference a requested bin
    expect(result.placements.every((p) => p.binId === "b1" || p.binId === "b2")).toBe(true)

    // Fix 1: globally unique per-shape instanceIndex across bins
    const indices = result.placements.map((p) => p.instanceIndex).sort((a, b) => a - b)
    // No duplicates
    expect(new Set(indices).size).toBe(indices.length)
    // Zero-indexed contiguous
    for (let i = 0; i < indices.length; i++) {
      expect(indices[i]).toBe(i)
    }
  })
})
