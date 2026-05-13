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

import { forwardToRust, __setAccessTokenResolverForTests } from "@/app/api/v2/_lib/bridge"

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

async function forwardWithMethod(
  path: string,
  method: string,
  body?: string,
  url: string = "https://example.com"
): Promise<Response> {
  const init: RequestInit = { method }
  if (body !== undefined) {
    init.body = body
    init.headers = { "content-type": "application/json" }
  }
  const req = makeReq(url, init) as unknown as Parameters<typeof forwardToRust>[0]
  return await forwardToRust(req, { path })
}

type FetchMock = Mock<(input: string, init?: RequestInit) => Promise<Response>>

describe("cookie→bearer bridge", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon"
    process.env.RF_API_URL = "https://rf-api.example.com"
  })

  afterEach(() => {
    global.fetch = originalFetch
    __setAccessTokenResolverForTests(null)
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    delete process.env.RF_API_URL
  })

  it("returns 503 when RF_API_URL is not configured", async () => {
    delete process.env.RF_API_URL

    const response = await forward("/api/v2/cuts/history")
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body).toEqual({
      error: "RF_API_URL is not configured on the server",
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
    __setAccessTokenResolverForTests(async () => ({ token: null, refreshedCookies: [] }))
    const fetchSpy: FetchMock = vi.fn()
    global.fetch = fetchSpy as unknown as typeof fetch

    const response = await forward("/api/v2/cuts/history")

    expect(response.status).toBe(401)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("forwards GET with bearer and query string, streams body back", async () => {
    __setAccessTokenResolverForTests(async () => ({ token: "jwt-xyz", refreshedCookies: [] }))
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
    expect(url).toBe("https://rf-api.example.com/api/v2/cuts/history?limit=5")
    expect(init?.method).toBe("GET")
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer jwt-xyz")

    expect(response.headers.get("x-request-id")).toBe("abc-123")
    expect(response.headers.get("content-encoding")).toBeNull()

    const body = await response.json()
    expect(body).toEqual([{ id: 1 }])
  })

  it("strips trailing slash from RF_API_URL to avoid double slashes", async () => {
    process.env.RF_API_URL = "https://rf-api.example.com/"
    __setAccessTokenResolverForTests(async () => ({ token: "jwt-xyz", refreshedCookies: [] }))
    const fetchSpy: FetchMock = vi.fn(async () => new Response("[]", { status: 200 }))
    global.fetch = fetchSpy as unknown as typeof fetch

    await forward("/api/v2/cuts/history")

    expect(fetchSpy.mock.calls[0][0]).toBe(
      "https://rf-api.example.com/api/v2/cuts/history?limit=10"
    )
  })

  it("returns 502 when upstream fetch throws", async () => {
    __setAccessTokenResolverForTests(async () => ({ token: "jwt-xyz", refreshedCookies: [] }))
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
    __setAccessTokenResolverForTests(async () => ({ token: "jwt-xyz", refreshedCookies: [] }))
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

  // S3b added write-verb shims under /api/v2/inventory/**. The bridge
  // was verb-agnostic from S3a but GET was the only path exercised
  // in tests. These cover POST / PUT / DELETE explicitly so a
  // regression in request.arrayBuffer() / body forwarding would fail
  // here instead of first surfacing as a broken inventory create
  // button in the UI.

  it("forwards POST body + content-type to upstream", async () => {
    __setAccessTokenResolverForTests(async () => ({ token: "jwt-xyz", refreshedCookies: [] }))
    const fetchSpy: FetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "mt-1", name: "Neoprene" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        })
    )
    global.fetch = fetchSpy as unknown as typeof fetch

    const response = await forwardWithMethod(
      "/api/v2/inventory/material-types",
      "POST",
      JSON.stringify({ name: "Neoprene" })
    )

    expect(response.status).toBe(201)
    const [, init] = fetchSpy.mock.calls[0]
    expect(init?.method).toBe("POST")
    // reqwest / fetch rejects the body if it was streamed/consumed
    // before forwarding; an ArrayBuffer roundtrip is the contract.
    expect(init?.body).toBeDefined()
    const bytes = new Uint8Array(init?.body as ArrayBuffer)
    const sent = new TextDecoder().decode(bytes)
    expect(JSON.parse(sent)).toEqual({ name: "Neoprene" })
    expect((init?.headers as Record<string, string>)["content-type"]).toBe("application/json")
  })

  it("forwards PUT body to upstream", async () => {
    __setAccessTokenResolverForTests(async () => ({ token: "jwt-xyz", refreshedCookies: [] }))
    const fetchSpy: FetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "mt-1", name: "EPDM" }), {
          status: 200,
        })
    )
    global.fetch = fetchSpy as unknown as typeof fetch

    const response = await forwardWithMethod(
      "/api/v2/inventory/material-types/mt-1",
      "PUT",
      JSON.stringify({ name: "EPDM" })
    )

    expect(response.status).toBe(200)
    const [, init] = fetchSpy.mock.calls[0]
    expect(init?.method).toBe("PUT")
    const bytes = new Uint8Array(init?.body as ArrayBuffer)
    expect(JSON.parse(new TextDecoder().decode(bytes))).toEqual({ name: "EPDM" })
  })

  it("forwards DELETE without a body", async () => {
    __setAccessTokenResolverForTests(async () => ({ token: "jwt-xyz", refreshedCookies: [] }))
    const fetchSpy: FetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    global.fetch = fetchSpy as unknown as typeof fetch

    const response = await forwardWithMethod("/api/v2/inventory/material-types/mt-1", "DELETE")

    expect(response.status).toBe(204)
    const [, init] = fetchSpy.mock.calls[0]
    expect(init?.method).toBe("DELETE")
    // DELETE has no request body — the bridge should still invoke
    // arrayBuffer() and send an empty ArrayBuffer rather than
    // undefined, but either way it's fine for reqwest. Just check
    // we didn't erroneously send a non-empty body from elsewhere.
    if (init?.body !== undefined) {
      const bytes = new Uint8Array(init.body as ArrayBuffer)
      expect(bytes.length).toBe(0)
    }
  })

  it("forwards refreshed Supabase cookies onto the response (no silent token-refresh drop)", async () => {
    // Regression for the silent-401 bug: if the SSR client minted
    // refreshed access/refresh cookies during `getSession()`, the
    // previous `setAll: () => {}` ate them and the browser kept the
    // stale cookie. The next request would then 401 because the
    // server-side rotated cookie didn't match what the client sent.
    __setAccessTokenResolverForTests(async () => ({
      token: "jwt-xyz",
      refreshedCookies: [
        {
          name: "sb-access-token",
          value: "rotated-access",
          options: { path: "/", httpOnly: true, sameSite: "lax" },
        },
        {
          name: "sb-refresh-token",
          value: "rotated-refresh",
          options: { path: "/", httpOnly: true, sameSite: "lax" },
        },
      ],
    }))
    const fetchSpy: FetchMock = vi.fn(
      async () =>
        new Response("[]", { status: 200, headers: { "content-type": "application/json" } })
    )
    global.fetch = fetchSpy as unknown as typeof fetch

    const response = await forward("/api/v2/cuts/history")

    expect(response.status).toBe(200)
    const setCookieHeaders =
      response.headers.getSetCookie?.() ??
      [response.headers.get("set-cookie") ?? ""].filter(Boolean)
    expect(setCookieHeaders.length).toBe(2)
    expect(setCookieHeaders.some((c) => c.startsWith("sb-access-token=rotated-access"))).toBe(true)
    expect(setCookieHeaders.some((c) => c.startsWith("sb-refresh-token=rotated-refresh"))).toBe(
      true
    )
  })

  it("does NOT leak refreshed cookies on 401 (no token)", async () => {
    // Even if the resolver had cookies in flight (unusual, but
    // possible if Supabase issued partial state mid-refresh and we
    // still ended up with a null session), don't stamp them on a
    // 401 — the user must re-login, and stamping rotated cookies
    // for a session we just rejected would be inconsistent.
    __setAccessTokenResolverForTests(async () => ({
      token: null,
      refreshedCookies: [{ name: "sb-access-token", value: "rotated", options: { path: "/" } }],
    }))
    const fetchSpy: FetchMock = vi.fn()
    global.fetch = fetchSpy as unknown as typeof fetch

    const response = await forward("/api/v2/cuts/history")

    expect(response.status).toBe(401)
    expect(fetchSpy).not.toHaveBeenCalled()
    const setCookieHeaders =
      response.headers.getSetCookie?.() ??
      [response.headers.get("set-cookie") ?? ""].filter(Boolean)
    expect(setCookieHeaders.length).toBe(0)
  })
})
