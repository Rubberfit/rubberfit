import { describe, expect, it } from "vitest"

import { healthCheckService } from "@/src/infrastructure/services/healthCheckService"
import type { CheckResult } from "@/src/application/services/health-check.service.interface"
import { makeFakeClient } from "@/tests/helpers/fake-supabase-client"

describe("healthCheckService.persistCheckResults", () => {
  it("returns ok with no work when results array is empty", async () => {
    const client = makeFakeClient()
    const result = await healthCheckService.persistCheckResults(client, [])
    expect(result).toEqual({ ok: true })
  })

  it("derives is_transition from the prior endpoint status", async () => {
    const client = makeFakeClient({
      rpcs: {
        get_health_endpoint_ids: {
          data: [
            { id: "ep-1", service_name: "API Gateway", current_status: "operational" },
            { id: "ep-2", service_name: "Database Primary", current_status: null },
          ],
          error: null,
        },
        record_health_checks: { data: null, error: null },
      },
    })
    const results: CheckResult[] = [
      { serviceName: "API Gateway", status: "down", responseMs: 100, detail: "boom" },
      { serviceName: "Database Primary", status: "operational", responseMs: 50, detail: "OK" },
    ]
    const out = await healthCheckService.persistCheckResults(client, results)
    expect(out).toEqual({ ok: true })
  })

  it("skips results whose endpoint isn't seeded (no row in get_health_endpoint_ids)", async () => {
    const client = makeFakeClient({
      rpcs: {
        get_health_endpoint_ids: { data: [], error: null },
        record_health_checks: { data: null, error: null },
      },
    })
    const out = await healthCheckService.persistCheckResults(client, [
      { serviceName: "Unknown", status: "operational", responseMs: 1, detail: "" },
    ])
    expect(out).toEqual({ ok: true })
  })

  it("returns failure when the endpoint-id lookup RPC errors", async () => {
    const client = makeFakeClient({
      rpcs: {
        get_health_endpoint_ids: { data: null, error: { message: "rpc down" } },
      },
    })
    const out = await healthCheckService.persistCheckResults(client, [
      { serviceName: "API Gateway", status: "down", responseMs: 1, detail: "" },
    ])
    expect(out).toEqual({ ok: false, error: "rpc down" })
  })
})

describe("healthCheckService thin RPC wrappers", () => {
  it("listEndpointsWithStatus forwards the RPC payload", async () => {
    const client = makeFakeClient({
      rpcs: {
        get_health_endpoints_with_status: {
          data: [{ id: "e1", service_name: "API Gateway" }],
          error: null,
        },
      },
    })
    const rows = await healthCheckService.listEndpointsWithStatus(client)
    expect(rows).toHaveLength(1)
  })

  it("getServiceTimeseries returns the rows for a single service", async () => {
    const client = makeFakeClient({
      rpcs: {
        get_health_timeseries: {
          data: [{ response_ms: 100 }, { response_ms: 200 }],
          error: null,
        },
      },
    })
    const rows = await healthCheckService.getServiceTimeseries(client, "API Gateway", 24)
    expect(rows.map((r) => r.response_ms)).toEqual([100, 200])
  })
})
