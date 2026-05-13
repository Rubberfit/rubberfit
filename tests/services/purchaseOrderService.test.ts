/**
 * Tests for `purchaseOrderService.getPurchaseOrdersByStatuses` — the
 * new method added in #155 to support the reorder dashboard's
 * pending-PO calculation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn(),
}))

vi.mock("@/src/infrastructure/models/supabase", () => ({
  supabase: mockSupabase,
}))

interface QueryShape {
  select: ReturnType<typeof vi.fn>
  in: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  data: unknown
  error: unknown
}

function makeQuery(data: unknown, error: unknown = null): QueryShape {
  const query: QueryShape = {
    select: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    data,
    error,
  }
  query.select.mockReturnValue(query)
  query.in.mockReturnValue(query)
  query.order.mockImplementation(() => Promise.resolve({ data: query.data, error: query.error }))
  return query
}

describe("legacyPurchaseOrderService.getPurchaseOrdersByStatuses", () => {
  let purchaseOrderService: typeof import("@/src/infrastructure/services/legacyPurchaseOrderService").legacyPurchaseOrderService

  beforeEach(async () => {
    vi.resetModules()
    mockSupabase.from.mockReset()
    const mod = await import("@/src/infrastructure/services/legacyPurchaseOrderService")
    purchaseOrderService = mod.legacyPurchaseOrderService
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns [] without hitting Supabase when given an empty status list", async () => {
    const result = await purchaseOrderService.getPurchaseOrdersByStatuses([])
    expect(result).toEqual([])
    expect(mockSupabase.from).not.toHaveBeenCalled()
  })

  it("filters by `IN (...)` and returns the rows", async () => {
    const rows = [
      { id: "po1", status: "pending", items: [] },
      { id: "po2", status: "approved", items: [] },
    ]
    const query = makeQuery(rows)
    mockSupabase.from.mockReturnValue(query)

    const result = await purchaseOrderService.getPurchaseOrdersByStatuses(["pending", "approved"])

    expect(mockSupabase.from).toHaveBeenCalledWith("purchase_orders")
    expect(query.in).toHaveBeenCalledWith("status", ["pending", "approved"])
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false })
    expect(result.map((r: { id: string }) => r.id)).toEqual(["po1", "po2"])
  })

  it("propagates Supabase errors", async () => {
    const query = makeQuery(null, { message: "rls denied" })
    mockSupabase.from.mockReturnValue(query)

    await expect(
      purchaseOrderService.getPurchaseOrdersByStatuses(["pending"])
    ).rejects.toMatchObject({ message: "rls denied" })
  })
})
