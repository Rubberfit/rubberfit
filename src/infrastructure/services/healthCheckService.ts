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
