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
  })

  it("treats unrelated paths as non-public", () => {
    expect(isPublicPath("/")).toBe(false)
    expect(isPublicPath("/dashboard")).toBe(false)
    expect(isPublicPath("/dashboard/inventory")).toBe(false)
    expect(isPublicPath("/api/cuts/history")).toBe(false)
    expect(isPublicPath("/admin/users")).toBe(false)
  })

  it("does not allowlist /api/tax-rates (ARC-134 lockdown)", () => {
    // Regression guard: ARC-134 removed `/api/tax-rates` from the
    // public allowlist. The route is now an authenticated proxy to the
    // billed Ziptax API — re-adding the entry would re-open the
    // anonymous-access vector.
    expect(PUBLIC_PATHS).not.toContain("/api/tax-rates")
    expect(isPublicPath("/api/tax-rates")).toBe(false)
  })

  it("allowlists /invite/[token] (PR 6 invitation landing)", () => {
    // The /invite/[token] landing must render for un-authenticated invitees;
    // the route fetches a public preview via a SECURITY DEFINER RPC and the
    // accept action remains gated. Path-prefix-overlap still must not match.
    expect(PUBLIC_PATHS).toContain("/invite")
    expect(isPublicPath("/invite")).toBe(true)
    expect(isPublicPath("/invite/abc123")).toBe(true)
    expect(isPublicPath("/inviteabc")).toBe(false)
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
