import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"

const REPO_ROOT = path.resolve(__dirname, "../..")
const ACTION_PATH = path.join(REPO_ROOT, "app/actions/billing.ts")

function readAction(): string {
  return fs.readFileSync(ACTION_PATH, "utf8")
}

describe("PR 4 billing server actions", () => {
  it("exists with the server-action directive and public exports", () => {
    expect(fs.existsSync(ACTION_PATH)).toBe(true)
    const source = readAction()
    expect(source.trimStart().startsWith('"use server"')).toBe(true)
    expect(source).toMatch(/export async function createOrganizationFromOnboarding\s*\(/)
    expect(source).toMatch(/export async function createCheckoutSession\s*\(/)
  })

  it("keeps direct Supabase calls out of the action boundary", () => {
    // PR 4 forbade `requireActiveSubscription` from billing.ts because the
    // only actions in this file were recovery-exempt (onboarding +
    // checkout). PR 6 adds `updateSubscriptionSeatCount`, which MUST call
    // the gate. The per-action allowlist in
    // `billing-actions-require-active-subscription.test.ts` enforces the
    // recovery-vs-gated split; this test now only guards against the
    // action file touching Supabase directly.
    const source = readAction()
    expect(source).not.toMatch(/@supabase\/(?:ssr|supabase-js)/)
    expect(source).not.toMatch(/@\/src\/infrastructure\/models\/supabase/)
    expect(source).not.toMatch(/\.from\(\s*["'][a-z_]/)
  })
})
