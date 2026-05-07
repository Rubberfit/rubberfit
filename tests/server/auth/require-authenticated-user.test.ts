import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const cookiesMock = vi.hoisted(() => vi.fn())
vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}))

const createServerClientMock = vi.hoisted(() => vi.fn())
vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}))

interface FakeProfile {
  roles: string[] | null
  super_admin: boolean | null
  is_deleted: boolean | null
}

function makeClient(opts: {
  user?: { id: string; email: string } | null
  authError?: { message: string } | null
  profile?: FakeProfile | null
  profileError?: { message: string } | null
}) {
  const profileQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: opts.profile ?? null,
      error: opts.profileError ?? null,
    }),
  }
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: opts.user ?? null },
        error: opts.authError ?? null,
      }),
    },
    from: vi.fn().mockReturnValue(profileQuery),
  }
}

describe("requireAuthenticatedUser", () => {
  const ENV = process.env

  beforeEach(() => {
    vi.resetModules()
    cookiesMock.mockReset()
    createServerClientMock.mockReset()
    cookiesMock.mockResolvedValue({ getAll: () => [] })
    process.env = {
      ...ENV,
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    }
  })

  afterEach(() => {
    process.env = ENV
    vi.restoreAllMocks()
  })

  it("throws AuthConfigError when env is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    const { requireAuthenticatedUser } =
      await import("@/app/server/auth/require-authenticated-user")
    const { AuthConfigError } = await import("@/app/server/auth/errors")
    await expect(requireAuthenticatedUser()).rejects.toBeInstanceOf(AuthConfigError)
  })

  it("throws UnauthorizedError when there is no session", async () => {
    createServerClientMock.mockReturnValue(makeClient({ user: null }))
    const { requireAuthenticatedUser } =
      await import("@/app/server/auth/require-authenticated-user")
    const { UnauthorizedError } = await import("@/app/server/auth/errors")
    await expect(requireAuthenticatedUser()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it("throws UnauthorizedError when getUser returns an error", async () => {
    createServerClientMock.mockReturnValue(
      makeClient({ user: null, authError: { message: "JWT expired" } })
    )
    const { requireAuthenticatedUser } =
      await import("@/app/server/auth/require-authenticated-user")
    const { UnauthorizedError } = await import("@/app/server/auth/errors")
    await expect(requireAuthenticatedUser()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it("throws UnauthorizedError when the profile row is missing (fail-closed)", async () => {
    createServerClientMock.mockReturnValue(
      makeClient({ user: { id: "u1", email: "a@b.com" }, profile: null })
    )
    const { requireAuthenticatedUser } =
      await import("@/app/server/auth/require-authenticated-user")
    const { UnauthorizedError } = await import("@/app/server/auth/errors")
    await expect(requireAuthenticatedUser()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Profile not found",
    })
    void UnauthorizedError
  })

  it("throws UnauthorizedError when the profile is soft-deleted", async () => {
    createServerClientMock.mockReturnValue(
      makeClient({
        user: { id: "u1", email: "a@b.com" },
        profile: { roles: ["admin"], super_admin: false, is_deleted: true },
      })
    )
    const { requireAuthenticatedUser } =
      await import("@/app/server/auth/require-authenticated-user")
    await expect(requireAuthenticatedUser()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Account deactivated",
    })
  })

  it("throws UnauthorizedError when the profile read fails", async () => {
    createServerClientMock.mockReturnValue(
      makeClient({
        user: { id: "u1", email: "a@b.com" },
        profileError: { message: "rls blocked" },
      })
    )
    const { requireAuthenticatedUser } =
      await import("@/app/server/auth/require-authenticated-user")
    await expect(requireAuthenticatedUser()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Profile lookup failed",
    })
  })

  it("returns ActionActor with raw roles when authenticated", async () => {
    createServerClientMock.mockReturnValue(
      makeClient({
        user: { id: "u1", email: "a@b.com" },
        profile: { roles: ["manager", "cutter"], super_admin: false, is_deleted: false },
      })
    )
    const { requireAuthenticatedUser } =
      await import("@/app/server/auth/require-authenticated-user")
    const actor = await requireAuthenticatedUser()
    expect(actor).toEqual({
      id: "u1",
      email: "a@b.com",
      roles: ["manager", "cutter"],
      isSuperAdmin: false,
    })
  })

  it("returns empty roles array when the profile has null roles", async () => {
    createServerClientMock.mockReturnValue(
      makeClient({
        user: { id: "u1", email: "a@b.com" },
        profile: { roles: null, super_admin: false, is_deleted: false },
      })
    )
    const { requireAuthenticatedUser } =
      await import("@/app/server/auth/require-authenticated-user")
    const actor = await requireAuthenticatedUser()
    expect(actor.roles).toEqual([])
    // Important: not normalized to ["member"] — that would silently
    // grant the default role. Permission checks normalize at check-time.
  })

  it("flags super admins regardless of role list", async () => {
    createServerClientMock.mockReturnValue(
      makeClient({
        user: { id: "u1", email: "a@b.com" },
        profile: { roles: [], super_admin: true, is_deleted: false },
      })
    )
    const { requireAuthenticatedUser } =
      await import("@/app/server/auth/require-authenticated-user")
    const actor = await requireAuthenticatedUser()
    expect(actor.isSuperAdmin).toBe(true)
  })
})
