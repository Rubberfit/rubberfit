import { describe, it, expect } from "vitest"
import "reflect-metadata"
import { LegacyPackingService } from "@/src/infrastructure/services/legacyPackingService"
import { buildPart } from "@/src/application/packing/buildPart"
import { buildPackRequest } from "@/src/application/packing/buildPackRequest"

describe("LegacyPackingService — homogeneous rect pack", () => {
  it("places six 10x5 rects on a 48x96 bin", async () => {
    const svc = new LegacyPackingService()
    const part = buildPart({
      shapeId: "rect-a",
      quantity: 6,
      shapeSpec: { kind: "rect", params: { width: 10, height: 5 } },
      allowRotation: true,
    })
    const req = buildPackRequest({
      bins: [{ binId: "b1", width: 48, height: 96, kind: "fresh" }],
      items: [part],
      clearance: 0.125,
      mode: "fast",
      seed: 42,
    })
    const result = await svc.pack(req)
    expect(result.placedCount).toBe(6)
    expect(result.overflowCount).toBe(0)
    expect(result.perBin[0].binId).toBe("b1")
    expect(result.placements.every((p) => p.binId === "b1")).toBe(true)
    expect(result.totalUsedArea).toBeGreaterThan(0)
    expect(result.perBin[0].efficiency).toBeGreaterThan(0)
  })
})
