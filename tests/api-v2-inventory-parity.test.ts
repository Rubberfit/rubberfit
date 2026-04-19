/**
 * Parity tests for the inventory typed SDK.
 *
 * Confirms that the SDK — flag-gated between legacy Supabase and
 * the new Rust-routed path — surfaces the same shape to callers
 * regardless of which backend served the request. Same pattern as
 * tests/cut-history-client-parity.test.ts (S3a).
 *
 * Vitest can't cleanly intercept @supabase/ssr imports in this
 * monorepo's layout, so the legacy path is covered by mocking the
 * concrete repositories/services modules. The Rust path is covered
 * by stubbing `globalThis.fetch` via `vi.stubGlobal` — the
 * api-client's client.ts wraps openapi-fetch with a late-binding
 * thunk so the stub is picked up per call.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

type FetchMock = Mock<(input: string, init?: RequestInit) => Promise<Response>>

const { legacyMaterialTypesHandles, legacySuppliersHandles, legacyRollsHandles } =
  vi.hoisted(() => ({
    legacyMaterialTypesHandles: {
      getAll: vi.fn(),
      getByIds: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    legacySuppliersHandles: {
      getSuppliers: vi.fn(),
      getSupplierById: vi.fn(),
      createSupplier: vi.fn(),
      updateSupplier: vi.fn(),
      deleteSupplier: vi.fn(),
      getSuppliersByMaterialType: vi.fn(),
      getMaterialsBySupplier: vi.fn(),
      linkMaterialToSupplier: vi.fn(),
      updateMaterialSupplier: vi.fn(),
      unlinkMaterialFromSupplier: vi.fn(),
    },
    legacyRollsHandles: {
      getActiveRolls: vi.fn(),
      getAllRolls: vi.fn(),
      getRollById: vi.fn(),
      addRoll: vi.fn(),
      updateRoll: vi.fn(),
      deleteRoll: vi.fn(),
      getInventoryValue: vi.fn(),
      getLowStockCount: vi.fn(),
      getInventoryGrowthPercentage: vi.fn(),
      getRecentRolls: vi.fn(),
    },
  }))

vi.mock("@/src/infrastructure/repositories/material-types.repository", () => ({
  materialTypeRepository: legacyMaterialTypesHandles,
}))
vi.mock("@/src/infrastructure/services/supplierService", () => ({
  supplierService: legacySuppliersHandles,
}))
vi.mock("@/src/infrastructure/repositories/rolls.repository", () => ({
  rollsRepository: legacyRollsHandles,
}))

import {
  materialSuppliers,
  materialTypes,
  rolls,
  suppliers,
} from "@/src/infrastructure/api-client/rf/inventory"

function stubFetch(impl: (input: string, init?: RequestInit) => Promise<Response>): FetchMock {
  const spy: FetchMock = vi.fn(impl)
  vi.stubGlobal("fetch", spy)
  return spy
}

function stubJsonOnce(body: unknown, status = 200): FetchMock {
  return stubFetch(
    async () => new Response(JSON.stringify(body), { status })
  )
}

describe("inventory SDK — v1/v2 parity", () => {
  const originalFlag = process.env.NEXT_PUBLIC_USE_RUST_INVENTORY

  beforeEach(() => {
    Object.values(legacyMaterialTypesHandles).forEach((f) => f.mockReset())
    Object.values(legacySuppliersHandles).forEach((f) => f.mockReset())
    Object.values(legacyRollsHandles).forEach((f) => f.mockReset())
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

  describe("materialTypes", () => {
    it("list() hits legacy repo when flag OFF", async () => {
      legacyMaterialTypesHandles.getAll.mockResolvedValue([
        { id: "mt-1", name: "Neoprene" },
      ])
      const rows = await materialTypes.list()
      expect(legacyMaterialTypesHandles.getAll).toHaveBeenCalled()
      expect(rows[0].name).toBe("Neoprene")
    })

    it("list() hits /api/v2 when flag ON", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_INVENTORY = "true"
      const fetchSpy = stubJsonOnce([
        { id: "mt-1", name: "Neoprene", default_cost: 4.5 },
      ])
      const rows = await materialTypes.list()
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const arg = fetchSpy.mock.calls[0][0] as unknown
      const url = arg instanceof Request ? arg.url : (arg as string)
      expect(url).toContain("/api/v2/inventory/material-types")
      expect(rows[0].name).toBe("Neoprene")
      expect(rows[0].default_cost).toBe(4.5)
    })

    it("normalizes DTO null → TS undefined on v2 path", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_INVENTORY = "true"
      stubJsonOnce([
        { id: "mt-1", name: "Neoprene", description: null, default_cost: null },
      ])
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

    it("get() returns null on 404 (v2)", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_INVENTORY = "true"
      stubFetch(async () => new Response("not found", { status: 404 }))
      const result = await materialTypes.get("nope")
      expect(result).toBeNull()
    })

    it("delete() 204 resolves quietly (v2)", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_INVENTORY = "true"
      stubFetch(async () => new Response(null, { status: 204 }))
      await expect(materialTypes.delete("mt-1")).resolves.toBeUndefined()
    })
  })

  describe("suppliers", () => {
    it("list() forwards active/preferred/q query params (v2)", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_INVENTORY = "true"
      const fetchSpy = stubJsonOnce([])
      await suppliers.list({ active: true, preferred: true, q: "acme" })
      const arg = fetchSpy.mock.calls[0][0] as unknown
      const url = arg instanceof Request ? arg.url : (arg as string)
      expect(url).toContain("active=true")
      expect(url).toContain("preferred=true")
      expect(url).toContain("q=acme")
    })

    it("list() flag OFF maps to legacy getSuppliers", async () => {
      legacySuppliersHandles.getSuppliers.mockResolvedValue([])
      await suppliers.list({ active: true })
      expect(legacySuppliersHandles.getSuppliers).toHaveBeenCalledWith({
        filterActive: true,
        filterPreferred: undefined,
      })
    })
  })

  describe("materialSuppliers", () => {
    it("list() without filters throws clearly when flag OFF", async () => {
      await expect(materialSuppliers.list()).rejects.toThrow(
        /requires material_type_id or supplier_id/
      )
    })

    it("list() with material_type_id maps to legacy (flag OFF)", async () => {
      legacySuppliersHandles.getSuppliersByMaterialType.mockResolvedValue([])
      await materialSuppliers.list({ material_type_id: "mt-1" })
      expect(
        legacySuppliersHandles.getSuppliersByMaterialType
      ).toHaveBeenCalledWith("mt-1")
    })

    it("list() with material_type_id forwards to v2 (flag ON)", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_INVENTORY = "true"
      const fetchSpy = stubJsonOnce([])
      await materialSuppliers.list({ material_type_id: "mt-1" })
      const arg = fetchSpy.mock.calls[0][0] as unknown
      const url = arg instanceof Request ? arg.url : (arg as string)
      expect(url).toContain("/api/v2/inventory/material-suppliers")
      expect(url).toContain("material_type_id=mt-1")
    })
  })

  describe("rolls", () => {
    it("list({status:'active'}) maps to getActiveRolls (flag OFF)", async () => {
      legacyRollsHandles.getActiveRolls.mockResolvedValue([])
      await rolls.list({ status: "active" })
      expect(legacyRollsHandles.getActiveRolls).toHaveBeenCalled()
      expect(legacyRollsHandles.getAllRolls).not.toHaveBeenCalled()
    })

    it("list({status:'depleted'}) maps to getAllRolls (flag OFF)", async () => {
      legacyRollsHandles.getAllRolls.mockResolvedValue([])
      await rolls.list({ status: "depleted" })
      expect(legacyRollsHandles.getAllRolls).toHaveBeenCalled()
    })

    it("inventoryValue() returns a number on v2 path", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_INVENTORY = "true"
      stubJsonOnce({ value: 12345.67 })
      const v = await rolls.inventoryValue()
      expect(v).toBe(12345.67)
    })

    it("inventoryValue() falls back to legacy method on flag OFF", async () => {
      legacyRollsHandles.getInventoryValue.mockResolvedValue(999)
      const v = await rolls.inventoryValue()
      expect(v).toBe(999)
      expect(legacyRollsHandles.getInventoryValue).toHaveBeenCalled()
    })

    it("lowStockCount() unwraps {count} on v2", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_INVENTORY = "true"
      stubJsonOnce({ count: 3 })
      expect(await rolls.lowStockCount()).toBe(3)
    })

    it("growthPercentage() unwraps {percentage} on v2", async () => {
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
