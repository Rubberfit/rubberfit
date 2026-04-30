import { describe, it, expect } from "vitest"
import "reflect-metadata"
import { container } from "tsyringe"
import "@/di/resolve" // triggers registration
import { TOKENS } from "@/di/tokens"
import { PACKING_TOKENS } from "@/src/application/services/packing.service.interface"
import { ApiPackingService } from "@/src/infrastructure/services/apiPackingService"

// AutoNest packing now resolves to one of two implementations depending
// on environment:
//   - Browser (typeof window !== "undefined"): ApiPackingService, which
//     POSTs the PackRequest to /api/v2/pack.
//   - Server: RustPackingService, which spawns the pack-cli subprocess.
//
// Vitest runs tests under jsdom by default — `window` is defined — so the
// resolved service is ApiPackingService here. Server-side behaviour is
// covered by tests/packing/rustPackingService.test.ts.

describe("DI — IPackingService", () => {
  it("resolves IPackingService (jsdom env: ApiPackingService)", () => {
    const svc = container.resolve(PACKING_TOKENS.IPackingService)
    expect(svc).toBeInstanceOf(ApiPackingService)
  })

  it("is a singleton (same instance on repeated resolve)", () => {
    const a = container.resolve(PACKING_TOKENS.IPackingService)
    const b = container.resolve(PACKING_TOKENS.IPackingService)
    expect(a).toBe(b)
  })

  it("TOKENS.IPackingService and PACKING_TOKENS.IPackingService reference the same Symbol", () => {
    expect(TOKENS.IPackingService).toBe(PACKING_TOKENS.IPackingService)
  })
})
