import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ARC-141 (bundle 3): the four routes hardened with Zod each must
// return 400 when the request body fails validation. The
// architectural guard at tests/architecture/api-routes-validate-bodies
// proves every write route uses Zod or forwardToRust; this file
// proves the wiring actually rejects malformed inputs end-to-end.

// Auth mocks — shared across every route under test so each describe
// block doesn't re-stub the same modules.
const requireAuthenticatedUserMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-authenticated-user", () => ({
  requireAuthenticatedUser: requireAuthenticatedUserMock,
}))

const requirePermissionMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-permission", () => ({
  requirePermission: requirePermissionMock,
}))

const requireAdminMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/api/admin/_lib/require-admin", () => ({
  requireAdmin: requireAdminMock,
}))

// Supabase client factories used by cuts/favorites + cuts/history.
const makeAuthClientMock = vi.hoisted(() => vi.fn())
const makeAdminClientMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/api/_lib/supabase-server", () => ({
  makeAuthClient: makeAuthClientMock,
  makeAdminClient: makeAdminClientMock,
}))

// Underlying services we DO NOT want called when validation fails.
const toggleFavoriteMock = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/services/cutFavoritesService", () => ({
  cutFavoritesService: { toggleFavorite: toggleFavoriteMock, listFavorites: vi.fn() },
}))

const createUserWithProfileMock = vi.hoisted(() => vi.fn())
const listDirectoryUsersMock = vi.hoisted(() => vi.fn())
// Includes the `userManagementService` instance because di-registration
// (loaded transitively by the v2/pack route) registers it by reference.
// Stripping that export crashes the DI container at module-load time.
vi.mock("@/src/infrastructure/services/userManagementService", () => ({
  createUserWithProfile: createUserWithProfileMock,
  listDirectoryUsers: listDirectoryUsersMock,
  userManagementService: {},
  UserManagementService: class {},
}))

const applyAlertActionMock = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/services/alertManagementService", () => ({
  alertManagementService: { applyAlertAction: applyAlertActionMock },
}))

function jsonRequest(url: string, body: unknown, method = "POST"): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// /api/cuts/favorites — POST { cut_history_id: uuid }
// ─────────────────────────────────────────────────────────────────────────────

