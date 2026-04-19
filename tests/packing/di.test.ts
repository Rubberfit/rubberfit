import { describe, it, expect } from "vitest"
import "reflect-metadata"
import { container } from "tsyringe"
import "@/di/resolve" // triggers registration
import { TOKENS } from "@/di/tokens"
import { PACKING_TOKENS } from "@/src/application/services/packing.service.interface"
import { RustPackingService } from "@/src/infrastructure/services/rustPackingService"

// After Phase 3 production rollout the legacy TS packer was removed —
// pack-cli is now the only engine. DI fails fast in di-registration.ts
// if the binary is missing (no more fallback). These tests therefore
// assume the binary is present (pretest hook rebuilds it on every run).

describe("DI — IPackingService", () => {
  it("resolves IPackingService to the Rust engine", () => {
    const svc = container.resolve(PACKING_TOKENS.IPackingService)
    expect(svc).toBeInstanceOf(RustPackingService)
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
