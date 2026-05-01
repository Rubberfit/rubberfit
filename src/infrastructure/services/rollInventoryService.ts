import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  IRollInventoryService,
  OffcutPiece,
  ParentRollMetadata,
} from "@/src/application/services/roll-inventory.service.interface"

const PARENT_ROLL_COLUMNS =
  "remaining_length, width, thickness, material_type, material_type_id, color, supplier, cost_per_sqft, location"

const r2 = (n: number): number => Math.round(n * 100) / 100

export class RollInventoryService implements IRollInventoryService {
  async getParentRoll(client: SupabaseClient, rollId: string): Promise<ParentRollMetadata | null> {
    const { data, error } = await client
      .from("rolls")
      .select(PARENT_ROLL_COLUMNS)
      .eq("id", rollId)
      .maybeSingle<ParentRollMetadata>()

    if (error) {
      console.error("rollInventoryService.getParentRoll:", error)
      return null
    }
    return data ?? null
  }

  async decrementRollLength(
    client: SupabaseClient,
    rollId: string,
    consumedInches: number
  ): Promise<void> {
    const consumed = r2(consumedInches)
    const parent = await this.getParentRoll(client, rollId)
    if (!parent) return

    const nextRemaining = Math.max(0, r2(parent.remaining_length - consumed))
    const { error } = await client
      .from("rolls")
      .update({ remaining_length: nextRemaining })
      .eq("id", rollId)

    if (error) {
      console.error("rollInventoryService.decrementRollLength:", {
        rollId,
        consumed,
        message: error.message,
        code: error.code,
      })
    }
  }

  async spawnOffcuts(
    client: SupabaseClient,
    params: {
      parentRoll: ParentRollMetadata
      parentRollId: string
      userId: string
      cutId: string
      pieces: OffcutPiece[]
    }
  ): Promise<void> {
    if (params.pieces.length === 0) return

    const offcutRows = params.pieces.map((piece, idx) => ({
      user_id: params.userId,
      parent_roll_id: params.parentRollId,
      is_offcut: true,
      material_type: params.parentRoll.material_type,
      material_type_id: params.parentRoll.material_type_id,
      width: r2(piece.width_in),
      length: r2(piece.length_in),
      remaining_length: r2(piece.length_in),
      thickness: params.parentRoll.thickness,
      color: params.parentRoll.color,
      supplier: params.parentRoll.supplier,
      cost_per_sqft: params.parentRoll.cost_per_sqft,
      location: params.parentRoll.location,
      status: "active" as const,
      notes: `Reusable offcut ${idx + 1}/${params.pieces.length} from cut #${params.cutId}`,
    }))

    const { error } = await client.from("rolls").insert(offcutRows)
    if (error) {
      console.error("rollInventoryService.spawnOffcuts:", {
        parentRollId: params.parentRollId,
        pieceCount: offcutRows.length,
        message: error.message,
        code: error.code,
      })
    }
  }
}

export const rollInventoryService = new RollInventoryService()

/**
 * Resolve which offcut pieces should spawn inventory rows. Prefers
 * the engine-emitted per-piece geometry (`offcutPieces`); when the
 * client didn't send any (older clients, non-rectangle layouts),
 * falls back to a single full-width strip approximation if the
 * reusable area exceeds the threshold.
 *
 * Pure function — no DB access — so it can live alongside the service
 * without complicating the test seam.
 */
export function resolveOffcutPieces(input: {
  offcutPieces: OffcutPiece[] | undefined
  reusableSqFt: number
  parentRollWidth: number
}): OffcutPiece[] {
  const valid = (input.offcutPieces ?? [])
    .map((p) => ({
      width_in: Number(p?.width_in ?? 0),
      length_in: Number(p?.length_in ?? 0),
    }))
    .filter(
      (p) =>
        Number.isFinite(p.width_in) &&
        Number.isFinite(p.length_in) &&
        p.width_in > 0 &&
        p.length_in > 0 &&
        (p.width_in * p.length_in) / 144 >= 0.05
    )

  if (valid.length > 0) return valid

  const reusable = r2(input.reusableSqFt)
  if (reusable >= 0.1 && input.parentRollWidth > 0) {
    return [
      {
        width_in: input.parentRollWidth,
        length_in: r2((reusable * 144) / input.parentRollWidth),
      },
    ]
  }
  return []
}
