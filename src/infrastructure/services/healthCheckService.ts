import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  ActiveEndpointRow,
  CheckResult,
  CheckRow,
  EndpointIdRow,
  EndpointStatusRow,
  HealthCheckInsert,
  HealthStatusRow,
  IHealthCheckService,
  IncidentRow,
  TimeseriesRow,
  UptimeRow,
} from "@/src/application/services/health-check.service.interface"

type ProbeOpts = {
  url: string
  headers: Record<string, string>
  method?: "GET" | "HEAD"
  timeoutMs: number
  degradedAboveMs?: number
  failedDetail?: string
}

// Wraps a single fetch-based probe with consistent timing,
// timeout, and degraded/down classification. Centralizes the
// pattern that every probe in `app/api/admin/health/run/route.ts`
// repeated by hand.
async function fetchProbe(serviceName: string, opts: ProbeOpts): Promise<CheckResult> {
  const start = Date.now()
  try {
    const res = await fetch(opts.url, {
      method: opts.method ?? "GET",
      headers: opts.headers,
      signal: AbortSignal.timeout(opts.timeoutMs),
    })
    const responseMs = Date.now() - start
    if (!res.ok) {
      return {
        serviceName,
        status: "down",
        responseMs,
        detail: `HTTP ${res.status}`,
        httpStatus: res.status,
      }
    }
    if (opts.degradedAboveMs !== undefined && responseMs > opts.degradedAboveMs) {
      return {
        serviceName,
        status: "degraded",
        responseMs,
        detail: `High latency (${responseMs}ms)`,
      }
    }
    return { serviceName, status: "operational", responseMs, detail: "OK" }
  } catch (err) {
    return {
      serviceName,
      status: "down",
      responseMs: Date.now() - start,
      detail: err instanceof Error ? err.message : (opts.failedDetail ?? "Probe failed"),
    }
  }
}

function unconfigured(serviceName: string, missing: string): CheckResult {
  return { serviceName, status: "unknown", responseMs: null, detail: `${missing} not configured` }
}

export class HealthCheckService implements IHealthCheckService {
  async listEndpointsWithStatus(client: SupabaseClient): Promise<EndpointStatusRow[]> {
    const { data, error } = await client.rpc("get_health_endpoints_with_status")
    if (error) throw error
    return (data ?? []) as EndpointStatusRow[]
  }

  async listActiveEndpoints(client: SupabaseClient): Promise<ActiveEndpointRow[]> {
    const { data, error } = await client.rpc("get_active_health_endpoints")
    if (error) throw error
    return (data ?? []) as ActiveEndpointRow[]
  }

  async getAllEndpointUptime(client: SupabaseClient): Promise<UptimeRow[]> {
    const { data, error } = await client.rpc("get_all_endpoint_uptime")
    if (error) throw error
    return (data ?? []) as UptimeRow[]
  }

  async getRecentChecks(client: SupabaseClient, limit: number): Promise<CheckRow[]> {
    const { data, error } = await client.rpc("get_recent_health_checks", { p_limit: limit })
    if (error) throw error
    return (data ?? []) as CheckRow[]
  }

  async getAllTimeseries(client: SupabaseClient, points: number): Promise<TimeseriesRow[]> {
    const { data, error } = await client.rpc("get_all_health_timeseries", { p_points: points })
    if (error) throw error
    return (data ?? []) as TimeseriesRow[]
  }

  async getServiceTimeseries(
    client: SupabaseClient,
    serviceName: string,
    points: number
  ): Promise<{ response_ms: number | null }[]> {
    const { data, error } = await client.rpc("get_health_timeseries", {
      p_service_name: serviceName,
      p_points: points,
    })
    if (error) throw error
    return (data ?? []) as { response_ms: number | null }[]
  }

  async getHealthStatus(
    client: SupabaseClient,
    names: readonly string[]
  ): Promise<HealthStatusRow[]> {
    const { data, error } = await client.rpc("get_health_status", { p_names: [...names] })
    if (error) throw error
    return (data ?? []) as HealthStatusRow[]
  }

  async getHealthIncidents(
    client: SupabaseClient,
    names: readonly string[],
    limit: number
  ): Promise<IncidentRow[]> {
    const { data, error } = await client.rpc("get_health_incidents", {
      p_names: [...names],
      p_limit: limit,
    })
    if (error) throw error
    return (data ?? []) as IncidentRow[]
  }

