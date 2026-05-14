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
 * blocking the PDF render.
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
    const organizationId = memberRow.data?.organization_id
    if (!organizationId) return undefined
    const prefsRow = await admin
      .from("organization_preferences")
      .select("unit_system")
      .eq("organization_id", organizationId)
      .maybeSingle()
    const unitSystem = prefsRow.data?.unit_system
    if (typeof unitSystem === "string" && isSupportedUnitSystem(unitSystem)) {
      return { unitSystem }
    }
    return undefined
  } catch (_error) {
    return undefined
  }
}
