import { describe, expect, it } from "vitest"

import { ForbiddenError } from "@/app/server/auth/errors"
import { requirePermission } from "@/app/server/auth/require-permission"
import type { ActionActor } from "@/app/server/auth/require-authenticated-user"

function actor(overrides: Partial<ActionActor> = {}): ActionActor {
  return {
    id: "u1",
    email: "a@b.com",
    roles: [],
    isSuperAdmin: false,
    ...overrides,
  }
}

describe("requirePermission", () => {
  it("allows super admins regardless of role list", () => {
    expect(() => requirePermission(actor({ isSuperAdmin: true }), "manageRolls")).not.toThrow()
  })

  it("allows when the actor has a role granting the permission", () => {
    expect(() => requirePermission(actor({ roles: ["manager"] }), "manageRolls")).not.toThrow()
  })

  it("throws ForbiddenError when the actor lacks the permission", () => {
    expect(() => requirePermission(actor({ roles: ["viewer"] }), "manageRolls")).toThrow(
      ForbiddenError
    )
  })

  it("falls back to DEFAULT_ROLES (['member']) when actor.roles is empty", () => {
    // Documents the normalize-on-empty contract: an empty roles array
    // resolves to `["member"]` via `normalizeRoles`, so any permission
    // members hold (e.g., `viewInventory`) still passes. If we ever
    // tighten this to deny-on-empty, flip this to `.toThrow(ForbiddenError)`
    // and update `requireAuthenticatedUser` to reject the same case.
    expect(() => requirePermission(actor({ roles: [] }), "viewInventory")).not.toThrow()
  })
})
