import { DEFAULT_UNIT_SYSTEM, isUnitSystem, type UnitSystem } from "@/app/lib/units"
import { makeAdminClient } from "@/src/infrastructure/supabase/server-clients"

interface ResolveArgs {
  userId: string | null
  tenantId: string | null
}

/**
 * Resolve the effective unit system for a session.
 * Precedence: user override → tenant default → metric fallback.
 * Returns the fallback if the clients/env are unavailable.
 */
export async function resolveUnitSystem({
  userId,
  tenantId,
}: ResolveArgs): Promise<UnitSystem> {
  const supabase = makeAdminClient()
  if (!supabase) return DEFAULT_UNIT_SYSTEM

  if (userId) {
    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("ui_preferences")
      .eq("profile_id", userId)
      .maybeSingle()

    const override = (prefs?.ui_preferences as Record<string, unknown> | null)
      ?.unit_system
    if (isUnitSystem(override)) return override
  }

  if (tenantId) {
    const { data: settings } = await supabase
      .from("tenant_settings")
      .select("unit_system")
      .eq("tenant_id", tenantId)
      .maybeSingle()

    if (isUnitSystem(settings?.unit_system)) return settings.unit_system
  }

  return DEFAULT_UNIT_SYSTEM
}
