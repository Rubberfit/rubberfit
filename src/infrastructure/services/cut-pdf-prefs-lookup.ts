import type { SupabaseClient } from "@supabase/supabase-js"

import type { UnitDisplayPreferencesInput } from "@/src/application/preferences/user-unit-display"
import type { UserDatePreferencesInput } from "@/src/application/preferences/user-date-format"
import {
  isSupportedCurrency,
  isSupportedDateFormat,
  isSupportedLocale,
  isSupportedTimeZone,
  isSupportedUnitSystem,
  type SupportedCurrency,
} from "@/src/application/preferences/constants"

/**
 * Combined unit + date + currency preferences for printed/exported
 * output.
 *
 * The shape is the structural intersection of the two display-helper
 * inputs (unit + date) widened with an optional `defaultCurrency` so a
 * single org-prefs lookup also feeds the currency rendering on
 * customer-facing PDFs (Job Sheet — PR 2f). Currency is display-only:
 * the helper picks the symbol/format from the operator's locale +
 * currency, it does NOT convert amounts.
 */
export interface OrgPrintCurrencyPreferencesInput {
  defaultCurrency?: SupportedCurrency
}

export type OrgPrintPreferencesInput = UnitDisplayPreferencesInput &
  UserDatePreferencesInput &
  OrgPrintCurrencyPreferencesInput

/**
 * Look up the organization-level print preferences (unit system +
 * date format + time zone + locale) for the user who owns a cut
 * record. Used by:
 *   - `app/api/_lib/cut-pdf-server.ts` server-recovery PDF route, so
 *     a regenerated artifact speaks the operator's voice regardless
 *     of who triggers regeneration.
 *   - any future PDF/CSV builder that runs without a session-bound
 *     `useOrganizationPreferences()` provider in scope.
 *
 * Takes the admin client as an explicit argument (matches
 * `uploadCutPdfBlob`'s pattern) because the recovery path runs with
 * the service-role key — the regen endpoint may be invoked from a
 * queued background job whose session doesn't match the cut's owner.
 *
 * Returns `undefined` on any error so the caller falls back to
 * helper defaults (imperial / `MM/dd/yyyy` / `America/Chicago` /
 * `en-US`) — the regen path stays best-effort, never blocking the
 * PDF render. Errors are logged via `console.error` so production
 * logs surface a silent regression.
 *
 * Returns a partial safe shape: each picker field is included only
 * if the DB row carries a value that survives the constants-module
 * type guard. The `?` optionals in the input types let downstream
 * formatters fall back per-field, so a row with a valid
 * `unit_system` but an invalid `time_zone` (e.g. legacy data, manual
 * SQL edit) still drives unit conversion correctly.
 *
 * Known limitation: when an `ownerId` belongs to multiple
 * organizations, this picks the first membership row. `CutHistory`
 * doesn't carry `organization_id` directly today; the live save-time
 * path goes through `useOrganizationPreferences()` which is scoped
 * by the cookie session's active org, so the recovery path is the
 * only place this ambiguity surfaces. Acceptable for the v1 rollout
 * because users are effectively single-org today; revisit when
 * multi-org membership ships.
 */
