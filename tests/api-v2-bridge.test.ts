/**
 * Unit tests for the cookie→bearer bridge used by `app/api/v2/**`.
 *
 * The bridge is the trust boundary between Supabase session cookies
 * (what Next.js clients carry) and the Rust backend's JWKS-verified
 * bearer scheme. The behaviours we care about:
 *
 * 1. Misconfigured env fails closed with 503 — never leaks through.
 * 2. No session → 401 without calling the upstream (no data exposure
 *    path, no upstream log spam from unauthed clients).
 * 3. With session → upstream sees `Authorization: Bearer <token>` and
 *    the response body + non-hop-by-hop headers are preserved.
 * 4. Upstream transport error → 502 (so clients can retry without
 *    doubting the bridge's correctness).
 *
 * Tests use the bridge's test-only `__setAccessTokenResolverForTests`
 * injection point instead of mocking `@supabase/ssr`, which vitest
 * can't fully intercept for dynamically-loaded modules in this
 * monorepo's nested-node_modules layout.
 */
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

import {
  forwardToRust,
  __setAccessTokenResolverForTests,
} from "@/app/api/v2/_lib/bridge"

// Next.js 16 has two NextRequest shapes visible to tsc — one from the
// repo root `node_modules/next`, one from `app/node_modules/next` (an
// unavoidable artefact of Next's bundled node_modules hoisting). The
// bridge's argument type resolves to `app/node_modules/next`'s
// version, while the test file's import resolves to root's. They're
// structurally identical at runtime; route every call through
// `forward(...)` so the cast lives in one place.
function makeReq(
  url: string = "https://example.com/api/v2/cuts/history?limit=10",
  init?: RequestInit
): NextRequest {
  return new NextRequest(new Request(url, init))
}

async function forward(
  path: string,
  url: string = "https://example.com/api/v2/cuts/history?limit=10"
): Promise<Response> {
  const req = makeReq(url) as unknown as Parameters<typeof forwardToRust>[0]
  return await forwardToRust(req, { path })
}

type FetchMock = Mock<(input: string, init?: RequestInit) => Promise<Response>>

describe("cookie→bearer bridge", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon"
    process.env.REMA_API_URL = "https://rema-api.example.com"
  })

  afterEach(() => {
    global.fetch = originalFetch
    __setAccessTokenResolverForTests(null)
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    delete process.env.REMA_API_URL
  })

  it("returns 503 when REMA_API_URL is not configured", async () => {
    delete process.env.REMA_API_URL

    const response = await forward("/api/v2/cuts/history")
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body).toEqual({
      error: "REMA_API_URL is not configured on the server",
    })
  })

  it("returns 503 when Supabase env vars are missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL

    const response = await forward("/api/v2/cuts/history")
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body).toEqual({
      error: "Supabase environment variables are missing",
    })
  })

  it("returns 401 when no Supabase session is present", async () => {
    __setAccessTokenResolverForTests(async () => null)
    const fetchSpy: FetchMock = vi.fn()
    global.fetch = fetchSpy as unknown as typeof fetch

    const response = await forward("/api/v2/cuts/history")

    expect(response.status).toBe(401)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("forwards GET with bearer and query string, streams body back", async () => {
    __setAccessTokenResolverForTests(async () => "jwt-xyz")
    const fetchSpy: FetchMock = vi.fn(async () => {
      return new Response(JSON.stringify([{ id: 1 }]), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "abc-123",
          // Stripped hop-by-hop header — must NOT reach the client.
          "content-encoding": "gzip",
        },
      })
    })
    global.fetch = fetchSpy as unknown as typeof fetch

    const response = await forward(
      "/api/v2/cuts/history",
      "https://example.com/api/v2/cuts/history?limit=5"
    )

    expect(response.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe(
      "https://rema-api.example.com/api/v2/cuts/history?limit=5"
    )
    expect(init?.method).toBe("GET")
    expect((init?.headers as Record<string, string>).authorization).toBe(
      "Bearer jwt-xyz"
    )

    expect(response.headers.get("x-request-id")).toBe("abc-123")
    expect(response.headers.get("content-encoding")).toBeNull()

    const body = await response.json()
    expect(body).toEqual([{ id: 1 }])
  })

  it("strips trailing slash from REMA_API_URL to avoid double slashes", async () => {
    process.env.REMA_API_URL = "https://rema-api.example.com/"
    __setAccessTokenResolverForTests(async () => "jwt-xyz")
    const fetchSpy: FetchMock = vi.fn(async () => new Response("[]", { status: 200 }))
    global.fetch = fetchSpy as unknown as typeof fetch

    await forward("/api/v2/cuts/history")

    expect(fetchSpy.mock.calls[0][0]).toBe(
      "https://rema-api.example.com/api/v2/cuts/history?limit=10"
    )
  })

  it("returns 502 when upstream fetch throws", async () => {
    __setAccessTokenResolverForTests(async () => "jwt-xyz")
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const fetchSpy: FetchMock = vi.fn(async () => {
      throw new Error("ECONNREFUSED")
    })
    global.fetch = fetchSpy as unknown as typeof fetch

    const response = await forward("/api/v2/cuts/history")

    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body).toEqual({ error: "upstream service unavailable" })
    errorSpy.mockRestore()
  })

  it("passes upstream 4xx status + body through verbatim", async () => {
    __setAccessTokenResolverForTests(async () => "jwt-xyz")
    const fetchSpy: FetchMock = vi.fn(async () => {
      return new Response("not found", {
        status: 404,
        headers: { "content-type": "text/plain" },
      })
    })
    global.fetch = fetchSpy as unknown as typeof fetch

    const response = await forward("/api/v2/cuts/history/9999")

    expect(response.status).toBe(404)
    expect(await response.text()).toBe("not found")
  })
})
