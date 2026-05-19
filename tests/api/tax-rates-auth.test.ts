import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ARC-134: /api/tax-rates was previously anonymous (allowlisted in
// proxy.ts) and proxied a billed Ziptax API. The fix removes the
// allowlist entry and adds defense-in-depth `requireAuthenticatedUser`
// at the route. This test verifies the in-route gate fails closed
// regardless of allowlist state, so future allowlist drift can't
// silently re-open the abuse vector.

const requireAuthMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-authenticated-user", () => ({
  requireAuthenticatedUser: requireAuthMock,
}))

const fetchMock = vi.hoisted(() => vi.fn())

function makeRequest(postalCode: string): NextRequest {
  return new NextRequest(`http://localhost/api/tax-rates?postalCode=${postalCode}`)
}

describe("/api/tax-rates auth gate (ARC-134)", () => {
  const ENV = process.env

  beforeEach(() => {
    vi.resetModules()
    requireAuthMock.mockReset()
    fetchMock.mockReset()
    process.env = { ...ENV, ZIPTAX_API_KEY: "test-key" }
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    process.env = ENV
    vi.unstubAllGlobals()
  })

  it("returns 401 when the caller has no session", async () => {
    const { UnauthorizedError } = await import("@/app/server/auth/errors")
    requireAuthMock.mockRejectedValue(new UnauthorizedError())

    const { GET } = await import("@/app/api/tax-rates/route")
    const res = await GET(makeRequest("10001"))

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("Unauthorized")
  })

  it("returns 401 when the profile is deactivated", async () => {
    const { UnauthorizedError } = await import("@/app/server/auth/errors")
    requireAuthMock.mockRejectedValue(new UnauthorizedError("Account deactivated"))

    const { GET } = await import("@/app/api/tax-rates/route")
    const res = await GET(makeRequest("10001"))

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("returns 503 when auth env is misconfigured", async () => {
    const { AuthConfigError } = await import("@/app/server/auth/errors")
    requireAuthMock.mockRejectedValue(new AuthConfigError())

    const { GET } = await import("@/app/api/tax-rates/route")
    const res = await GET(makeRequest("10001"))

    expect(res.status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("proxies to Ziptax and returns 200 when authenticated", async () => {
    requireAuthMock.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      roles: ["manager"],
      isSuperAdmin: false,
      activeTenantId: null,
    })
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          version: "v40",
          rCode: 100,
          results: [
            {
              geoPostalCode: "10001",
              geoCity: "New York",
              geoCounty: "New York",
              geoState: "NY",
              taxSales: 0.08875,
              taxUse: 0.08875,
              stateSalesTax: 0.04,
              citySalesTax: 0.045,
              countySalesTax: 0,
              distSalesTax: 0.00375,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    )

    const { GET } = await import("@/app/api/tax-rates/route")
    const res = await GET(makeRequest("10001"))

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
    const body = (await res.json()) as { totalRate: number; postalCode: string }
    expect(body.totalRate).toBeCloseTo(0.08875)
    expect(body.postalCode).toBe("10001")
  })

  it("rejects malformed postal codes with 400 even when authenticated", async () => {
    requireAuthMock.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      roles: ["manager"],
      isSuperAdmin: false,
      activeTenantId: null,
    })

    const { GET } = await import("@/app/api/tax-rates/route")
    const res = await GET(makeRequest("not-a-zip"))

    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