export async function getOrgPreferencesForOwner(
  admin: SupabaseClient,
  ownerId: string
): Promise<OrgPrintPreferencesInput | undefined> {
  try {
    // The DDD migration renamed organization_members → memberships
    // (user_id → profile_id) and organization_preferences → tenant_settings
    // (organization_id → tenant_id, time_zone → timezone).
    const memberRow = await admin
      .from("memberships")
      .select("tenant_id")
      .eq("profile_id", ownerId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle()
    // The Supabase JS client returns { data, error } and does NOT throw
    // on permission / RLS / timeout / constraint failures — only on
    // network-level breakage. Without these explicit checks, the
    // catch-all below never fires for DB-level errors and silent
    // regressions would be invisible in production logs.
    if (memberRow.error) {
      console.error("[orgPrintPrefsLookup] memberships query failed", memberRow.error)
      return undefined
    }
    const tenantId = memberRow.data?.tenant_id
    if (!tenantId) return undefined
    const prefsRow = await admin
      .from("tenant_settings")
      .select("unit_system, date_format, timezone, locale, default_currency")
      .eq("tenant_id", tenantId)
      .maybeSingle()
    if (prefsRow.error) {
      console.error("[orgPrintPrefsLookup] tenant_settings query failed", prefsRow.error)
      return undefined
    }
    const row = prefsRow.data
    if (!row) return undefined

    const result: OrgPrintPreferencesInput = {}
    if (typeof row.unit_system === "string" && isSupportedUnitSystem(row.unit_system)) {
      result.unitSystem = row.unit_system
    }
    if (typeof row.date_format === "string" && isSupportedDateFormat(row.date_format)) {
      result.dateFormat = row.date_format
    }
    if (typeof row.timezone === "string" && isSupportedTimeZone(row.timezone)) {
      result.timeZone = row.timezone
    }
    if (typeof row.locale === "string" && isSupportedLocale(row.locale)) {
      result.locale = row.locale
    }
    if (typeof row.default_currency === "string" && isSupportedCurrency(row.default_currency)) {
      result.defaultCurrency = row.default_currency
    }
    return result
  } catch (error) {
    console.error("[orgPrintPrefsLookup] failed to resolve org print prefs", error)
    return undefined
  }
}

/**
 * Compatibility wrapper for callers that only need the unit system
 * (`UnitDisplayPreferencesInput`). Delegates to
 * `getOrgPreferencesForOwner` so there's a single query path and a
 * single error/log surface; new callers should prefer the unified
 * helper directly.
 */
export async function getOrgUnitPreferencesForOwner(
  admin: SupabaseClient,
  ownerId: string
): Promise<UnitDisplayPreferencesInput | undefined> {
  const prefs = await getOrgPreferencesForOwner(admin, ownerId)
  if (!prefs || prefs.unitSystem === undefined) return undefined
  return { unitSystem: prefs.unitSystem }
}

/**
 * Look up the tenant-level print preferences for the tenant that owns a
 * roll. Used by the public roll QR PDF route (`app/r/[partNumber]/pdf/
 * route.ts`) so a scanned label speaks the operator's `dateFormat` /
 * `timeZone` / `locale` / `unitSystem` regardless of who scanned it.
 *
 * Under the DDD schema `rolls` carries `tenant_id` directly, so the
 * lookup is one hop: rolls.tenant_id → tenant_settings.tenant_id.
 *
 * Best-effort: any DB error returns undefined and is logged via
 * console.error so the caller falls back to helper defaults.
 */
export async function getOrgPreferencesForRoll(
  admin: SupabaseClient,
  rollId: string
): Promise<OrgPrintPreferencesInput | undefined> {
  try {
    const rollRow = await admin.from("rolls").select("tenant_id").eq("id", rollId).maybeSingle()
    if (rollRow.error) {
      console.error("[orgPrintPrefsLookup] rolls query failed", rollRow.error)
      return undefined
    }
    const tenantId = rollRow.data?.tenant_id
    if (!tenantId || typeof tenantId !== "string") return undefined

    const prefsRow = await admin
      .from("tenant_settings")
      .select("unit_system, date_format, timezone, locale, default_currency")
      .eq("tenant_id", tenantId)
      .maybeSingle()
    if (prefsRow.error) {
      console.error("[orgPrintPrefsLookup] tenant_settings query failed", prefsRow.error)
      return undefined
    }
    const row = prefsRow.data
    if (!row) return undefined

    const result: OrgPrintPreferencesInput = {}
    if (typeof row.unit_system === "string" && isSupportedUnitSystem(row.unit_system)) {
      result.unitSystem = row.unit_system
    }
    if (typeof row.date_format === "string" && isSupportedDateFormat(row.date_format)) {
      result.dateFormat = row.date_format
    }
    if (typeof row.timezone === "string" && isSupportedTimeZone(row.timezone)) {
      result.timeZone = row.timezone
    }
    if (typeof row.locale === "string" && isSupportedLocale(row.locale)) {
      result.locale = row.locale
    }
    if (typeof row.default_currency === "string" && isSupportedCurrency(row.default_currency)) {
      result.defaultCurrency = row.default_currency
    }
    return result
  } catch (error) {
    console.error("[orgPrintPrefsLookup] failed to resolve org print prefs for roll", error)
    return undefined
  }
}