describe("/api/cuts/favorites POST validates body via Zod", () => {
  beforeEach(() => {
    vi.resetModules()
    requireAuthenticatedUserMock.mockReset()
    toggleFavoriteMock.mockReset()
    makeAuthClientMock.mockReset()
    makeAdminClientMock.mockReset()
    makeAuthClientMock.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    })
    makeAdminClientMock.mockReturnValue({})
  })
  afterEach(() => vi.restoreAllMocks())

  it("returns 400 when cut_history_id is missing", async () => {
    const { POST } = await import("@/app/api/cuts/favorites/route")
    const res = await POST(jsonRequest("http://localhost/api/cuts/favorites", {}))
    expect(res.status).toBe(400)
    expect(toggleFavoriteMock).not.toHaveBeenCalled()
  })

  it("returns 400 when cut_history_id is not a UUID", async () => {
    const { POST } = await import("@/app/api/cuts/favorites/route")
    const res = await POST(
      jsonRequest("http://localhost/api/cuts/favorites", { cut_history_id: "not-a-uuid" })
    )
    expect(res.status).toBe(400)
    expect(toggleFavoriteMock).not.toHaveBeenCalled()
  })

  // ARC-137: .strict() rejects unknown keys. The BOPLA path here is
  // narrow (the body has one field), but the test pins the contract
  // so a future schema change can't quietly weaken it.
  it("returns 400 when an unknown key is present (BOPLA: .strict())", async () => {
    const { POST } = await import("@/app/api/cuts/favorites/route")
    const res = await POST(
      jsonRequest("http://localhost/api/cuts/favorites", {
        cut_history_id: "11111111-1111-1111-1111-111111111111",
        extra: "x",
      })
    )
    expect(res.status).toBe(400)
    expect(toggleFavoriteMock).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// /api/admin/users — POST { email, password, full_name, roles? }
// ─────────────────────────────────────────────────────────────────────────────

describe("/api/admin/users POST validates body via Zod", () => {
  beforeEach(() => {
    vi.resetModules()
    requireAdminMock.mockReset()
    createUserWithProfileMock.mockReset()
    requireAdminMock.mockResolvedValue({
      ok: true,
      ctx: {
        userId: "admin-1",
        userEmail: "admin@example.com",
        authClient: {},
        adminClient: {},
      },
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it("returns 400 when email is missing", async () => {
    const { POST } = await import("@/app/api/admin/users/route")
    const res = await POST(
      jsonRequest("http://localhost/api/admin/users", {
        password: "longenough",
        full_name: "Test User",
      })
    )
    expect(res.status).toBe(400)
    expect(createUserWithProfileMock).not.toHaveBeenCalled()
  })

  it("returns 400 when password is shorter than 6 characters", async () => {
    const { POST } = await import("@/app/api/admin/users/route")
    const res = await POST(
      jsonRequest("http://localhost/api/admin/users", {
        email: "user@example.com",
        password: "short",
        full_name: "Test User",
      })
    )
    expect(res.status).toBe(400)
    expect(createUserWithProfileMock).not.toHaveBeenCalled()
  })

  it("returns 400 when role is unknown", async () => {
    const { POST } = await import("@/app/api/admin/users/route")
    const res = await POST(
      jsonRequest("http://localhost/api/admin/users", {
        email: "user@example.com",
        password: "longenough",
        full_name: "Test User",
        roles: ["godmode"],
      })
    )
    expect(res.status).toBe(400)
    expect(createUserWithProfileMock).not.toHaveBeenCalled()
  })

  // ARC-137 / V8.2.3 — the highest-impact mass-assignment vector in
  // the codebase. `super_admin` isn't a column today, but new
  // boolean/role columns added on the auth side would silently flow
  // into createUserWithProfile under default Zod mode. `.strict()`
  // turns this into a 400 with `unrecognized_keys` in `issues`.
  it("returns 400 when an unrecognised key is present (BOPLA: super_admin)", async () => {
    const { POST } = await import("@/app/api/admin/users/route")
    const res = await POST(
      jsonRequest("http://localhost/api/admin/users", {
        email: "user@example.com",
        password: "longenough",
        full_name: "Test User",
        super_admin: true,
      })
    )
    expect(res.status).toBe(400)
    expect(createUserWithProfileMock).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// /api/admin/alerts/[id] — PATCH { action: "acknowledge" | "resolve" }
// ─────────────────────────────────────────────────────────────────────────────

describe("/api/admin/alerts/[id] PATCH validates body via Zod", () => {
  beforeEach(() => {
    vi.resetModules()
    requireAdminMock.mockReset()
    applyAlertActionMock.mockReset()
    requireAdminMock.mockResolvedValue({
      ok: true,
      ctx: {
        userId: "admin-1",
        userEmail: "admin@example.com",
        authClient: {},
        adminClient: {},
      },
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it("returns 400 when action is missing", async () => {
    const { PATCH } = await import("@/app/api/admin/alerts/[id]/route")
    const res = await PATCH(jsonRequest("http://localhost/api/admin/alerts/abc", {}, "PATCH"), {
      params: Promise.resolve({ id: "abc" }),
    })
    expect(res.status).toBe(400)
    expect(applyAlertActionMock).not.toHaveBeenCalled()
  })

  it("returns 400 when action is outside the enum", async () => {
    const { PATCH } = await import("@/app/api/admin/alerts/[id]/route")
    const res = await PATCH(
      jsonRequest("http://localhost/api/admin/alerts/abc", { action: "delete" }, "PATCH"),
      { params: Promise.resolve({ id: "abc" }) }
    )
    expect(res.status).toBe(400)
    expect(applyAlertActionMock).not.toHaveBeenCalled()
  })

  // ARC-137: future-proof guard. If the alert payload grows a
  // `note`-like field, the schema must be the gate that opts it in,
  // not the absence of validation.
  it("returns 400 when an unknown key is present (BOPLA: .strict())", async () => {
    const { PATCH } = await import("@/app/api/admin/alerts/[id]/route")
    const res = await PATCH(
      jsonRequest(
        "http://localhost/api/admin/alerts/abc",
        { action: "acknowledge", note: "x" },
        "PATCH"
      ),
      { params: Promise.resolve({ id: "abc" }) }
    )
    expect(res.status).toBe(400)
    expect(applyAlertActionMock).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// /api/v2/pack — POST PackRequest (dev-only route, returns 410 on Vercel)
// ─────────────────────────────────────────────────────────────────────────────

describe("/api/v2/pack POST validates body via Zod", () => {
  const ENV = process.env

  beforeEach(() => {
    requireAuthenticatedUserMock.mockReset()
    requirePermissionMock.mockReset()
    process.env = { ...ENV, VERCEL: undefined }
    requireAuthenticatedUserMock.mockResolvedValue({
      id: "u1",
      email: "u1@example.com",
      roles: ["admin"],
      isSuperAdmin: false,
      activeTenantId: null,
    })
    requirePermissionMock.mockReturnValue(undefined)
  })

  afterEach(() => {
    process.env = ENV
    vi.restoreAllMocks()
  })

  // The route's transitive imports include `@/di/di-registration`,
  // which sets up the entire DI container at module load. In a
  // shared worker (full-suite run) the first import can take several
  // seconds, blowing past the 5 s default test timeout. Bump for both
  // cases so the slow first import doesn't fail the suite. Also drop
  // `vi.resetModules()` here — it would force the DI registration to
  // re-run on every test in this describe, multiplying the cost.
  const PACK_TIMEOUT_MS = 30_000

  it(
    "returns 400 when bins is missing",
    async () => {
      const { POST } = await import("@/app/api/v2/pack/route")
      const res = await POST(
        jsonRequest("http://localhost/api/v2/pack", { items: [], clearance: 0 })
      )
      expect(res.status).toBe(400)
    },
    PACK_TIMEOUT_MS
  )

  it(
    "returns 400 when items array contains an invalid part shape",
    async () => {
      const { POST } = await import("@/app/api/v2/pack/route")
      const res = await POST(
        jsonRequest("http://localhost/api/v2/pack", {
          bins: [{ binId: "b1", width: 100, height: 100, kind: "fresh" }],
          items: [{ shapeId: "s1" }],
          clearance: 0,
        })
      )
      expect(res.status).toBe(400)
    },
    PACK_TIMEOUT_MS
  )
})
