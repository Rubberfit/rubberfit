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
  is_platform_admin: boolean | null
}

interface FakeMembership {
  roles: string[] | null
}

function makeClient(opts: {
  user?: { id: string; email: string } | null
  authError?: { message: string } | null
  profile?: FakeProfile | null
  profileError?: { message: string } | null
  memberships?: FakeMembership[] | null
  membershipsError?: { message: string } | null
}) {
  const profileQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: opts.profile ?? null,
      error: opts.profileError ?? null,
    }),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({
        data: opts.memberships ?? [],
        error: opts.membershipsError ?? null,
      }).then(resolve),
  }
  const membershipsQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({
        data: opts.memberships ?? [],
        error: opts.membershipsError ?? null,
      }).then(resolve),
  }
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: opts.user ?? null },
        error: opts.authError ?? null,
      }),
    },
    from: vi.fn((table: string) =>
      table === "memberships" ? membershipsQuery : profileQuery
    ),
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
      makeClient({ user: { id: "u1", email: "a@b.com" }, profile: null, memberships: [] })
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

  it("throws UnauthorizedError when the profile has no active memberships and isn't a platform admin", async () => {
    createServerClientMock.mockReturnValue(
      makeClient({
        user: { id: "u1", email: "a@b.com" },
        profile: { is_platform_admin: false },
        memberships: [],
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

  it("returns ActionActor with the role union when authenticated", async () => {
    createServerClientMock.mockReturnValue(
      makeClient({
        user: { id: "u1", email: "a@b.com" },
        profile: { is_platform_admin: false },
        memberships: [{ roles: ["manager"] }, { roles: ["cutter", "manager"] }],
      })
    )
    const { requireAuthenticatedUser } =
      await import("@/app/server/auth/require-authenticated-user")
    const actor = await requireAuthenticatedUser()
    expect(actor.id).toBe("u1")
    expect(actor.email).toBe("a@b.com")
    expect(actor.isSuperAdmin).toBe(false)
    expect(actor.roles.sort()).toEqual(["cutter", "manager"])
  })

  it("flags platform admins regardless of role list", async () => {
    createServerClientMock.mockReturnValue(
      makeClient({
        user: { id: "u1", email: "a@b.com" },
        profile: { is_platform_admin: true },
        memberships: [],
      })
    )
    const { requireAuthenticatedUser } =
      await import("@/app/server/auth/require-authenticated-user")
    const actor = await requireAuthenticatedUser()
    expect(actor.isSuperAdmin).toBe(true)
    // Empty roles is fine; platform admin bypass handles the access path.
    expect(actor.roles).toEqual([])
  })
})
