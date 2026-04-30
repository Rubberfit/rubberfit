import type { SupabaseClient } from "@supabase/supabase-js"

export type CheckStatus = "operational" | "degraded" | "down" | "unknown"

export interface CheckResult {
  serviceName: string
  status: CheckStatus
  responseMs: number | null
  detail: string
  httpStatus?: number | null
}

export interface EndpointStatusRow {
  id: string
  service_name: string
  description: string
  method: string
  tier: string
  check_type: string
  is_active: boolean
  current_status: string | null
  last_checked_at: string | null
  avg_response_ms_24h: number | null
}

export interface ActiveEndpointRow {
  id: string
  service_name: string
  check_type: string
  method: string
  url: string
  tier: string
  interval_seconds: number | null
  expected_status: number | null
  secret_ref: string | null
  current_status: string | null
}

export interface UptimeRow {
  service_name: string
  uptime_24h: number | null
  uptime_7d: number | null
  uptime_30d: number | null
  avg_response_ms_24h: number | null
  last_checked_at: string | null
  current_status: string | null
}

export interface CheckRow {
  id: number
  service_name: string
  checked_at: string
  status: string
  response_ms: number | null
  http_status: number | null
  detail: string | null
  is_transition: boolean
}

export interface TimeseriesRow {
  service_name: string
  response_ms: number | null
  checked_at: string
}

export interface HealthStatusRow {
  endpoint_id: string
  service_name: string
  tier: string
  uptime_24h: number | null
  uptime_7d: number | null
  uptime_30d: number | null
  avg_response_ms_24h: number | null
  last_checked_at: string | null
  current_status: string | null
}

export interface IncidentRow {
  checked_at: string
  service_name: string
  status: string
  detail: string | null
}

export interface EndpointIdRow {
  id: string
  service_name: string
  current_status: string | null
}

export interface HealthCheckInsert {
  endpoint_id: string
  status: CheckStatus
  response_ms: number | null
  http_status: number | null
  detail: string
  is_transition: boolean
}

export interface IHealthCheckService {
  // Read paths — thin RPC wrappers used by the dashboard surfaces.
  listEndpointsWithStatus(client: SupabaseClient): Promise<EndpointStatusRow[]>
  listActiveEndpoints(client: SupabaseClient): Promise<ActiveEndpointRow[]>
  getAllEndpointUptime(client: SupabaseClient): Promise<UptimeRow[]>
  getRecentChecks(client: SupabaseClient, limit: number): Promise<CheckRow[]>
  getAllTimeseries(client: SupabaseClient, points: number): Promise<TimeseriesRow[]>
  getServiceTimeseries(
    client: SupabaseClient,
    serviceName: string,
    points: number
  ): Promise<{ response_ms: number | null }[]>
  getHealthStatus(client: SupabaseClient, names: readonly string[]): Promise<HealthStatusRow[]>
  getHealthIncidents(
    client: SupabaseClient,
    names: readonly string[],
    limit: number
  ): Promise<IncidentRow[]>

  // Write path — used by `run`, `run-endpoints`, and `cron`.
  getEndpointIds(client: SupabaseClient, names: readonly string[]): Promise<EndpointIdRow[]>
  recordChecks(client: SupabaseClient, inserts: HealthCheckInsert[]): Promise<void>
  /**
   * Orchestrator: resolves endpoint UUIDs for `results`, builds the
   * insert payload with `is_transition` derived from the prior status,
   * and persists via `record_health_checks`. Returns `null` on RPC
   * error so the route can map to 500.
   */
  persistCheckResults(
    client: SupabaseClient,
    results: readonly CheckResult[]
  ): Promise<{ ok: true } | { ok: false; error: string }>
}
