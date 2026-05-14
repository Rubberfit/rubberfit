import { describe, expect, it, vi, beforeEach } from "vitest"

import { monitorPendingReceipts } from "@/src/infrastructure/services/pendingReceiptMonitor"

/**
 * Fake Supabase client. The monitor only uses the query-builder chains
 * `from(...).select(...).eq(...).is(...).contains(...).gte(...).limit(...)`
 * and `from(...).insert(...)`. We script per-table responses keyed by the
 * table name passed to `from()`. Each `select` invocation pulls the next
 * response from that table's queue; `insert` records the payload.
 */
type Row = Record<string, unknown>
interface SelectResponse {
  data: Row[] | null
  error: { message: string } | null
}
interface InsertResponse {
  error: { message: string } | null
}

function makeFakeClient(opts: {
  selectByTable: Record<string, SelectResponse[]>
  insertResponseByTable?: Record<string, InsertResponse>
  inserts?: Record<string, Row[]>
}) {
  const inserts = opts.inserts ?? {}
  const selectQueues: Record<string, SelectResponse[]> = {}
  for (const [table, responses] of Object.entries(opts.selectByTable)) {
    selectQueues[table] = [...responses]
  }
  const insertResponses = opts.insertResponseByTable ?? {}

  function makeSelectBuilder(table: string) {
    // The chain returns `this` from each filter method and resolves
    // as a Promise when `await`ed — Supabase's builder is thenable.
    const queue = selectQueues[table] ?? []
    const resolved: SelectResponse = queue.shift() ?? { data: [], error: null }

    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      contains: () => builder,
      gte: () => builder,
      limit: () => builder,
      then: (onFulfilled: (v: SelectResponse) => unknown) => Promise.resolve(onFulfilled(resolved)),
    }
    return builder
  }

  function makeInsertBuilder(table: string, payload: Row) {
    inserts[table] = inserts[table] ?? []
    inserts[table]!.push(payload)
    const resolved: InsertResponse = insertResponses[table] ?? { error: null }
    return {
      then: (onFulfilled: (v: InsertResponse) => unknown) => Promise.resolve(onFulfilled(resolved)),
    }
  }

  return {
    inserts,
    client: {
      from(table: string) {
        const selectBuilder = makeSelectBuilder(table)
        return {
          ...selectBuilder,
          insert: (payload: Row) => makeInsertBuilder(table, payload),
        }
      },
    },
  }
}

const NOW = new Date("2026-05-13T12:00:00.000Z")
const TWO_HOURS_AGO = new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString()
const FIVE_MIN_AGO = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString()

const TENANT_A = "10000000-0000-4000-8000-000000000001"
const ADMIN_A1 = "20000000-0000-4000-8000-000000000010"
const ADMIN_A2 = "20000000-0000-4000-8000-000000000011"
const RECEIPT_OLD = "30000000-0000-4000-8000-000000000100"
const RECEIPT_FRESH = "30000000-0000-4000-8000-000000000101"

