import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  AdapterCheckInput,
  CheckResult,
  CheckStatus,
  IHealthCheckAdapter,
} from "@/src/application/services/health-check-adapter.interface"

// ── Helpers ───────────────────────────────────────────────────────────────────

function result(
  input: AdapterCheckInput,
  status: CheckStatus,
  responseMs: number | null,
  detail: string,
  httpStatus: number | null = null
): CheckResult {
  return {
    endpointId: input.id,
    serviceName: input.serviceName,
    status,
    responseMs,
    httpStatus,
    detail,
    isTransition: input.currentStatus !== null && input.currentStatus !== status,
  }
}

// ── HttpAdapter ───────────────────────────────────────────────────────────────
// Handles any endpoint where check_type = 'http'.
// Fires a real HTTP request to endpoint.url using the configured method.
// Optional secretRef is used as a Bearer token when provided.

class HttpAdapter implements IHealthCheckAdapter {
  canHandle(checkType: string): boolean {
    return checkType === "http"
  }

  async run(input: AdapterCheckInput, _client: SupabaseClient): Promise<CheckResult> {
    const { url, method, expectedStatus, secretRef } = input
    const expected = expectedStatus ?? 200
    const headers: Record<string, string> = {}
    if (secretRef) headers["Authorization"] = `Bearer ${secretRef}`

    const start = Date.now()
    try {
      const res = await fetch(url, {
        method: method ?? "GET",
        headers,
        signal: AbortSignal.timeout(8000),
      })
      const responseMs = Date.now() - start

      if (res.status !== expected && !res.ok) {
        return result(input, "down", responseMs, `HTTP ${res.status}`, res.status)
      }
      if (responseMs > 2000) {
        return result(input, "degraded", responseMs, `High latency (${responseMs}ms)`, res.status)
      }
      return result(input, "operational", responseMs, "OK", res.status)
    } catch (err) {
      return result(
        input,
        "down",
        Date.now() - start,
        err instanceof Error ? err.message : "Connection failed"
      )
    }
  }
}

// ── InternalDbAdapter ─────────────────────────────────────────────────────────
// Handles check_type = 'db'. Runs a lightweight query against the profiles table.

class InternalDbAdapter implements IHealthCheckAdapter {
  canHandle(checkType: string): boolean {
    return checkType === "db"
  }

  async run(input: AdapterCheckInput, client: SupabaseClient): Promise<CheckResult> {
    const start = Date.now()
    try {
      const { error } = await client.from("profiles").select("id").limit(1)
      const responseMs = Date.now() - start
      if (error) return result(input, "down", responseMs, error.message)
      if (responseMs > 500) {
        return result(input, "degraded", responseMs, `High latency (${responseMs}ms)`)
      }
      return result(input, "operational", responseMs, "OK")
    } catch (err) {
      return result(
        input,
        "down",
        Date.now() - start,
        err instanceof Error ? err.message : "Query failed"
      )
    }
  }
}

// ── InternalStorageAdapter ────────────────────────────────────────────────────
// Handles check_type = 'storage'. Lists storage buckets to confirm reachability.

class InternalStorageAdapter implements IHealthCheckAdapter {
  canHandle(checkType: string): boolean {
    return checkType === "storage"
  }

  async run(input: AdapterCheckInput, client: SupabaseClient): Promise<CheckResult> {
    const start = Date.now()
    try {
      const { data, error } = await client.storage.listBuckets()
      const responseMs = Date.now() - start
      if (error) return result(input, "down", responseMs, error.message)
      return result(input, "operational", responseMs, `${(data ?? []).length} buckets accessible`)
    } catch (err) {
      return result(
        input,
        "down",
        Date.now() - start,
        err instanceof Error ? err.message : "Storage check failed"
      )
    }
  }
}

// ── InternalAuthAdapter ───────────────────────────────────────────────────────
// Handles check_type = 'auth'. Calls admin.listUsers to confirm the auth service is up.

class InternalAuthAdapter implements IHealthCheckAdapter {
  canHandle(checkType: string): boolean {
    return checkType === "auth"
  }

  async run(input: AdapterCheckInput, client: SupabaseClient): Promise<CheckResult> {
    const start = Date.now()
    try {
      const { error } = await client.auth.admin.listUsers({ perPage: 1 })
      const responseMs = Date.now() - start
      if (error) return result(input, "down", responseMs, error.message)
      if (responseMs > 1000) {
        return result(input, "degraded", responseMs, `High latency (${responseMs}ms)`)
      }
      return result(input, "operational", responseMs, "OK")
    } catch (err) {
      return result(
        input,
        "down",
        Date.now() - start,
        err instanceof Error ? err.message : "Auth check failed"
      )
    }
  }
}

// ── InternalQueueAdapter ──────────────────────────────────────────────────────
// Handles check_type = 'queue'. Inspects notification_queue depth and failed jobs.

class InternalQueueAdapter implements IHealthCheckAdapter {
  canHandle(checkType: string): boolean {
    return checkType === "queue"
  }

  async run(input: AdapterCheckInput, client: SupabaseClient): Promise<CheckResult> {
    const start = Date.now()
    try {
      const { data, error } = await client
        .from("notification_queue")
        .select("status")
        .in("status", ["pending", "failed", "processing"])
      const responseMs = Date.now() - start
      if (error) return result(input, "down", responseMs, error.message)
      const rows = data ?? []
      const failed = rows.filter((r) => r.status === "failed").length
      const pending = rows.filter((r) => r.status === "pending").length
      if (failed > 5) {
        return result(input, "degraded", responseMs, `${failed} failed jobs in queue`)
      }
      if (pending > 100) {
        return result(input, "degraded", responseMs, `High queue depth: ${pending} pending`)
      }
      return result(input, "operational", responseMs, `${pending} pending, ${failed} failed`)
    } catch (err) {
      return result(
        input,
        "down",
        Date.now() - start,
        err instanceof Error ? err.message : "Queue check failed"
      )
    }
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

const ADAPTERS: IHealthCheckAdapter[] = [
  new HttpAdapter(),
  new InternalDbAdapter(),
  new InternalStorageAdapter(),
  new InternalAuthAdapter(),
  new InternalQueueAdapter(),
]

export async function runHealthCheck(
  input: AdapterCheckInput,
  client: SupabaseClient
): Promise<CheckResult> {
  const adapter = ADAPTERS.find((a) => a.canHandle(input.checkType))
  if (!adapter) {
    return {
      endpointId: input.id,
      serviceName: input.serviceName,
      status: "unknown",
      responseMs: null,
      httpStatus: null,
      detail: `No adapter for check_type="${input.checkType}"`,
      isTransition: input.currentStatus !== null && input.currentStatus !== "unknown",
    }
  }
  return adapter.run(input, client)
}
