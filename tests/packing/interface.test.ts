import { describe, it, expectTypeOf, expect } from "vitest"
import type {
  IPackingService,
} from "@/src/application/services/packing.service.interface"
import {
  PACKING_TOKENS,
} from "@/src/application/services/packing.service.interface"
import type {
  PackRequest, PackResult,
} from "@/src/application/packing/types"

describe("IPackingService", () => {
  it("has pack(request, onProgress?) returning Promise<PackResult>", () => {
    expectTypeOf<IPackingService["pack"]>()
      .parameter(0).toEqualTypeOf<PackRequest>()
    expectTypeOf<IPackingService["pack"]>()
      .returns.toEqualTypeOf<Promise<PackResult>>()
  })

  it("has cancel(jobId) returning Promise<void>", () => {
    expectTypeOf<IPackingService["cancel"]>()
      .parameter(0).toBeString()
    expectTypeOf<IPackingService["cancel"]>()
      .returns.toEqualTypeOf<Promise<void>>()
  })

  it("PACKING_TOKENS.IPackingService is a Symbol", () => {
    expect(typeof PACKING_TOKENS.IPackingService).toBe("symbol")
  })
})
