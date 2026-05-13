import { describe, expect, it, vi } from "vitest"

import {
  listAccessibleTenants,
  persistLastActiveTenant,
  resolveActiveTenantId,
} from "@/src/infrastructure/services/active-tenant.service"
import { makeFakeClient } from "@/tests/helpers/fake-supabase-client"

const TENANT_A = "00000000-0000-0000-0000-000000000aaa"
const TENANT_B = "00000000-0000-0000-0000-000000000bbb"
const TENANT_C = "00000000-0000-0000-0000-000000000ccc"

describe("resolveActiveTenantId", () => {
  it("honors a valid cookie hint", async () => {
    // The fake client returns the configured `select` data for any
    // memberships read. We rely on the resolver short-circuiting on
    // the first match (the hint validation query) so the same
    // tenant id flows back. That's the only memberships query that
    // fires on the hint-hit path.
    const client = makeFakeClient({
      tables: {
        memberships: {
          select: { data: [{ tenant_id: TENANT_A }], error: null },
        },
      },
    })
    const result = await resolveActiveTenantId(client, "u1", TENANT_A)
    expect(result).toBe(TENANT_A)
  })

  it("falls back to profiles.last_active_tenant_id when no hint is given", async () => {
    const client = makeFakeClient({
      tables: {
        profiles: {
          select: { data: [{ last_active_tenant_id: TENANT_B }], error: null },
        },
        memberships: {
          select: { data: [{ tenant_id: TENANT_B }], error: null },
        },
      },
    })
    const result = await resolveActiveTenantId(client, "u1")
    expect(result).toBe(TENANT_B)
  })

  it("falls back to oldest active membership when both hint and last_active are unset", async () => {
    const client = makeFakeClient({
      tables: {
        profiles: {
          select: { data: [{ last_active_tenant_id: null }], error: null },
        },
        memberships: {
          select: { data: [{ tenant_id: TENANT_C }], error: null },
        },
      },
    })
    const result = await resolveActiveTenantId(client, "u1")
    expect(result).toBe(TENANT_C)
  })

  it("returns null when the caller has no active memberships", async () => {
    const client = makeFakeClient({
      tables: {
        profiles: {
          select: { data: [{ last_active_tenant_id: null }], error: null },
        },
        memberships: {
          select: { data: null, error: null },
        },
      },
    })
    const result = await resolveActiveTenantId(client, "u1")
    expect(result).toBeNull()
  })
})

describe("listAccessibleTenants", () => {
  it("flattens the membership + tenant join into AccessibleTenant rows", async () => {
    const client = makeFakeClient({
      tables: {
        memberships: {
          select: {
            data: [
              {
                roles: ["admin", "manager"],
                tenant: { id: TENANT_A, name: "Tenant A", slug: "tenant-a" },
              },
              {
                roles: ["member"],
                tenant: { id: TENANT_B, name: "Tenant B", slug: "tenant-b" },
              },
            ],
            error: null,
          },
        },
      },
    })
    const result = await listAccessibleTenants(client, "u1")
    expect(result).toEqual([
      { tenantId: TENANT_A, name: "Tenant A", slug: "tenant-a", roles: ["admin", "manager"] },
      { tenantId: TENANT_B, name: "Tenant B", slug: "tenant-b", roles: ["member"] },
    ])
  })

  it("returns an empty array when the caller has no active memberships", async () => {
    const client = makeFakeClient({
      tables: {
        memberships: { select: { data: null, error: null } },
      },
    })
    const result = await listAccessibleTenants(client, "u1")
    expect(result).toEqual([])
  })

  it("propagates read errors so the page can render a fail-state", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const client = makeFakeClient({
      tables: { memberships: { select: { data: null, error: { message: "rls" } } } },
    })
    await expect(listAccessibleTenants(client, "u1")).rejects.toMatchObject({ message: "rls" })
    consoleSpy.mockRestore()
  })

  it("handles tenants returned as a single-element array (PostgREST join shape variation)", async () => {
    const client = makeFakeClient({
      tables: {
        memberships: {
          select: {
            data: [
              {
                roles: ["member"],
                tenant: [{ id: TENANT_A, name: "Tenant A", slug: "tenant-a" }],
              },
            ],
            error: null,
          },
        },
      },
    })
    const result = await listAccessibleTenants(client, "u1")
    expect(result).toEqual([
      { tenantId: TENANT_A, name: "Tenant A", slug: "tenant-a", roles: ["member"] },
    ])
  })

  it("filters out rows where the joined tenant came back null", async () => {
    const client = makeFakeClient({
      tables: {
        memberships: {
          select: {
            data: [
              { roles: ["member"], tenant: null },
              {
                roles: ["admin"],
                tenant: { id: TENANT_A, name: "Tenant A", slug: "tenant-a" },
              },
            ],
            error: null,
          },
        },
      },
    })
    const result = await listAccessibleTenants(client, "u1")
    expect(result).toHaveLength(1)
    expect(result[0]!.tenantId).toBe(TENANT_A)
  })
})

describe("persistLastActiveTenant", () => {
  it("succeeds on a clean update", async () => {
    const client = makeFakeClient({
      tables: { profiles: { update: { data: null, error: null } } },
    })
    await expect(persistLastActiveTenant(client, "u1", TENANT_A)).resolves.toBeUndefined()
  })

  it("logs and swallows failure (best-effort)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const client = makeFakeClient({
      tables: { profiles: { update: { data: null, error: { message: "rls" } } } },
    })
    await expect(persistLastActiveTenant(client, "u1", TENANT_A)).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
