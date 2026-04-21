import type { SupabaseClient } from "@supabase/supabase-js"

export type CheckStatus = "operational" | "degraded" | "down" | "unknown"

export type CheckType = "http" | "db" | "storage" | "auth" | "queue"

export interface AdapterCheckInput {
  id: string
  serviceName: string
  checkType: CheckType
  url: string
  method: string
  expectedStatus: number | null
  secretRef: string | null
  currentStatus: CheckStatus | null
}

export interface CheckResult {
  endpointId: string
  serviceName: string
  status: CheckStatus
  responseMs: number | null
  httpStatus: number | null
  detail: string
  isTransition: boolean
}

export interface IHealthCheckAdapter {
  canHandle(checkType: string): boolean
  run(input: AdapterCheckInput, client: SupabaseClient): Promise<CheckResult>
}
