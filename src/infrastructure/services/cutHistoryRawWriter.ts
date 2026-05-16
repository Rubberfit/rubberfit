import type { SupabaseClient } from "@supabase/supabase-js"

import type { CutHistory } from "@/src/infrastructure/models/supabase"

/**
 * Transitional raw-row writer for `cut_history`. Lives alongside the
 * entity-typed `CutHistoryService` because the `cut_history` table
 * still has legacy columns (`cut_length` inches, `material_id`
 * integer, `kerf`, `material_used_sqft`, ...) that the entity does
 * not model. `RecordCutUseCase` writes those legacy columns directly
 * here; entity-typed writes go through `CutHistoryService.create`.
 *
 * Retires when the `cut_history` schema is consolidated to the
 * entity-typed mm/sqmm shape (legacy columns dropped or backfilled).
 */
export type CutHistoryInsert = Omit<CutHistory, "id" | "created_at" | "updated_at" | "cut_date"> & {
  user_id: string
  /**
   * Optional client-supplied row id. The "PDF first, INSERT second"
   * save flow uses this to keep the storage filename
   * (`<userId>/<id>.pdf`) aligned with the eventual row id, so a
   * periodic orphan-PDF sweep can match files to rows. Falls back to
   * the column DEFAULT (`gen_random_uuid()`) when omitted.
   */
  id?: string
}

/**
 * Insert a cut_history row using the caller-supplied client (typically
 * the admin client). Returns the newly inserted row. Surfaces the
 * Supabase error verbatim so the route can map specific PG codes
 * (e.g. FK violation) to user-friendly toasts.
 */
export async function insertCutHistory(
  client: SupabaseClient,
  insert: CutHistoryInsert
): Promise<CutHistory> {
  const { data, error } = await client.from("cut_history").insert(insert).select().single()
  if (error) {
    console.error("cut_history insert error:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    })
    throw error
  }
  return data as CutHistory
}