describe("monitorPendingReceipts", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("returns zero counts and inserts nothing when both views are empty", async () => {
    const { client, inserts } = makeFakeClient({
      selectByTable: {
        po_receipts_pending_apply: [{ data: [], error: null }],
        po_receipts_pending_roll_creation: [{ data: [], error: null }],
      },
    })

    const result = await monitorPendingReceipts(
      client as unknown as Parameters<typeof monitorPendingReceipts>[0],
      NOW
    )

    expect(result).toEqual({
      pendingApplyCount: 0,
      pendingRollCount: 0,
      notificationsCreated: 0,
      notificationsSkippedDedup: 0,
      tenantsScanned: 0,
    })
    expect(inserts.notifications).toBeUndefined()
    expect(inserts.notification_queue).toBeUndefined()
  })

  it("filters out rows younger than threshold (5 min old <1h)", async () => {
    const { client, inserts } = makeFakeClient({
      selectByTable: {
        po_receipts_pending_apply: [
          {
            data: [
              {
                receipt_id: RECEIPT_FRESH,
                tenant_id: TENANT_A,
                receipt_created_at: FIVE_MIN_AGO,
              },
            ],
            error: null,
          },
        ],
        po_receipts_pending_roll_creation: [{ data: [], error: null }],
      },
    })

    const result = await monitorPendingReceipts(
      client as unknown as Parameters<typeof monitorPendingReceipts>[0],
      NOW
    )

    expect(result.pendingApplyCount).toBe(0)
    expect(result.notificationsCreated).toBe(0)
    expect(inserts.notifications).toBeUndefined()
  })

  it("creates one in-app + one queue row per admin for overdue rows", async () => {
    const { client, inserts } = makeFakeClient({
      selectByTable: {
        po_receipts_pending_apply: [
          {
            data: [
              {
                receipt_id: RECEIPT_OLD,
                tenant_id: TENANT_A,
                receipt_created_at: TWO_HOURS_AGO,
              },
            ],
            error: null,
          },
        ],
        po_receipts_pending_roll_creation: [{ data: [], error: null }],
        memberships: [
          {
            data: [{ profile_id: ADMIN_A1 }, { profile_id: ADMIN_A2 }],
            error: null,
          },
        ],
        // No dedup hits — both admins get fresh alerts.
        notifications: [
          { data: [], error: null },
          { data: [], error: null },
        ],
      },
    })

    const result = await monitorPendingReceipts(
      client as unknown as Parameters<typeof monitorPendingReceipts>[0],
      NOW
    )

    expect(result.pendingApplyCount).toBe(1)
    expect(result.notificationsCreated).toBe(2)
    expect(result.notificationsSkippedDedup).toBe(0)
    expect(result.tenantsScanned).toBe(1)
    expect(inserts.notifications).toHaveLength(2)
    expect(inserts.notification_queue).toHaveLength(2)
    expect(inserts.notifications![0]).toMatchObject({
      tenant_id: TENANT_A,
      type: "system_alert",
      title: "PO receipts pending reconciliation",
    })
    expect(inserts.notification_queue![0]).toMatchObject({
      notification_type: "critical_alert",
      send_email: true,
      priority: "high",
    })
  })

  it("skips admins with an existing alert inside the dedup window", async () => {
    const { client, inserts } = makeFakeClient({
      selectByTable: {
        po_receipts_pending_apply: [
          {
            data: [
              {
                receipt_id: RECEIPT_OLD,
                tenant_id: TENANT_A,
                receipt_created_at: TWO_HOURS_AGO,
              },
            ],
            error: null,
          },
        ],
        po_receipts_pending_roll_creation: [{ data: [], error: null }],
        memberships: [
          {
            data: [{ profile_id: ADMIN_A1 }, { profile_id: ADMIN_A2 }],
            error: null,
          },
        ],
        notifications: [
          // First admin already alerted within window → skip
          { data: [{ id: "existing-1" }], error: null },
          // Second admin has no prior alert → fresh insert
          { data: [], error: null },
        ],
      },
    })

    const result = await monitorPendingReceipts(
      client as unknown as Parameters<typeof monitorPendingReceipts>[0],
      NOW
    )

    expect(result.notificationsCreated).toBe(1)
    expect(result.notificationsSkippedDedup).toBe(1)
    expect(inserts.notifications).toHaveLength(1)
    expect(inserts.notifications![0]).toMatchObject({ user_id: ADMIN_A2 })
  })

  it("propagates view-read errors", async () => {
    const { client } = makeFakeClient({
      selectByTable: {
        po_receipts_pending_apply: [{ data: null, error: { message: "view query failed" } }],
        po_receipts_pending_roll_creation: [{ data: [], error: null }],
      },
    })

    await expect(
      monitorPendingReceipts(client as unknown as Parameters<typeof monitorPendingReceipts>[0], NOW)
    ).rejects.toMatchObject({ message: "view query failed" })
  })
})
