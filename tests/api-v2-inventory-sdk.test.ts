/**
 * Inventory typed SDK tests.
 *
 * The flag-OFF legacy fallbacks were retired (see
 * `src/infrastructure/api-client/rf/inventory.ts` burial — mirrors the
 * cut-history / PO / reorder pattern). Coverage left here:
 *
 *   - Flag-OFF on every aggregate throws a clear, operator-facing error.
 *   - Flag-ON wires the right `/api/v2/inventory/*` URL, forwards query
 *     params, normalises DTO null → TS undefined, surfaces machine error
 *     codes, and handles the 404 → null contract.
 *
 * The Rust path is exercised by stubbing `globalThis.fetch` via
 * `vi.stubGlobal` — `api-client/client.ts` wraps openapi-fetch with a
 * late-binding thunk so the stub is picked up per call.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

import {
  materialSuppliers,
  materialTypes,
  rolls,
  suppliers,
} from "@/src/infrastructure/api-client/rf/inventory"

type FetchMock = Mock<(input: string, init?: RequestInit) => Promise<Response>>

function stubFetch(impl: (input: string, init?: RequestInit) => Promise<Response>): FetchMock {
  const spy: FetchMock = vi.fn(impl)
  vi.stubGlobal("fetch", spy)
  return spy
}

function stubJsonOnce(body: unknown, status = 200): FetchMock {
  return stubFetch(async () => new Response(JSON.stringify(body), { status }))
}

describe("inventory SDK", () => {
  const originalFlag = process.env.NEXT_PUBLIC_USE_RUST_INVENTORY

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_USE_RUST_INVENTORY
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (originalFlag === undefined) {
      delete process.env.NEXT_PUBLIC_USE_RUST_INVENTORY
    } else {
      process.env.NEXT_PUBLIC_USE_RUST_INVENTORY = originalFlag
    }
  })

  describe("flag-OFF burial", () => {
    it("every aggregate's list() throws the inventory burial error", async () => {
      await expect(materialTypes.list()).rejects.toThrow(/inventory materialTypes\.list flag-OFF/)
      await expect(suppliers.list()).rejects.toThrow(/inventory suppliers\.list flag-OFF/)
      await expect(materialSuppliers.list({ material_type_id: "mt-1" })).rejects.toThrow(
        /inventory materialSuppliers\.list flag-OFF/
      )
      await expect(rolls.list()).rejects.toThrow(/inventory rolls\.list flag-OFF/)
    })

    it("error message directs operators to flip the flag", async () => {
      await expect(rolls.inventoryValue()).rejects.toThrow(
        /flip NEXT_PUBLIC_USE_RUST_INVENTORY=true/
      )
    })
  })

  describe("materialTypes (flag ON)", () => {
    it("list() hits /api/v2/inventory/material-types", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_INVENTORY = "true"
      const fetchSpy = stubJsonOnce([{ id: "mt-1", name: "Neoprene", default_cost: 4.5 }])
      const rows = await materialTypes.list()
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const arg = fetchSpy.mock.calls[0][0] as unknown
      const url = arg instanceof Request ? arg.url : (arg as string)
      expect(url).toContain("/api/v2/inventory/material-types")
      expect(rows[0].name).toBe("Neoprene")
      expect(rows[0].default_cost).toBe(4.5)
    })

    it("normalizes DTO null → TS undefined", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_INVENTORY = "true"
      stubJsonOnce([{ id: "mt-1", name: "Neoprene", description: null, default_cost: null }])
      const rows = await materialTypes.list()
      expect(rows[0].description).toBeUndefined()
      expect(rows[0].default_cost).toBeUndefined()
    })

    it("create() 409 surfaces stable machine code in err.code", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_INVENTORY = "true"
      stubFetch(
        async () =>
          new Response(JSON.stringify({ code: "DUPLICATE_NAME" }), {
            status: 409,
            headers: { "content-type": "application/json" },
          })
      )
      try {
        await materialTypes.create({ name: "Neoprene" })
        expect.unreachable("should have thrown")
      } catch (err) {
        const e = err as Error & { code?: string; status?: number }
        expect(e.code).toBe("DUPLICATE_NAME")
        expect(e.status).toBe(409)
      }
    })

    it("get() returns null on 404", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_INVENTORY = "true"
      stubFetch(async () => new Response("not found", { status: 404 }))
      const result = await materialTypes.get("nope")
      expect(result).toBeNull()
    })

    it("delete() 204 resolves quietly", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_INVENTORY = "true"
      stubFetch(async () => new Response(null, { status: 204 }))
      await expect(materialTypes.delete("mt-1")).resolves.toBeUndefined()
    })
  })

  describe("suppliers (flag ON)", () => {
    it("list() forwards active/preferred/q query params", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_INVENTORY = "true"
      const fetchSpy = stubJsonOnce([])
      await suppliers.list({ active: true, preferred: true, q: "acme" })
      const arg = fetchSpy.mock.calls[0][0] as unknown
      const url = arg instanceof Request ? arg.url : (arg as string)
      expect(url).toContain("active=true")
      expect(url).toContain("preferred=true")
      expect(url).toContain("q=acme")
    })
  })

  describe("materialSuppliers (flag ON)", () => {
    it("list() with material_type_id forwards to v2", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_INVENTORY = "true"
      const fetchSpy = stubJsonOnce([])
      await materialSuppliers.list({ material_type_id: "mt-1" })
      const arg = fetchSpy.mock.calls[0][0] as unknown
      const url = arg instanceof Request ? arg.url : (arg as string)
      expect(url).toContain("/api/v2/inventory/material-suppliers")
      expect(url).toContain("material_type_id=mt-1")
    })
  })

  describe("rolls (flag ON)", () => {
    it("inventoryValue() unwraps {value}", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_INVENTORY = "true"
      stubJsonOnce({ value: 12345.67 })
      const v = await rolls.inventoryValue()
      expect(v).toBe(12345.67)
    })

    it("lowStockCount() unwraps {count}", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_INVENTORY = "true"
      stubJsonOnce({ count: 3 })
      expect(await rolls.lowStockCount()).toBe(3)
    })

    it("growthPercentage() unwraps {percentage}", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_INVENTORY = "true"
      stubJsonOnce({ percentage: -12.5 })
      expect(await rolls.growthPercentage()).toBe(-12.5)
    })

    it("recent(limit) forwards limit query param", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_INVENTORY = "true"
      const fetchSpy = stubJsonOnce([])
      await rolls.recent(25)
      const arg = fetchSpy.mock.calls[0][0] as unknown
      const url = arg instanceof Request ? arg.url : (arg as string)
      expect(url).toContain("/api/v2/inventory/rolls/recent")
      expect(url).toContain("limit=25")
    })
  })
})
