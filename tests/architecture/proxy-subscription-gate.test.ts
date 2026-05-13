import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"

const REPO_ROOT = path.resolve(__dirname, "../..")
const PROXY_PATH = path.join(REPO_ROOT, "proxy.ts")

function readProxy(): string {
  return fs.readFileSync(PROXY_PATH, "utf8")
}

describe("proxy subscription gate", () => {
  it("imports and calls the organization billing gate with the middleware Supabase client", () => {
    const source = readProxy()

    expect(source).toContain("@/src/infrastructure/services/organizationBillingService")
    expect(source).toContain("getSubscriptionGateForUser")
    expect(source).toMatch(
      /if\s*\(\s*!shouldSkipSubscriptionGate\(pathname\)\s*\)\s*\{[\s\S]*getSubscriptionGateForUser\(supabase,\s*user\.id\)/
    )
  })

  it("runs the subscription gate after auth resolves a user", () => {
    const source = readProxy()
    const getUserIndex = source.indexOf("supabase.auth.getUser()")
    const gateIndex = source.indexOf("getSubscriptionGateForUser(supabase, user.id)")

    expect(getUserIndex).toBeGreaterThan(0)
    expect(gateIndex).toBeGreaterThan(getUserIndex)
  })

  it("returns 402 JSON for blocked API requests", () => {
    const source = readProxy()

    expect(source).toContain("NextResponse.json(subscriptionErrorBody(gate), { status: 402 })")
    expect(source).toContain('"NO_ACTIVE_SUBSCRIPTION"')
  })

  it.each(["/checkout", "/logout", "/api/auth/"])(
    "skips the subscription gate for %s",
    (pathname) => {
      const source = readProxy()

      expect(source).toContain(pathname)
    }
  )

  it("documents that /api/stripe/webhook bypasses the proxy via PUBLIC_PATHS, not the gate skip", () => {
    const source = readProxy()
    expect(source).toMatch(
      /\/api\/stripe\/webhook[\s\S]*allowlisted at the auth layer|allowlisted at the auth layer[\s\S]*\/api\/stripe\/webhook/
    )
  })
})
