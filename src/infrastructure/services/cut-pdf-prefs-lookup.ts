import type { SupabaseClient } from "@supabase/supabase-js"

import type { UnitDisplayPreferencesInput } from "@/src/application/preferences/user-unit-display"
import { isSupportedUnitSystem } from "@/src/application/preferences/constants"

/**
 * Look up the organization-level `unitSystem` for the user who owns a
 * cut record. Used by the server-side recovery PDF route
 * (`app/api/cuts/history/[id]/pdf/route.ts`) so the regenerated
 * artifact speaks the operator's voice regardless of who triggers
 * regeneration.
 *
 * Takes the admin client as an explicit argument (matches
 * `uploadCutPdfBlob`'s pattern) because the recovery path runs with
 * the service-role key — the regen endpoint may be invoked from a
 * queued background job whose session doesn't match the cut's owner.
 *
 * Returns `undefined` on any error so the caller falls back to
 * imperial defaults — the regen path stays best-effort, never
 * blocking the PDF render. Errors are logged via `console.error` so
 * production logs surface a silent metric-to-imperial regression
 * (the visible symptom for a metric org is a one-off imperial PDF).
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
export async function getOrgUnitPreferencesForOwner(
  admin: SupabaseClient,
  ownerId: string
): Promise<UnitDisplayPreferencesInput | undefined> {
  try {
    const memberRow = await admin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", ownerId)
      .limit(1)
      .maybeSingle()
    // The Supabase JS client returns { data, error } and does NOT throw
    // on permission / RLS / timeout / constraint failures — only on
    // network-level breakage. Without these explicit checks, the
    // catch-all below never fires for DB-level errors and the metric
    // org's silent-imperial-regression symptom would be invisible in
    // production logs (CodeRabbit catch).
    if (memberRow.error) {
      console.error("[cutPdfPrefsLookup] organization_members query failed", memberRow.error)
      return undefined
    }
    const organizationId = memberRow.data?.organization_id
    if (!organizationId) return undefined
    const prefsRow = await admin
      .from("organization_preferences")
      .select("unit_system")
      .eq("organization_id", organizationId)
      .maybeSingle()
    if (prefsRow.error) {
      console.error("[cutPdfPrefsLookup] organization_preferences query failed", prefsRow.error)
      return undefined
    }
    const unitSystem = prefsRow.data?.unit_system
    if (typeof unitSystem === "string" && isSupportedUnitSystem(unitSystem)) {
      return { unitSystem }
    }
    return undefined
  } catch (error) {
    console.error("[cutPdfPrefsLookup] failed to resolve org unitSystem", error)
    return undefined
  }
}
