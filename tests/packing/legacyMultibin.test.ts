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
  })
})
