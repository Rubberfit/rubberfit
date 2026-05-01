import { NextResponse } from "next/server"
import { describe, expect, it } from "vitest"

import { applySecurityHeaders, getSecurityHeaderNames } from "@/src/middleware/security-headers"

describe("security-headers: applySecurityHeaders", () => {
  it("sets every documented header", () => {
    const response = applySecurityHeaders(NextResponse.next())

    for (const name of getSecurityHeaderNames()) {
      expect(response.headers.get(name)).not.toBeNull()
    }
  })

  it("ships CSP in report-only mode (Phase B will promote to enforced)", () => {
    const response = applySecurityHeaders(NextResponse.next())

    // Report-only header is present; the enforced header is not. This
    // is the deliberate Phase B starting state.
    expect(response.headers.get("Content-Security-Policy-Report-Only")).not.toBeNull()
    expect(response.headers.get("Content-Security-Policy")).toBeNull()
  })

  it("CSP forbids framing and restricts default-src to self", () => {
    const response = applySecurityHeaders(NextResponse.next())
    const csp = response.headers.get("Content-Security-Policy-Report-Only") ?? ""

    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
  })

  it("HSTS satisfies preload-list requirements", () => {
    const response = applySecurityHeaders(NextResponse.next())
    const hsts = response.headers.get("Strict-Transport-Security") ?? ""

    // HSTS preload list rules: max-age >= 31536000, includeSubDomains,
    // preload directive present.
    const maxAgeMatch = hsts.match(/max-age=(\d+)/)
    expect(maxAgeMatch).not.toBeNull()
    expect(Number(maxAgeMatch?.[1] ?? 0)).toBeGreaterThanOrEqual(31_536_000)
    expect(hsts).toContain("includeSubDomains")
    expect(hsts).toContain("preload")
  })

  it("Permissions-Policy disables unused browser features", () => {
    const response = applySecurityHeaders(NextResponse.next())
    const permissions = response.headers.get("Permissions-Policy") ?? ""

    expect(permissions).toContain("camera=()")
    expect(permissions).toContain("microphone=()")
    expect(permissions).toContain("geolocation=()")
  })

  it("returns the same response (mutates, does not clone)", () => {
    const original = NextResponse.next()
    const returned = applySecurityHeaders(original)

    expect(returned).toBe(original)
  })
})
