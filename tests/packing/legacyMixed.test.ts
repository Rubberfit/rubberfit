import { describe, it, expect } from "vitest"
import "reflect-metadata"
import { LegacyPackingService } from "@/src/infrastructure/services/legacyPackingService"
import { buildPart } from "@/src/application/packing/buildPart"
import { buildPackRequest } from "@/src/application/packing/buildPackRequest"

describe("LegacyPackingService — mixed items", () => {
  it("places two different rects using GA solver", async () => {
    const svc = new LegacyPackingService()
    const a = buildPart({
      shapeId: "a",
      quantity: 2,
      shapeSpec: { kind: "rect", params: { width: 10, height: 5 } },
      allowRotation: true,
    })
    const b = buildPart({
      shapeId: "b",
      quantity: 2,
      shapeSpec: { kind: "rect", params: { width: 8, height: 4 } },
      allowRotation: true,
    })
    const req = buildPackRequest({
      bins: [{ binId: "b1", width: 48, height: 96, kind: "fresh" }],
      items: [a, b],
      clearance: 0.125,
      mode: "fast",
      seed: 42,
    })
    const result = await svc.pack(req)
    expect(result.placedCount).toBe(4)
    expect(result.overflowCount).toBe(0)

    // Fix 1: shapeId is canonical ("a" or "b"), no -N suffix
    const shapeIds = result.placements.map((p) => p.shapeId)
    expect(shapeIds.every((id) => id === "a" || id === "b")).toBe(true)

    // Fix 2: instanceIndex is per-shape (each shape gets 0..quantity-1)
    const aPlacements = result.placements.filter((p) => p.shapeId === "a")
    const bPlacements = result.placements.filter((p) => p.shapeId === "b")
    expect(aPlacements.map((p) => p.instanceIndex).sort()).toEqual([0, 1])
    expect(bPlacements.map((p) => p.instanceIndex).sort()).toEqual([0, 1])
  })
})
