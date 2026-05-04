import { describe, expect, it } from "vitest"

import { PUBLIC_PATHS, isApiPath, isPublicPath } from "@/src/middleware/auth-allowlist"

describe("auth-allowlist: isPublicPath", () => {
  it.each(PUBLIC_PATHS)("treats exact public path %s as public", (path) => {
    expect(isPublicPath(path)).toBe(true)
  })

  it("treats sub-paths under a public entry as public", () => {
    expect(isPublicPath("/login/sso")).toBe(true)
    expect(isPublicPath("/callback/google")).toBe(true)
  })

  it("does not treat path-prefix-overlap as public", () => {
    // /loginadmin must not match /login (no path-segment boundary).
    expect(isPublicPath("/loginadmin")).toBe(false)
    expect(isPublicPath("/registerme")).toBe(false)
    // /api/tax-rates-internal must not match /api/tax-rates.
    expect(isPublicPath("/api/tax-rates-internal")).toBe(false)
  })

  it("treats unrelated paths as non-public", () => {
    expect(isPublicPath("/")).toBe(false)
    expect(isPublicPath("/dashboard")).toBe(false)
    expect(isPublicPath("/dashboard/inventory")).toBe(false)
    expect(isPublicPath("/api/cuts/history")).toBe(false)
    expect(isPublicPath("/admin/users")).toBe(false)
  })

  it("includes the documented FIXME entry for ARC-134", () => {
    // Guards against accidentally removing the /api/tax-rates allowlist
    // entry before ARC-134 lands the lockdown. When ARC-134 closes, this
    // assertion flips to ensure the entry is gone.
    expect(PUBLIC_PATHS).toContain("/api/tax-rates")
  })
})

describe("auth-allowlist: isApiPath", () => {
  it("returns true for /api/*", () => {
    expect(isApiPath("/api/cuts/history")).toBe(true)
    expect(isApiPath("/api/admin/users")).toBe(true)
    expect(isApiPath("/api/v2/po")).toBe(true)
  })

  it("returns false for non-API paths", () => {
    expect(isApiPath("/")).toBe(false)
    expect(isApiPath("/dashboard")).toBe(false)
    expect(isApiPath("/login")).toBe(false)
    expect(isApiPath("/apidocs")).toBe(false)
  })
})
