import type { SupabaseClient } from "@supabase/supabase-js"

export interface OffcutPiece {
  width_in: number
  length_in: number
}

export interface ParentRollMetadata {
  remaining_length: number
  width: number
  thickness: number
  material_type: string
  material_type_id: string | null
  color: string | null
  supplier: string | null
  cost_per_sqft: number | null
  location: string | null
}

export interface IRollInventoryService {
  /**
   * Fetches the parent-roll columns needed by the cut-recording
   * pipeline. Returns `null` if the roll doesn't exist (caller
   * silently skips inventory reconciliation).
   */
  getParentRoll(client: SupabaseClient, rollId: string): Promise<ParentRollMetadata | null>

  /**
   * Decrements the parent roll's `remaining_length` by `consumedInches`,
   * clamped at zero. Best-effort: errors are logged but not surfaced.
   */
  decrementRollLength(client: SupabaseClient, rollId: string, consumedInches: number): Promise<void>

  /**
   * Inserts one inventory row per reusable-offcut piece, inheriting
   * material metadata from the parent roll. The note column embeds the
   * source cut id so operators can trace an offcut back to its origin.
   * Best-effort: errors are logged but not surfaced.
   */
  spawnOffcuts(
    client: SupabaseClient,
    params: {
      parentRoll: ParentRollMetadata
      parentRollId: string
      userId: string
      cutId: string
      pieces: OffcutPiece[]
    }
  ): Promise<void>
}
