import { describe, it, expect } from "vitest"
import "reflect-metadata"
import fs from "node:fs"
import { container } from "tsyringe"
import "@/di/resolve" // triggers registration
import { RUST_PACK_BINARY } from "@/di/di-registration"
import { TOKENS } from "@/di/tokens"
import { PACKING_TOKENS } from "@/src/application/services/packing.service.interface"
import { LegacyPackingService } from "@/src/infrastructure/services/legacyPackingService"
import { RustPackingService } from "@/src/infrastructure/services/rustPackingService"

const rustEngineDisabled =
  (process.env.USE_RUST_ENGINE ?? "").trim().toLowerCase() === "false"
const rustAvailable = !rustEngineDisabled && fs.existsSync(RUST_PACK_BINARY)

describe("DI — IPackingService", () => {
  it.skipIf(!rustAvailable)(
    "resolves IPackingService to the Rust engine when pack-cli is built",
    () => {
      const svc = container.resolve(PACKING_TOKENS.IPackingService)
      expect(svc).toBeInstanceOf(RustPackingService)
    }
  )

  it.skipIf(rustAvailable)(
    "falls back to LegacyPackingService when pack-cli is missing",
    () => {
      const svc = container.resolve(PACKING_TOKENS.IPackingService)
      expect(svc).toBeInstanceOf(LegacyPackingService)
    }
  )

  it("is a singleton (same instance on repeated resolve)", () => {
    const a = container.resolve(PACKING_TOKENS.IPackingService)
    const b = container.resolve(PACKING_TOKENS.IPackingService)
    expect(a).toBe(b)
  })

  it("TOKENS.IPackingService and PACKING_TOKENS.IPackingService reference the same Symbol", () => {
    expect(TOKENS.IPackingService).toBe(PACKING_TOKENS.IPackingService)
  })
})
