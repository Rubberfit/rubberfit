/**
 * Parity tests for the procurement typed SDK (S3c Task 10).
 *
 * Mirrors the inventory parity suite (S3b) — validates that each
 * SDK method dispatches correctly based on the
 * `NEXT_PUBLIC_USE_RUST_PROCUREMENT` flag and surfaces the right
 * shape + error codes to callers.
 *
 * Coverage:
 *
 * - purchaseOrders: list / get / create / updateStatus / delete
 *   + received-via-dropdown 409 with `allowedTargets` payload
 *   + partial-receipt `{ partial: true }` round-trip
 * - reorderRules: list / suggestions (include_pending) / createPo
 * - importRolls: uploadJson reviewed rows / uploadCsv raw bytes
 * - tax: preview flag-OFF → TS camelCase → DTO snake_case hydration
 *
 * Legacy paths are covered by `vi.hoisted` mocks on the concrete
 * services. Flag-ON paths stub `globalThis.fetch` via
 * `vi.stubGlobal` — openapi-fetch's wrapper in client.ts uses a
 * late-binding fetch thunk so the stub is picked up per call.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

type FetchMock = Mock<(input: string, init?: RequestInit) => Promise<Response>>

const { legacyCsvHandles, legacyTaxHandles } = vi.hoisted(() => ({
  legacyCsvHandles: {
    parseCSV: vi.fn(),
    transformToRolls: vi.fn(),
    uploadRolls: vi.fn(),
  },
  legacyTaxHandles: {
    calculatePurchaseOrderTax: vi.fn(),
  },
}))

vi.mock("@/src/infrastructure/services/csvService", () => ({
  csvService: legacyCsvHandles,
}))
vi.mock("@/src/infrastructure/services/taxService", () => ({
  taxService: legacyTaxHandles,
}))

import {
  importRolls,
  purchaseOrders,
  reorderRules,
  tax,
} from "@/src/infrastructure/api-client/rf/procurement"

function stubFetch(impl: (input: string, init?: RequestInit) => Promise<Response>): FetchMock {
  const spy: FetchMock = vi.fn(impl)
  vi.stubGlobal("fetch", spy)
  return spy
}

function stubJsonOnce(body: unknown, status = 200): FetchMock {
  return stubFetch(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      })
  )
}

describe("procurement SDK — v1/v2 parity", () => {
  const originalFlag = process.env.NEXT_PUBLIC_USE_RUST_PROCUREMENT

  beforeEach(() => {
    Object.values(legacyCsvHandles).forEach((f) => f.mockReset())
    Object.values(legacyTaxHandles).forEach((f) => f.mockReset())
    delete process.env.NEXT_PUBLIC_USE_RUST_PROCUREMENT
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (originalFlag === undefined) {
      delete process.env.NEXT_PUBLIC_USE_RUST_PROCUREMENT
    } else {
      process.env.NEXT_PUBLIC_USE_RUST_PROCUREMENT = originalFlag
    }
  })

  // ---- purchaseOrders -------------------------------------------

  describe("purchaseOrders", () => {
    it("list() throws from flag-OFF fallback (legacyPurchaseOrderService retired)", async () => {
      // Post-DDD migration: every PO SDK method requires
      // NEXT_PUBLIC_USE_RUST_PROCUREMENT=true. The legacy CRUD was
      // already runtime-broken against the post-redesign schema
      // (dropped user_id column), so the flag-OFF path now throws.
      await expect(purchaseOrders.list()).rejects.toThrow(/flag-OFF path not wired/)
    })

    it("list() with status also throws on flag OFF", async () => {
      await expect(purchaseOrders.list({ status: "ordered" })).rejects.toThrow(
        /flag-OFF path not wired/
      )
    })

    it("list() hits /api/v2/po when flag ON", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_PROCUREMENT = "true"
      const fetchSpy = stubJsonOnce([{ id: "po-1", po_number: "PO-26-0001", status: "draft" }])
      const rows = await purchaseOrders.list()
      const arg = fetchSpy.mock.calls[0][0] as unknown
      const url = arg instanceof Request ? arg.url : (arg as string)
      expect(url).toContain("/api/v2/po")
      expect(rows[0].po_number).toBe("PO-26-0001")
    })

    it("get() returns null on 404 (flag ON)", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_PROCUREMENT = "true"
      stubFetch(async () => new Response("not found", { status: 404 }))
      const result = await purchaseOrders.get("missing")
      expect(result).toBeNull()
    })

    it("updateStatus() surfaces RECEIVED_REQUIRES_RECEIVE_FLOW (flag ON)", async () => {
      // Plan §"PO status state machine": the generic status path
      // rejects `received`. Body carries `{ code, details:
      // {allowedTargets: [...]} }` so the UI can render legal next
      // targets after the 409.
      process.env.NEXT_PUBLIC_USE_RUST_PROCUREMENT = "true"
      stubFetch(
        async () =>
          new Response(
            JSON.stringify({
              code: "RECEIVED_REQUIRES_RECEIVE_FLOW",
              details: { allowedTargets: ["cancelled"] },
            }),
            {
              status: 409,
              headers: { "content-type": "application/json" },
            }
          )
      )
      try {
        await purchaseOrders.updateStatus("po-1", { status: "received" })
        expect.unreachable("should have thrown")
      } catch (err) {
        const e = err as Error & { code?: string; status?: number }
        expect(e.code).toBe("RECEIVED_REQUIRES_RECEIVE_FLOW")
        expect(e.status).toBe(409)
      }
    })

    it("updateStatus() surfaces INVALID_STATE_TRANSITION (flag ON)", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_PROCUREMENT = "true"
      stubFetch(
        async () =>
          new Response(
            JSON.stringify({
              code: "INVALID_STATE_TRANSITION",
              details: {
                from: "draft",
                to: "ordered",
                allowedTargets: ["pending", "cancelled"],
              },
            }),
            {
              status: 409,
              headers: { "content-type": "application/json" },
            }
          )
      )
      try {
        await purchaseOrders.updateStatus("po-1", { status: "ordered" })
        expect.unreachable("should have thrown")
      } catch (err) {
        const e = err as Error & { code?: string }
        expect(e.code).toBe("INVALID_STATE_TRANSITION")
      }
    })

    it("receive() throws on flag OFF (legacyPurchaseOrderService retired)", async () => {
      await expect(
        purchaseOrders.receive("po-1", {
          items: [
            {
              item_id: "poi-1",
              quantity_received: 100,
              roll_data: { width: 48, length: 100 },
            },
          ],
        })
      ).rejects.toThrow(/flag-OFF path not wired/)
    })

    it("receive() surfaces partial receipt shape (flag ON)", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_PROCUREMENT = "true"
      stubJsonOnce({
        po_id: "po-1",
        items_received: 1,
        roll_ids: [],
        partial: true,
        completed_at: null,
      })
      const r = await purchaseOrders.receive("po-1", {
        items: [{ item_id: "poi-1", quantity_received: 50 }],
      })
      expect(r.partial).toBe(true)
      expect(r.completed_at).toBeNull()
    })

    it("items.add throws on flag OFF (legacyPurchaseOrderService retired)", async () => {
      await expect(
        purchaseOrders.items.add("po-1", {
          material_type_id: "mt-1",
          description: "test",
          quantity_sqft: 10,
          unit_cost: 1,
        })
      ).rejects.toThrow(/flag-OFF path not wired/)
    })
  })

  // ---- reorderRules + suggestions -------------------------------

  describe("reorderRules", () => {
    it("list() throws from flag-OFF fallback (legacyReorderService retired)", async () => {
      // Post-DDD migration: every reorder-rules SDK method
      // requires NEXT_PUBLIC_USE_RUST_PROCUREMENT=true. The legacy
      // CRUD was already runtime-broken against the post-redesign
      // schema, so the flag-OFF path now throws an explicit error.
      await expect(reorderRules.list()).rejects.toThrow(/flag-OFF path not wired/)
    })

    it("suggestions() passes include_pending through query (flag ON)", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_PROCUREMENT = "true"
      const fetchSpy = stubJsonOnce([])
      await reorderRules.suggestions({ include_pending: true })
      const arg = fetchSpy.mock.calls[0][0] as unknown
      const url = arg instanceof Request ? arg.url : (arg as string)
      expect(url).toContain("include_pending=true")
    })

    it("suggestions() returns the full contract shape (flag ON)", async () => {
      // Plan §"Reorder suggestion contract" — DTO carries stock,
      // threshold, reorder_quantity, urgency, days_until_stockout,
      // estimated_cost, supplier_id/name, pending_quantity_sqft,
      // has_pending_po.
      process.env.NEXT_PUBLIC_USE_RUST_PROCUREMENT = "true"
      stubJsonOnce([
        {
          rule_id: "rr-1",
          material_type_id: "mt-1",
          material_name: "Neoprene",
          current_stock_sqft: 100,
          threshold_sqft: 500,
          reorder_quantity_sqft: 1200,
          urgency: "high",
          days_until_stockout: 5,
          estimated_cost: 6000,
          supplier_id: "sup-1",
          supplier_name: "Acme Rubber",
          pending_quantity_sqft: 0,
          has_pending_po: false,
        },
      ])
      const rows = await reorderRules.suggestions()
      expect(rows[0].urgency).toBe("high")
      expect(rows[0].days_until_stockout).toBe(5)
      expect(rows[0].supplier_name).toBe("Acme Rubber")
      expect(rows[0].has_pending_po).toBe(false)
    })

    it("createPo() throws from flag-OFF fallback (by design)", async () => {
      // The plan scope notes: the three reorder→PO paths
      // deliberately don't shim the flag-OFF path — T11b cuts
      // over by flipping the flag for those surfaces.
      await expect(
        reorderRules.createPo("rr-1", {
          supplier_id: "sup-1",
          quantity_sqft: 100,
          unit_cost: 5,
        })
      ).rejects.toThrow(/flag-OFF path not wired/)
    })

    it("createBulkPo() hits /api/v2/reorder-rules/create-bulk-po (flag ON)", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_PROCUREMENT = "true"
      const fetchSpy = stubJsonOnce({
        po_id: "po-new",
        po_number: "PO-26-0042",
        supplier_id: "sup-1",
        items_count: 2,
        subtotal: 1500,
        rule_ids: ["rr-1", "rr-2"],
        bulk: true,
      })
      const receipt = await reorderRules.createBulkPo({
        supplier_id: "sup-1",
        items: [
          { rule_id: "rr-1", quantity_sqft: 100, unit_cost: 5 },
          { rule_id: "rr-2", quantity_sqft: 200, unit_cost: 5 },
        ],
      })
      const arg = fetchSpy.mock.calls[0][0] as unknown
      const url = arg instanceof Request ? arg.url : (arg as string)
      expect(url).toContain("/api/v2/reorder-rules/create-bulk-po")
      expect(receipt.bulk).toBe(true)
      expect(receipt.items_count).toBe(2)
    })

    it("createBulkPo() surfaces DUPLICATE_RULE_IDS (flag ON)", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_PROCUREMENT = "true"
      stubFetch(
        async () =>
          new Response(JSON.stringify({ code: "DUPLICATE_RULE_IDS (count=1)" }), {
            status: 409,
            headers: { "content-type": "application/json" },
          })
      )
      try {
        await reorderRules.createBulkPo({
          supplier_id: "sup-1",
          items: [
            { rule_id: "rr-1", quantity_sqft: 100, unit_cost: 5 },
            { rule_id: "rr-1", quantity_sqft: 200, unit_cost: 5 },
          ],
        })
        expect.unreachable()
      } catch (err) {
        const e = err as Error & { code?: string }
        expect(e.code).toMatch(/^DUPLICATE_RULE_IDS/)
      }
    })
  })

  // ---- importRolls ----------------------------------------------

  describe("importRolls", () => {
    it("uploadJson reviewed rows hits /api/v2/import/rolls (flag ON)", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_PROCUREMENT = "true"
      const fetchSpy = stubJsonOnce({
        imported: 3,
        skipped: 0,
        errors: [],
      })
      const receipt = await importRolls.uploadJson({
        rows: [
          {
            material_type: "Neoprene",
            width: 48,
            length: 600,
            thickness: 0.25,
          },
        ],
      })
      const arg = fetchSpy.mock.calls[0][0] as unknown
      const url = arg instanceof Request ? arg.url : (arg as string)
      expect(url).toContain("/api/v2/import/rolls")
      expect(receipt.imported).toBe(3)
    })

    it("uploadCsv posts text/csv bytes (flag ON)", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_PROCUREMENT = "true"
      const fetchSpy = stubFetch(
        async () =>
          new Response(JSON.stringify({ imported: 2, skipped: 0, errors: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
      )
      const file = new File(
        ["material_type,width,length,thickness\nNeoprene,48,600,0.25"],
        "in.csv",
        { type: "text/csv" }
      )
      const receipt = await importRolls.uploadCsv(file)
      const arg = fetchSpy.mock.calls[0][0] as unknown
      const url = arg instanceof Request ? arg.url : (arg as string)
      expect(url).toContain("/api/v2/import/rolls/csv")
      const init = fetchSpy.mock.calls[0][1]
      const headers = init?.headers as Record<string, string> | undefined
      expect(headers?.["content-type"]).toBe("text/csv")
      expect(receipt.imported).toBe(2)
    })
  })

  // ---- tax ------------------------------------------------------

  describe("tax", () => {
    it("preview() hits /api/v2/po/tax/preview with query params (flag ON)", async () => {
      process.env.NEXT_PUBLIC_USE_RUST_PROCUREMENT = "true"
      const fetchSpy = stubJsonOnce({
        tax_amount: 8.25,
        tax_rate: 0.0825,
        tax_level: "state",
        tax_name: "Texas State",
      })
      const calc = await tax.preview("sup-1", 100)
      const arg = fetchSpy.mock.calls[0][0] as unknown
      const url = arg instanceof Request ? arg.url : (arg as string)
      expect(url).toContain("/api/v2/po/tax/preview")
      expect(url).toContain("supplier_id=sup-1")
      expect(url).toContain("subtotal=100")
      expect(calc.tax_name).toBe("Texas State")
    })

    it("preview() converts camelCase → snake_case on flag-OFF", async () => {
      // Legacy taxService emits camelCase; SDK flag-OFF
      // hydrates to the DTO shape for caller consistency.
      legacyTaxHandles.calculatePurchaseOrderTax.mockResolvedValue({
        subtotal: 100,
        taxAmount: 8.25,
        taxRate: 0.0825,
        taxName: "Texas State",
        taxLevel: "state",
        total: 108.25,
      })
      const calc = await tax.preview("sup-1", 100)
      expect(calc.tax_amount).toBe(8.25)
      expect(calc.tax_rate).toBe(0.0825)
      expect(calc.tax_level).toBe("state")
      expect(calc.tax_name).toBe("Texas State")
    })
  })
})
