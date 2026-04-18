import { describe, it, expect } from "vitest"
import "reflect-metadata"
import { LegacyPackingService } from "@/src/infrastructure/services/legacyPackingService"
import type { PackRequest } from "@/src/application/packing/types"

describe("LegacyPackingService skeleton", () => {
  it("constructs without error", () => {
    expect(() => new LegacyPackingService()).not.toThrow()
  })

  it("pack() throws 'not implemented' until Phase 3", async () => {
    const svc = new LegacyPackingService()
    const req: PackRequest = { bins: [], clearance: 0, items: [] }
    await expect(svc.pack(req)).rejects.toThrow(/not implemented/i)
  })

  it("cancel() throws 'not implemented' until Phase 3", async () => {
    const svc = new LegacyPackingService()
    await expect(svc.cancel("job-1")).rejects.toThrow(/not implemented/i)
  })
})
