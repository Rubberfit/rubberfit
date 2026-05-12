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

  it("keeps Supabase and subscription gating out of the action boundary", () => {
    const source = readAction()
    expect(source).not.toMatch(/@supabase\/(?:ssr|supabase-js)/)
    expect(source).not.toMatch(/@\/src\/infrastructure\/models\/supabase/)
    expect(source).not.toMatch(/\.from\(\s*["'][a-z_]/)
    expect(source).not.toMatch(/requireActiveSubscription/)
  })
})
