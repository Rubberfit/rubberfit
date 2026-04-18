import { describe, it, expect } from "vitest"
import "reflect-metadata"
import { container } from "tsyringe"
import "@/di/resolve" // triggers registration
import { PACKING_TOKENS } from "@/src/application/services/packing.service.interface"
import { LegacyPackingService } from "@/src/infrastructure/services/legacyPackingService"

describe("DI — IPackingService", () => {
  it("resolves IPackingService to LegacyPackingService", () => {
    const svc = container.resolve(PACKING_TOKENS.IPackingService)
    expect(svc).toBeInstanceOf(LegacyPackingService)
  })

  it("is a singleton (same instance on repeated resolve)", () => {
    const a = container.resolve(PACKING_TOKENS.IPackingService)
    const b = container.resolve(PACKING_TOKENS.IPackingService)
    expect(a).toBe(b)
  })
})
