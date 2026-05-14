import type { SupabaseClient } from "@supabase/supabase-js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  getOrgPreferencesForOwner,
  getOrgUnitPreferencesForOwner,
} from "@/src/infrastructure/services/cut-pdf-prefs-lookup"

const OWNER_ID = "00000000-0000-4000-8000-000000000001"
const ORG_ID = "00000000-0000-4000-8000-000000000002"

interface FakeQuery {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
}

function makeQuery(result: { data: unknown; error: unknown }): FakeQuery {
  const query: FakeQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  }
  query.select.mockImplementation(() => query)
  query.eq.mockImplementation(() => query)
  query.limit.mockImplementation(() => query)
  return query
}

/**
 * Builds an admin-client double whose `from(table)` returns the
 * matching scripted result. The lookup makes two calls:
 *   1. organization_members → membership row
 *   2. organization_preferences → prefs row
 */
function makeFakeAdmin(
  membersResult: { data: unknown; error: unknown },
  prefsResult: { data: unknown; error: unknown }
) {
  const membersQuery = makeQuery(membersResult)
  const prefsQuery = makeQuery(prefsResult)
  const client = {
    from: vi.fn((table: string) => {
      if (table === "organization_members") return membersQuery
      if (table === "organization_preferences") return prefsQuery
      throw new Error(`unexpected table: ${table}`)
    }),
  }
  return {
    admin: client as unknown as SupabaseClient,
    membersQuery,
    prefsQuery,
  }
}

describe("getOrgPreferencesForOwner", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns the full picker quadruple when every column is valid", async () => {
    const { admin } = makeFakeAdmin(
      { data: { organization_id: ORG_ID }, error: null },
      {
        data: {
          unit_system: "metric",
          date_format: "dd/MM/yyyy",
          time_zone: "Europe/London",
          locale: "en-US",
        },
        error: null,
      }
    )

    await expect(getOrgPreferencesForOwner(admin, OWNER_ID)).resolves.toEqual({
      unitSystem: "metric",
      dateFormat: "dd/MM/yyyy",
      timeZone: "Europe/London",
      locale: "en-US",
    })
  })

  it("queries organization_members on user_id and organization_preferences on organization_id", async () => {
    const { admin, membersQuery, prefsQuery } = makeFakeAdmin(
      { data: { organization_id: ORG_ID }, error: null },
      {
        data: {
          unit_system: "imperial",
          date_format: "MM/dd/yyyy",
          time_zone: "America/Chicago",
          locale: "en-US",
        },
        error: null,
      }
    )

    await getOrgPreferencesForOwner(admin, OWNER_ID)

    expect(membersQuery.eq).toHaveBeenCalledWith("user_id", OWNER_ID)
    expect(membersQuery.limit).toHaveBeenCalledWith(1)
    expect(prefsQuery.select).toHaveBeenCalledWith("unit_system, date_format, time_zone, locale")
    expect(prefsQuery.eq).toHaveBeenCalledWith("organization_id", ORG_ID)
  })

  it("returns undefined when membership lookup errors (caught + logged, not thrown)", async () => {
    const { admin } = makeFakeAdmin(
      { data: null, error: { message: "rls denied" } },
      { data: null, error: null }
    )

    await expect(getOrgPreferencesForOwner(admin, OWNER_ID)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(
      "[orgPrintPrefsLookup] organization_members query failed",
      { message: "rls denied" }
    )
  })

  it("returns undefined when membership row is missing (no org for user)", async () => {
    const { admin } = makeFakeAdmin({ data: null, error: null }, { data: null, error: null })

    await expect(getOrgPreferencesForOwner(admin, OWNER_ID)).resolves.toBeUndefined()
  })

  it("returns undefined when preferences lookup errors", async () => {
    const { admin } = makeFakeAdmin(
      { data: { organization_id: ORG_ID }, error: null },
      { data: null, error: { message: "timeout" } }
    )

    await expect(getOrgPreferencesForOwner(admin, OWNER_ID)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(
      "[orgPrintPrefsLookup] organization_preferences query failed",
      { message: "timeout" }
    )
  })

  it("returns an empty object when the prefs row exists but every field is invalid", async () => {
    const { admin } = makeFakeAdmin(
      { data: { organization_id: ORG_ID }, error: null },
      {
        data: {
          unit_system: "schmetric",
          date_format: "MMMM d",
          time_zone: "Mars/Olympus",
          locale: "klingon",
        },
        error: null,
      }
    )

    await expect(getOrgPreferencesForOwner(admin, OWNER_ID)).resolves.toEqual({})
  })

  it("returns the partial subset when only some fields validate (per-field resilience)", async () => {
    const { admin } = makeFakeAdmin(
      { data: { organization_id: ORG_ID }, error: null },
      {
        data: {
          unit_system: "metric",
          date_format: "MMMM d, yyyy",
          time_zone: "Europe/London",
          locale: "klingon",
        },
        error: null,
      }
    )

    await expect(getOrgPreferencesForOwner(admin, OWNER_ID)).resolves.toEqual({
      unitSystem: "metric",
      timeZone: "Europe/London",
    })
  })

  it("returns undefined when the underlying query throws (network failure)", async () => {
    const client = {
      from: vi.fn(() => {
        throw new Error("ECONNRESET")
      }),
    } as unknown as SupabaseClient

    await expect(getOrgPreferencesForOwner(client, OWNER_ID)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(
      "[orgPrintPrefsLookup] failed to resolve org print prefs",
      expect.any(Error)
    )
  })
})

describe("getOrgUnitPreferencesForOwner (compat wrapper)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns the unit-only shape when the unified lookup yields a unit system", async () => {
    const { admin } = makeFakeAdmin(
      { data: { organization_id: ORG_ID }, error: null },
      {
        data: {
          unit_system: "metric",
          date_format: "dd/MM/yyyy",
          time_zone: "Europe/London",
          locale: "en-US",
        },
        error: null,
      }
    )

    await expect(getOrgUnitPreferencesForOwner(admin, OWNER_ID)).resolves.toEqual({
      unitSystem: "metric",
    })
  })

  it("returns undefined when the unified lookup omits unit_system (e.g. invalid value)", async () => {
    const { admin } = makeFakeAdmin(
      { data: { organization_id: ORG_ID }, error: null },
      {
        data: {
          unit_system: "schmetric",
          date_format: "MM/dd/yyyy",
          time_zone: "America/Chicago",
          locale: "en-US",
        },
        error: null,
      }
    )

    await expect(getOrgUnitPreferencesForOwner(admin, OWNER_ID)).resolves.toBeUndefined()
  })

  it("returns undefined when the unified lookup returns undefined", async () => {
    const { admin } = makeFakeAdmin({ data: null, error: null }, { data: null, error: null })

    await expect(getOrgUnitPreferencesForOwner(admin, OWNER_ID)).resolves.toBeUndefined()
  })
})
