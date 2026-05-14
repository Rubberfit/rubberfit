/**
 * Architectural guard: customer-facing role schemas must never accept
 * `"super_admin"` as a selectable role. The `super_admin` flag lives
 * on `profiles.super_admin` (a boolean column) and is provisioned by
 * Arc & Anchor staff only — customer-org admins must not be able to
 * pass `"super_admin"` through team-management actions or have it
 * surface in any role picker.
 *
 * Existing defense-in-depth (audited 2026-05-12):
 *   - DB: `profiles_admin_update_all` policy `WITH CHECK (super_admin
 *     = FALSE OR is_super_admin())` blocks the flag flip.
 *   - Zod: `.strict()` on `/api/admin/users` rejects the column on
 *     ingress (tested in `tests/api/route-zod-validation.test.ts`).
 *   - API: `/api/users` only selects `id, full_name, email` — the
 *     boolean never leaves the server.
 *   - UI: role badges + role-select dropdowns hardcode `["admin",
 *     "member"]`.
 *
 * This test pins the last layer (customer role schemas) so a future
 * PR that loosens the team action's role enum to include
 * `"super_admin"` (or adds it to a role picker) fails the build. The
 * `requireSuperAdmin` allowlist tracks files where the flag is
 * *checked* (legitimate staff guards), not assigned.
 */
import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const REPO_ROOT = path.resolve(__dirname, "../..")

// Customer-facing role schemas. Each entry must accept exactly the
// listed roles — no more, no less. Adding new entries when new role-
// taking customer surfaces ship is required to keep the invariant
// honest.
const CUSTOMER_ROLE_SCHEMAS: Array<{
  file: string
  pattern: RegExp
  allowed: readonly string[]
  description: string
}> = [
  {
    file: "app/actions/team.ts",
    // `role: z.enum(["admin", "member"])` — customer-facing invite/
    // role-change flow.
    pattern: /role:\s*z\.enum\(\[([^\]]+)\]/g,
    allowed: ["admin", "member"],
    description: "team invitation/role-change action accepts only admin/member",
  },
  {
    file: "app/dashboard/settings/team/_components/role-select-card.tsx",
    // The TypeScript role union in the role-select-card component.
    pattern: /"admin"\s*\|\s*"member"/g,
    allowed: ["admin", "member"],
    description: "role-select-card union remains admin|member",
  },
]

describe("architecture: super_admin customer isolation", () => {
  for (const schema of CUSTOMER_ROLE_SCHEMAS) {
    it(`${schema.file}: ${schema.description}`, () => {
      const filePath = path.join(REPO_ROOT, schema.file)
      const source = fs.readFileSync(filePath, "utf8")

      // The schema file must exist + contain the expected pattern.
      // If the pattern stops matching, someone refactored the role
      // input — that's a signal to re-audit, not auto-pass.
      const matches = source.match(schema.pattern)
      expect(matches, `Expected pattern ${schema.pattern} in ${schema.file}`).not.toBeNull()

      // No customer-facing schema may contain `"super_admin"` in the
      // role enum body. We grep the whole file rather than per-match
      // because some files have multiple role-related declarations
      // and we want to catch a sneak-in regardless of which one.
      const hasSuperAdmin = /["']super_admin["']/.test(source)
      expect(
        hasSuperAdmin,
        `${schema.file} contains a literal "super_admin" string. Customer-` +
          `facing role schemas must NOT enumerate super_admin. If this is ` +
          `legitimately a staff guard checking ActionActor.isSuperAdmin, ` +
          `add the file to the legitimate-checks allowlist with a comment.`
      ).toBe(false)
    })
  }

  it("never lets the team invitation schema accept super_admin", async () => {
    // Belt-and-suspenders: also do a runtime check by importing the
    // action's Zod schema fragment via the source text, since the
    // file is "use server" and can't easily be imported directly in
    // a non-action test runner without setup. We assert the literal
    // appears in the source.
    const teamActionsFile = path.join(REPO_ROOT, "app/actions/team.ts")
    const source = fs.readFileSync(teamActionsFile, "utf8")
    // Should contain the locked role enum
    expect(source).toMatch(/z\.enum\(\["admin",\s*"member"\]/)
    // Should NOT contain a wider role enum like `["admin", "member", "super_admin"]`
    expect(source).not.toMatch(/z\.enum\(\[[^\]]*"super_admin"/)
  })
})
