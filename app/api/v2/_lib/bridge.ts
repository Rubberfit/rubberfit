/**
 * Cookie → Bearer bridge for the Rust backend at `RF_API_URL`.
 *
 * Frontend callers talk to Next.js using Supabase session cookies.
 * The Rust backend validates RS256 bearer JWTs. This module handles
 * that hand-off: read the session from cookies, extract the access
 * token, forward the upstream request with `Authorization: Bearer`,
 * stream the response body back.
 *
 * Keeping this in one file means every `/api/v2/**` route handler is
 * a 5-line shim — no config or credential logic duplicated per route.
 */

import { type CookieOptions, createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"

const STREAMED_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

/**
 * Headers we deliberately do NOT forward from the upstream response.
 * Each would break Next's edge/node response plumbing if echoed
 * verbatim. `content-encoding` in particular — fetch auto-decompresses
 * the upstream body, so claiming `gzip` on the passthrough would
 * produce malformed output for the client.
 */
const STRIPPED_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "transfer-encoding",
  "content-length",
  "connection",
])

function apiBaseUrl(): string | null {
  const url = process.env.RF_API_URL?.trim()
  if (!url) return null
  return url.replace(/\/+$/, "")
}

/** Cookie returned by the Supabase SSR client during a token refresh. */
interface PendingCookie {
  name: string
  value: string
  options?: CookieOptions
}

/**
 * Resolver result. The bridge needs both the bearer token AND any
 * cookies the SSR client minted while resolving the session — the
 * previous `() => Promise<string | null>` shape silently dropped
 * refreshed cookies, leaving the browser with stale credentials.
 * `forwardToRust` writes `refreshedCookies` onto the response so
 * the client picks up the rotated access/refresh tokens.
 */
export interface AccessTokenResult {
  token: string | null
  refreshedCookies: PendingCookie[]
}

/**
 * Resolves the bearer JWT the bridge forwards upstream. The default
 * implementation reads it out of the Supabase session cookie; tests
 * swap in a fake via `__setAccessTokenResolverForTests`.
 */
export type AccessTokenResolver = (request: NextRequest) => Promise<AccessTokenResult>

async function defaultAccessTokenResolver(request: NextRequest): Promise<AccessTokenResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return { token: null, refreshedCookies: [] }

  // Capture refreshed cookies via `setAll` so `forwardToRust` can
  // forward them to the client. Without this, an aging access token
  // gets refreshed in-memory by `getSession()`, the new cookies are
  // dropped, and the next request finds the old (now-invalid)
  // cookie in the browser → 401. This was the root cause of the
  // intermittent "saves but won't load cut history" symptom on dev
  // / preview deployments where there's less page-navigation
  // refresh churn than prod.
  const refreshedCookies: PendingCookie[] = []
  const client = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const c of toSet) {
          refreshedCookies.push({ name: c.name, value: c.value, options: c.options })
        }
      },
    },
  })

  const {
    data: { session },
  } = await client.auth.getSession()
  return { token: session?.access_token ?? null, refreshedCookies }
}

// Module-scoped so the defaultAccessTokenResolver is swappable at
// test time without plumbing every call site through an options bag.
// Production code must never touch this — the setter is prefixed
// with `__` and lives only for Vitest integration.
let accessTokenResolver: AccessTokenResolver = defaultAccessTokenResolver

export function __setAccessTokenResolverForTests(resolver: AccessTokenResolver | null): void {
  accessTokenResolver = resolver ?? defaultAccessTokenResolver
}

export interface BridgeOptions {
  /** Upstream path WITHOUT the origin, e.g. `/api/v2/cuts/history`. */
  path: string
  /** When true, append the incoming request's query string. Default true. */
  forwardQuery?: boolean
}

/**
 * Forward the incoming request upstream with the Supabase access
 * token as a bearer credential, then stream the response back.
 *
 * Fails closed:
 * - No `RF_API_URL` → 503 (deployment misconfigured).
 * - No Supabase env → 503 (same bucket).
 * - No session cookie → 401 (client triggers Supabase refresh flow).
 * - Upstream transport error → 502 (Rust unreachable).
 *
 * Never returns the upstream body on auth failure — an unauthed
 * caller should see Next's short error, not a passthrough of
 * Rust's response.
 */
export async function forwardToRust(
  request: NextRequest,
  { path, forwardQuery = true }: BridgeOptions
): Promise<Response> {
  const base = apiBaseUrl()
  if (!base) {
    return NextResponse.json(
      { error: "RF_API_URL is not configured on the server" },
      { status: 503 }
    )
  }

  // Env check runs BEFORE the resolver because misconfigured env is
  // an operator-facing 503, not a caller-facing 401. A test resolver
  // bypasses this check by replacing the resolver entirely.
  if (accessTokenResolver === defaultAccessTokenResolver) {
    const hasSupabaseEnv = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
    if (!hasSupabaseEnv) {
      return NextResponse.json(
        { error: "Supabase environment variables are missing" },
        { status: 503 }
      )
    }
  }

  const { token, refreshedCookies } = await accessTokenResolver(request)
  if (token === null) {
    // Don't leak refreshed cookies on auth failure — the user needs
    // to re-login anyway, and stamping rotated cookies for an
    // authenticated session that we then 401'd would be inconsistent.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const search = forwardQuery ? new URL(request.url).search : ""
  const upstreamUrl = `${base}${path}${search}`

  const method = request.method.toUpperCase()
  const body = STREAMED_METHODS.has(method) ? undefined : await request.arrayBuffer()

  let upstream: Response
  try {
    // Forward the request's content-type verbatim when there IS a
    // body. S3c's CSV import route submits `text/csv`; hardcoding
    // `application/json` would silently mis-label the payload and
    // break any Rust handler that branches on the header. We also
    // forward `accept` so clients can negotiate `text/csv` /
    // `application/json` responses too. For bodies without an
    // incoming content-type, fall back to `application/json` —
    // matches the original S3a default.
    const forwardedHeaders: Record<string, string> = {
      authorization: `Bearer ${token}`,
    }
    if (body !== undefined) {
      const incomingContentType = request.headers.get("content-type")
      forwardedHeaders["content-type"] =
        incomingContentType && incomingContentType.trim() !== ""
          ? incomingContentType
          : "application/json"
    }
    const incomingAccept = request.headers.get("accept")
    if (incomingAccept && incomingAccept.trim() !== "") {
      forwardedHeaders["accept"] = incomingAccept
    }
    upstream = await fetch(upstreamUrl, {
      method,
      headers: forwardedHeaders,
      body,
      // Per-route feature flags + retries belong here later; S3a keeps
      // the wiring minimal so the cutover diff is small.
      redirect: "manual",
      cache: "no-store",
    })
  } catch (error) {
    console.error("rust backend unreachable", { upstreamUrl, error })
    return NextResponse.json({ error: "upstream service unavailable" }, { status: 502 })
  }

  const headers = new Headers()
  upstream.headers.forEach((value, key) => {
    if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value)
    }
  })

  // Stream the body through — preserves SSE / NDJSON if Rust ever
  // returns streamed responses. For normal JSON this is equivalent
  // to `await upstream.text()` but avoids buffering large payloads.
  // `NextResponse` (vs plain `Response`) gives us a `.cookies` API
  // for stamping the refreshed Supabase cookies on the way back.
  const response = new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  })
  for (const { name, value, options } of refreshedCookies) {
    response.cookies.set(name, value, options)
  }
  return response
}
