import type { SupabaseClient } from "@supabase/supabase-js"

import type { ICutFavoritesService } from "@/src/application/services/cut-favorites.service.interface"

export class CutFavoritesService implements ICutFavoritesService {
  async listFavorites(client: SupabaseClient, userId: string): Promise<string[]> {
    const { data, error } = await client
      .from("cut_history_favorites")
      .select("cut_history_id")
      .eq("user_id", userId)

    if (error) {
      console.error("cutFavoritesService.listFavorites:", error.message)
      throw new Error("Failed to list favorites")
    }

    return (data ?? []).map((row) => (row as { cut_history_id: string }).cut_history_id)
  }

  async toggleFavorite(
    client: SupabaseClient,
    userId: string,
    cutHistoryId: string
  ): Promise<{ isFavorite: boolean } | { error: string }> {
    const { data: existing, error: lookupError } = await client
      .from("cut_history_favorites")
      .select("id")
      .eq("user_id", userId)
      .eq("cut_history_id", cutHistoryId)
      .maybeSingle()

    if (lookupError) {
      console.warn("cutFavoritesService.toggleFavorite (lookup):", lookupError.message)
      return { error: "Failed to update favorite" }
    }

    if (existing) {
      const { error } = await client
        .from("cut_history_favorites")
        .delete()
        .eq("user_id", userId)
        .eq("cut_history_id", cutHistoryId)

      if (error) {
        console.warn("cutFavoritesService.toggleFavorite (delete):", error.message)
        return { error: "Failed to remove favorite" }
      }
      return { isFavorite: false }
    }

    const { error } = await client
      .from("cut_history_favorites")
      .insert({ user_id: userId, cut_history_id: cutHistoryId })

    if (error) {
      console.warn("cutFavoritesService.toggleFavorite (insert):", error.message)
      return { error: "Failed to add favorite" }
    }
    return { isFavorite: true }
  }
}

export const cutFavoritesService = new CutFavoritesService()