  async getEndpointIds(client: SupabaseClient, names: readonly string[]): Promise<EndpointIdRow[]> {
    const { data, error } = await client.rpc("get_health_endpoint_ids", {
      p_names: [...names],
    })
    if (error) throw error
    return (data ?? []) as EndpointIdRow[]
  }

  async recordChecks(client: SupabaseClient, inserts: HealthCheckInsert[]): Promise<void> {
    if (inserts.length === 0) return
    const { error } = await client.rpc("record_health_checks", { p_checks: inserts })
    if (error) throw error
  }

  async checkApiGateway(): Promise<CheckResult> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const name = "API Gateway"
    if (!url || !key) return unconfigured(name, "SUPABASE_URL")
    return fetchProbe(name, {
      url: `${url}/auth/v1/health`,
      headers: { apikey: key },
      timeoutMs: 8000,
      degradedAboveMs: 2000,
    })
  }

  async checkDatabase(): Promise<CheckResult> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const name = "Database Primary"
    if (!url || !key) return unconfigured(name, "SUPABASE_URL")
    return fetchProbe(name, {
      url: `${url}/rest/v1/profiles?select=id&limit=1`,
      method: "HEAD",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      timeoutMs: 8000,
      degradedAboveMs: 1500,
      failedDetail: "Query failed",
    })
  }

  async checkAuthService(): Promise<CheckResult> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const name = "Auth Service"
    if (!url || !key) return unconfigured(name, "SUPABASE_URL")
    return fetchProbe(name, {
      url: `${url}/auth/v1/health`,
      headers: { apikey: key },
      timeoutMs: 8000,
      degradedAboveMs: 2000,
      failedDetail: "Auth check failed",
    })
  }

  async checkJobQueue(): Promise<CheckResult> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const name = "Job Queue"
    if (!url || !key) return unconfigured(name, "SUPABASE_URL")
    return fetchProbe(name, {
      url: `${url}/rest/v1/notification_queue?select=id&limit=1`,
      method: "HEAD",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      timeoutMs: 8000,
      degradedAboveMs: 2000,
      failedDetail: "Queue check failed",
    })
  }

  async checkFileStorage(): Promise<CheckResult> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const name = "File Storage"
    if (!url || !key) return unconfigured(name, "SUPABASE_URL")
    return fetchProbe(name, {
      url: `${url}/storage/v1/bucket`,
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      timeoutMs: 8000,
      degradedAboveMs: 2000,
      failedDetail: "Storage check failed",
    })
  }

  async checkEmailService(): Promise<CheckResult> {
    const name = "Email Service"
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) return unconfigured(name, "RESEND_API_KEY")
    const start = Date.now()
    try {
      const res = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      })
      const responseMs = Date.now() - start
      if (res.status === 401) {
        return {
          serviceName: name,
          status: "down",
          responseMs,
          detail: "Invalid API key",
          httpStatus: 401,
        }
      }
      if (!res.ok) {
        return {
          serviceName: name,
          status: "degraded",
          responseMs,
          detail: `HTTP ${res.status}`,
          httpStatus: res.status,
        }
      }
      return { serviceName: name, status: "operational", responseMs, detail: "API key valid" }
    } catch (err) {
      return {
        serviceName: name,
        status: "down",
        responseMs: Date.now() - start,
        detail: err instanceof Error ? err.message : "Email check failed",
      }
    }
  }

  async persistCheckResults(
    client: SupabaseClient,
    results: readonly CheckResult[]
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (results.length === 0) return { ok: true }

    let endpoints: EndpointIdRow[]
    try {
      endpoints = await this.getEndpointIds(
        client,
        results.map((r) => r.serviceName)
      )
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }

    const endpointMap = new Map(endpoints.map((e) => [e.service_name, e]))
    const inserts: HealthCheckInsert[] = []
    for (const r of results) {
      const ep = endpointMap.get(r.serviceName)
      if (!ep) continue
      inserts.push({
        endpoint_id: ep.id,
        status: r.status,
        response_ms: r.responseMs,
        http_status: r.httpStatus ?? null,
        detail: r.detail,
        is_transition: ep.current_status !== null && ep.current_status !== r.status,
      })
    }

    if (inserts.length === 0) return { ok: true }
    try {
      await this.recordChecks(client, inserts)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }
}

export const healthCheckService = new HealthCheckService()
