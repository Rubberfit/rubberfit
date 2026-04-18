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
  })
})
