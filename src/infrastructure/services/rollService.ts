import type { SupabaseClient } from "@supabase/supabase-js"

export { rollsRepository as rollService } from "@/src/infrastructure/repositories/rolls.repository"

/**
 * Public-facing projection of a roll — the subset of columns safe to
 * embed in the unauthenticated `/r/[partNumber]/pdf` scan endpoint.
 * Adding a column here is a security-relevant change.
 */
export interface PublicRoll {
  id: string
  part_number: string | null
  material_type: string
  width: number
  length: number
  thickness: number
  remaining_length: number
  status: "active" | "depleted" | "reserved"
  color: string | null
  location: string | null
  date_received: string | null
  is_offcut: boolean
  parent_roll_id: string | null
}

const PUBLIC_ROLL_COLUMNS =
  "id, part_number, material_type, width, length, thickness, remaining_length, status, color, location, date_received, is_offcut, parent_roll_id"

/**
 * Looks up a roll by `part_number` first; falls back to `id` if the
 * input looks like a UUID. Returns `null` if neither lookup hits — the
 * route maps that to a 404. Caller passes a service-role client because
 * this is an unauthenticated public endpoint.
 */
export async function getPublicRollByPartNumberOrId(
  client: SupabaseClient,
  partNumberOrId: string
): Promise<PublicRoll | null> {
  const cleaned = partNumberOrId.trim()
  if (!cleaned) return null

  const byPart = await client
    .from("rolls")
    .select(PUBLIC_ROLL_COLUMNS)
    .eq("part_number", cleaned)
    .maybeSingle()
  if (byPart.error) {
    console.error("rollService.getPublicRollByPartNumberOrId byPart error:", byPart.error)
    throw byPart.error
  }
  if (byPart.data) return byPart.data as unknown as PublicRoll

  const isUuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleaned)
  if (!isUuidLike) return null

  const byId = await client
    .from("rolls")
    .select(PUBLIC_ROLL_COLUMNS)
    .eq("id", cleaned)
    .maybeSingle()
  if (byId.error) {
    console.error("rollService.getPublicRollByPartNumberOrId byId error:", byId.error)
    throw byId.error
  }

  return (byId.data as unknown as PublicRoll | null) ?? null
}
