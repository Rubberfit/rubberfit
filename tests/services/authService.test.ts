import { describe, expect, it, vi } from "vitest"

import {
  getProfileAccess,
  getSuperAdminFlag,
  upsertProfileFromAuth,
} from "@/src/infrastructure/services/authService"
import { makeFakeClient } from "@/tests/helpers/fake-supabase-client"

describe("getProfileAccess", () => {
  it("returns roles + isSuperAdmin from the profiles row", async () => {
    const client = makeFakeClient({
      tables: {
        profiles: {
          select: {
            data: [{ roles: ["admin", "manager"], super_admin: true }],
            error: null,
          },
        },
      },
    })
    expect(await getProfileAccess(client, "u1")).toEqual({
      roles: ["admin", "manager"],
      isSuperAdmin: true,
    })
  })

  it("treats a missing row as empty roles + non-super-admin", async () => {
    const client = makeFakeClient({
      tables: { profiles: { select: { data: null, error: null } } },
    })
    expect(await getProfileAccess(client, "u1")).toEqual({
      roles: [],
      isSuperAdmin: false,
    })
  })

  it("propagates errors so the caller can map to 500", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const client = makeFakeClient({
      tables: { profiles: { select: { data: null, error: { message: "rls" } } } },
    })
    await expect(getProfileAccess(client, "u1")).rejects.toMatchObject({ message: "rls" })
    consoleSpy.mockRestore()
  })
})

describe("getSuperAdminFlag", () => {
  it("returns true when the row reports super_admin", async () => {
    const client = makeFakeClient({
      tables: { profiles: { select: { data: [{ super_admin: true }], error: null } } },
    })
    expect(await getSuperAdminFlag(client, "u1")).toBe(true)
  })

  it("returns false when the row exists but flag is null", async () => {
    const client = makeFakeClient({
      tables: { profiles: { select: { data: [{ super_admin: null }], error: null } } },
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
