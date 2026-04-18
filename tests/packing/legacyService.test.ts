import { describe, it, expect } from "vitest"
import "reflect-metadata"
import { LegacyPackingService } from "@/src/infrastructure/services/legacyPackingService"
import { buildPart } from "@/src/application/packing/buildPart"
import type { PackRequest } from "@/src/application/packing/types"

describe("LegacyPackingService skeleton", () => {
  it("constructs without error", () => {
    expect(() => new LegacyPackingService()).not.toThrow()
  })

  it("cancel() resolves without throwing for any jobId", async () => {
    const svc = new LegacyPackingService()
    await expect(svc.cancel("job-1")).resolves.toBeUndefined()
  })

  it("pack() throws /bins required/i when bins are empty", async () => {
    const svc = new LegacyPackingService()
    const req: PackRequest = { bins: [], clearance: 0, items: [] }
    await expect(svc.pack(req)).rejects.toThrow(/bins required/i)
  })

  it("pack() throws /items required/i when items are empty", async () => {
    const svc = new LegacyPackingService()
    const req: PackRequest = {
      bins: [{ binId: "b1", width: 48, height: 96, kind: "fresh" }],
      clearance: 0,
      items: [],
    }
    await expect(svc.pack(req)).rejects.toThrow(/items required/i)
  })

  it("pack() resolves on mixed-part input (routed to GA solver)", async () => {
    const svc = new LegacyPackingService()
    const partA = buildPart({
      shapeId: "rect-a",
      quantity: 1,
      shapeSpec: { kind: "rect", params: { width: 10, height: 5 } },
      allowRotation: false,
    })
    const partB = buildPart({
      shapeId: "rect-b",
      quantity: 1,
      shapeSpec: { kind: "rect", params: { width: 6, height: 4 } },
      allowRotation: false,
    })
    const req: PackRequest = {
      bins: [{ binId: "b1", width: 48, height: 96, kind: "fresh" }],
      clearance: 0,
      items: [partA, partB],
    }
    await expect(svc.pack(req)).resolves.toBeDefined()
  })
})
