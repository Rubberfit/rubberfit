import { describe, expect, it } from "vitest"

import { requireActiveTenant } from "@/app/server/auth/require-active-tenant"
import type { ActionActor } from "@/app/server/auth/require-authenticated-user"

function actor(overrides: Partial<ActionActor> = {}): ActionActor {
  return {
    id: "u1",
    email: "a@b.com",
    roles: [],
    isSuperAdmin: false,
    activeTenantId: null,
    ...overrides,
  }
}

describe("requireActiveTenant", () => {
  it("returns silently when an active tenant is set", () => {
    expect(() =>
      requireActiveTenant(actor({ activeTenantId: "00000000-0000-0000-0000-000000000abc" }))
    ).not.toThrow()
  })

  it("throws ForbiddenError when activeTenantId is null", () => {
    expect(() => requireActiveTenant(actor({ activeTenantId: null }))).toThrowError(
      /pick a tenant/i
    )
  })

  it("throws a FORBIDDEN-coded error so action wrappers can discriminate", () => {
    let captured: unknown
    try {
      requireActiveTenant(actor({ activeTenantId: null }))
    } catch (err) {
      captured = err
    }
    expect((captured as { code?: string }).code).toBe("FORBIDDEN")
  })
})
