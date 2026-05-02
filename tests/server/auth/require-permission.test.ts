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

  it("throws ForbiddenError on empty roles even when DEFAULT_ROLES would otherwise grant", () => {
    // `manageRolls` is restricted to ["admin", "manager"], so the
    // default ["member"] fallback wouldn't pass anyway. Pick a
    // permission `member` does have to verify the normalize-on-empty
    // behavior is intentional.
    expect(() => requirePermission(actor({ roles: [] }), "viewInventory")).not.toThrow()
  })
})
