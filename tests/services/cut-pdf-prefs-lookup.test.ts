import type { SupabaseClient } from "@supabase/supabase-js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  getOrgPreferencesForOwner,
  getOrgPreferencesForRoll,
  getOrgUnitPreferencesForOwner,
} from "@/src/infrastructure/services/cut-pdf-prefs-lookup"

const OWNER_ID = "00000000-0000-4000-8000-000000000001"
const TENANT_ID = "00000000-0000-4000-8000-000000000002"
const ROLL_ID = "00000000-0000-4000-8000-000000000003"

interface FakeQuery {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  is: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
}

function makeQuery(result: { data: unknown; error: unknown }): FakeQuery {
  const query: FakeQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  }
  query.select.mockImplementation(() => query)
  query.eq.mockImplementation(() => query)
  query.is.mockImplementation(() => query)
  query.limit.mockImplementation(() => query)
  return query
}

/**
 * Builds an admin-client double whose `from(table)` returns the
 * matching scripted result. The lookup makes two calls:
 *   1. memberships → tenant_id
 *   2. tenant_settings → prefs row
 */
function makeFakeAdmin(
  membersResult: { data: unknown; error: unknown },
  prefsResult: { data: unknown; error: unknown }
) {
  const membersQuery = makeQuery(membersResult)
  const prefsQuery = makeQuery(prefsResult)
  const client = {
    from: vi.fn((table: string) => {
      if (table === "memberships") return membersQuery
      if (table === "tenant_settings") return prefsQuery
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

  it("returns the full picker quintuple when every column is valid", async () => {
    const { admin } = makeFakeAdmin(
      { data: { tenant_id: TENANT_ID }, error: null },
      {
        data: {
          unit_system: "metric",
          date_format: "dd/MM/yyyy",
          timezone: "Europe/London",
          locale: "en-US",
          default_currency: "EUR",
        },
        error: null,
      }
    )

    await expect(getOrgPreferencesForOwner(admin, OWNER_ID)).resolves.toEqual({
      unitSystem: "metric",
      dateFormat: "dd/MM/yyyy",
      timeZone: "Europe/London",
      locale: "en-US",
      defaultCurrency: "EUR",
    })
  })

  it("queries memberships on profile_id (active) and tenant_settings on tenant_id", async () => {
    const { admin, membersQuery, prefsQuery } = makeFakeAdmin(
      { data: { tenant_id: TENANT_ID }, error: null },
      {
        data: {
          unit_system: "imperial",
          date_format: "MM/dd/yyyy",
          timezone: "America/Chicago",
          locale: "en-US",
          default_currency: "USD",
        },
        error: null,
      }
    )

    await getOrgPreferencesForOwner(admin, OWNER_ID)

    expect(membersQuery.eq).toHaveBeenCalledWith("profile_id", OWNER_ID)
    expect(membersQuery.is).toHaveBeenCalledWith("deleted_at", null)
    expect(membersQuery.limit).toHaveBeenCalledWith(1)
    expect(prefsQuery.select).toHaveBeenCalledWith(
      "unit_system, date_format, timezone, locale, default_currency"
    )
    expect(prefsQuery.eq).toHaveBeenCalledWith("tenant_id", TENANT_ID)
  })

  it("omits defaultCurrency when the column value isn't a supported currency", async () => {
    const { admin } = makeFakeAdmin(
      { data: { tenant_id: TENANT_ID }, error: null },
      {
        data: {
          unit_system: "imperial",
          date_format: "MM/dd/yyyy",
          timezone: "America/Chicago",
          locale: "en-US",
          default_currency: "XYZ",
        },
        error: null,
      }
    )

    const result = await getOrgPreferencesForOwner(admin, OWNER_ID)
    expect(result?.defaultCurrency).toBeUndefined()
    // The unit + date + locale subset still populates — per-field
    // type guards stay independent.
    expect(result?.unitSystem).toBe("imperial")
  })

  it("returns defaultCurrency on its own when only that column is valid", async () => {
    const { admin } = makeFakeAdmin(
      { data: { tenant_id: TENANT_ID }, error: null },
      {
        data: {
          unit_system: null,
          date_format: null,
          timezone: null,
          locale: null,
          default_currency: "GBP",
        },
        error: null,
      }
    )

    await expect(getOrgPreferencesForOwner(admin, OWNER_ID)).resolves.toEqual({
      defaultCurrency: "GBP",
    })
  })

  it("returns undefined when membership lookup errors (caught + logged, not thrown)", async () => {
    const { admin } = makeFakeAdmin(
      { data: null, error: { message: "rls denied" } },
      { data: null, error: null }
    )

    await expect(getOrgPreferencesForOwner(admin, OWNER_ID)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith("[orgPrintPrefsLookup] memberships query failed", {
      message: "rls denied",
    })
  })

  it("returns undefined when membership row is missing (no tenant for user)", async () => {
    const { admin } = makeFakeAdmin({ data: null, error: null }, { data: null, error: null })

    await expect(getOrgPreferencesForOwner(admin, OWNER_ID)).resolves.toBeUndefined()
  })

  it("returns undefined when preferences lookup errors", async () => {
    const { admin } = makeFakeAdmin(
      { data: { tenant_id: TENANT_ID }, error: null },
      { data: null, error: { message: "timeout" } }
    )

    await expect(getOrgPreferencesForOwner(admin, OWNER_ID)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(
      "[orgPrintPrefsLookup] tenant_settings query failed",
      { message: "timeout" }
    )
  })

  it("returns an empty object when the prefs row exists but every field is invalid", async () => {
    const { admin } = makeFakeAdmin(
      { data: { tenant_id: TENANT_ID }, error: null },
      {
        data: {
          unit_system: "schmetric",
          date_format: "MMMM d",
          timezone: "Mars/Olympus",
          locale: "klingon",
        },
        error: null,
      }
    )

    await expect(getOrgPreferencesForOwner(admin, OWNER_ID)).resolves.toEqual({})
  })

  it("returns the partial subset when only some fields validate (per-field resilience)", async () => {
    const { admin } = makeFakeAdmin(
      { data: { tenant_id: TENANT_ID }, error: null },
      {
        data: {
          unit_system: "metric",
          date_format: "MMMM d, yyyy",
          timezone: "Europe/London",
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

describe("getOrgPreferencesForRoll", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * Two-call chain under the DDD schema: rolls.tenant_id →
   * tenant_settings (rolls now carry tenant_id directly, no membership
   * hop required).
   */
  function makeRollFakeAdmin(
    rollResult: { data: unknown; error: unknown },
    prefsResult: { data: unknown; error: unknown }
  ) {
    const rollQuery = makeQuery(rollResult)
    const prefsQuery = makeQuery(prefsResult)
    const client = {
      from: vi.fn((table: string) => {
        if (table === "rolls") return rollQuery
        if (table === "tenant_settings") return prefsQuery
        throw new Error(`unexpected table: ${table}`)
      }),
    }
    return {
      admin: client as unknown as SupabaseClient,
      rollQuery,
      prefsQuery,
    }
  }

  it("queries rolls.tenant_id then tenant_settings.tenant_id", async () => {
    const { admin, rollQuery, prefsQuery } = makeRollFakeAdmin(
      { data: { tenant_id: TENANT_ID }, error: null },
      {
        data: {
          unit_system: "metric",
          date_format: "dd/MM/yyyy",
          timezone: "Europe/London",
          locale: "en-US",
        },
        error: null,
      }
    )

    await expect(getOrgPreferencesForRoll(admin, ROLL_ID)).resolves.toEqual({
      unitSystem: "metric",
      dateFormat: "dd/MM/yyyy",
      timeZone: "Europe/London",
      locale: "en-US",
    })
    expect(rollQuery.select).toHaveBeenCalledWith("tenant_id")
    expect(rollQuery.eq).toHaveBeenCalledWith("id", ROLL_ID)
    expect(prefsQuery.eq).toHaveBeenCalledWith("tenant_id", TENANT_ID)
  })

  it("returns undefined when the roll lookup errors (caught + logged)", async () => {
    const { admin } = makeRollFakeAdmin(
      { data: null, error: { message: "rls denied" } },
      { data: null, error: null }
    )

    await expect(getOrgPreferencesForRoll(admin, ROLL_ID)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith("[orgPrintPrefsLookup] rolls query failed", {
      message: "rls denied",
    })
  })

  it("returns undefined when the roll row is missing", async () => {
    const { admin } = makeRollFakeAdmin(
      { data: null, error: null },
      { data: null, error: null }
    )

    await expect(getOrgPreferencesForRoll(admin, ROLL_ID)).resolves.toBeUndefined()
  })

  it("returns undefined when the roll row has no tenant_id (orphan / projection drift)", async () => {
    const { admin } = makeRollFakeAdmin(
      { data: { tenant_id: null }, error: null },
      { data: null, error: null }
    )

    await expect(getOrgPreferencesForRoll(admin, ROLL_ID)).resolves.toBeUndefined()
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
      { data: { tenant_id: TENANT_ID }, error: null },
      {
        data: {
          unit_system: "metric",
          date_format: "dd/MM/yyyy",
          timezone: "Europe/London",
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
      { data: { tenant_id: TENANT_ID }, error: null },
      {
        data: {
          unit_system: "schmetric",
          date_format: "MM/dd/yyyy",
          timezone: "America/Chicago",
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
