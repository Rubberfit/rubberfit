import { describe, expect, it } from "vitest"

import { alertManagementService } from "@/src/infrastructure/services/alertManagementService"
import { makeFakeClient } from "@/tests/helpers/fake-supabase-client"

describe("alertManagementService.listOpenAlerts", () => {
  it("returns active and investigating alerts", async () => {
    const client = makeFakeClient({
      schemas: {
        admin: {
          alerts: {
            select: {
              data: [
                { id: "a1", title: "Down", status: "active", severity: "high" },
                { id: "a2", title: "Slow", status: "investigating", severity: "medium" },
              ],
              error: null,
            },
          },
        },
      },
    })
    const alerts = await alertManagementService.listOpenAlerts(client)
    expect(alerts).toHaveLength(2)
  })

  it("returns [] on RPC error", async () => {
    const client = makeFakeClient({
      schemas: {
        admin: { alerts: { select: { data: null, error: { message: "down" } } } },
      },
    })
    expect(await alertManagementService.listOpenAlerts(client)).toEqual([])
  })
})

describe("alertManagementService.applyAlertAction", () => {
  it("acknowledge: returns ok and writes activity log", async () => {
    const client = makeFakeClient({
      schemas: {
        admin: {
          alerts: {
            update: {
              data: [{ id: "a1", status: "investigating" }],
              error: null,
            },
          },
          admin_activity_log: { insert: { data: null, error: null } },
        },
      },
    })
    const result = await alertManagementService.applyAlertAction(client, {
      alertId: "a1",
      action: "acknowledge",
      actorUserId: "u1",
      actorEmail: "u@example.com",
    })
    expect(result.ok).toBe(true)
  })

  it("returns failure when the update fails", async () => {
    const client = makeFakeClient({
      schemas: {
        admin: {
          alerts: { update: { data: null, error: { message: "rls denied" } } },
        },
      },
    })
    const result = await alertManagementService.applyAlertAction(client, {
      alertId: "a1",
      action: "resolve",
      actorUserId: "u1",
      actorEmail: null,
    })
    expect(result).toEqual({ ok: false, error: "rls denied" })
  })
})
