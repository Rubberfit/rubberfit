import type { SupabaseClient } from "@supabase/supabase-js"

export interface ICutFavoritesService {
  /**
   * Lists `cut_history_id`s favorited by `userId`. Returns an empty
   * array if the favorites table is missing (degrades gracefully —
   * historical migrations have left some envs without it).
   */
  listFavorites(client: SupabaseClient, userId: string): Promise<string[]>
  /**
   * Toggles a favorite link: inserts if absent, deletes if present.
   * Returns `true` when the row is now favorited, `false` when it is
   * not, or `null` on a hard DB error (caller should map to 500).
   */
  toggleFavorite(
    client: SupabaseClient,
    userId: string,
    cutHistoryId: string
  ): Promise<{ isFavorite: boolean } | { error: string }>
}
