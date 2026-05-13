import { describe, expect, it, vi } from "vitest"

import {
  getProfileAccess,
  getSuperAdminFlag,
  upsertProfileFromAuth,
} from "@/src/infrastructure/services/authService"
import { makeFakeClient } from "@/tests/helpers/fake-supabase-client"

describe("getProfileAccess", () => {
  it("unions roles across active memberships and surfaces isSuperAdmin", async () => {
    const client = makeFakeClient({
      tables: {
        profiles: {
          select: {
            data: [{ is_platform_admin: true }],
            error: null,
          },
        },
        memberships: {
          select: {
            data: [{ roles: ["admin", "manager"] }, { roles: ["cutter"] }],
            error: null,
          },
        },
      },
    })
    const access = await getProfileAccess(client, "u1")
    expect(access.isSuperAdmin).toBe(true)
    expect(access.hasProfile).toBe(true)
    expect(access.isInaccessible).toBe(false)
    expect(access.roles.sort()).toEqual(["admin", "cutter", "manager"])
  })

  it("returns isInaccessible=true when the profile has zero active memberships and is not a platform admin", async () => {
    const client = makeFakeClient({
      tables: {
        profiles: { select: { data: [{ is_platform_admin: false }], error: null } },
        memberships: { select: { data: [], error: null } },
      },
    })
    const access = await getProfileAccess(client, "u1")
    expect(access.isInaccessible).toBe(true)
    expect(access.hasProfile).toBe(true)
    expect(access.roles).toEqual([])
  })

  it("keeps platform admins accessible even with no memberships", async () => {
    const client = makeFakeClient({
      tables: {
        profiles: { select: { data: [{ is_platform_admin: true }], error: null } },
        memberships: { select: { data: [], error: null } },
      },
    })
    const access = await getProfileAccess(client, "u1")
    expect(access.isSuperAdmin).toBe(true)
    expect(access.isInaccessible).toBe(false)
  })

  it("treats a missing profile row as inaccessible (fail-closed) with hasProfile=false", async () => {
    const client = makeFakeClient({
      tables: {
        profiles: { select: { data: null, error: null } },
        memberships: { select: { data: [], error: null } },
      },
    })
    expect(await getProfileAccess(client, "u1")).toEqual({
      roles: [],
      isSuperAdmin: false,
      isInaccessible: true,
      hasProfile: false,
    })
  })

  it("propagates profile read errors so the caller can map to 500", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const client = makeFakeClient({
      tables: {
        profiles: { select: { data: null, error: { message: "rls" } } },
        memberships: { select: { data: [], error: null } },
      },
    })
    await expect(getProfileAccess(client, "u1")).rejects.toMatchObject({ message: "rls" })
    consoleSpy.mockRestore()
  })
})

describe("getSuperAdminFlag", () => {
  it("returns true when the row reports is_platform_admin", async () => {
    const client = makeFakeClient({
      tables: { profiles: { select: { data: [{ is_platform_admin: true }], error: null } } },
    })
    expect(await getSuperAdminFlag(client, "u1")).toBe(true)
  })

  it("returns false when the row exists but the flag is null", async () => {
    const client = makeFakeClient({
      tables: { profiles: { select: { data: [{ is_platform_admin: null }], error: null } } },
    })
    expect(await getSuperAdminFlag(client, "u1")).toBe(false)
  })

  it("returns false on error (fail-closed)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const client = makeFakeClient({
      tables: { profiles: { select: { data: null, error: { message: "down" } } } },
    })
    expect(await getSuperAdminFlag(client, "u1")).toBe(false)
    consoleSpy.mockRestore()
  })
})

describe("upsertProfileFromAuth", () => {
  it("succeeds on a clean upsert", async () => {
    const client = makeFakeClient({
      tables: { profiles: { insert: { data: null, error: null } } },
    })
    await expect(
      upsertProfileFromAuth(client, "u1", "u@example.com", "User One")
    ).resolves.toBeUndefined()
  })

  it("propagates failure", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const client = makeFakeClient({
      tables: { profiles: { insert: { data: null, error: { message: "constraint" } } } },
    })
    await expect(
      upsertProfileFromAuth(client, "u1", "u@example.com", "User One")
    ).rejects.toMatchObject({ message: "constraint" })
    consoleSpy.mockRestore()
  })
})
