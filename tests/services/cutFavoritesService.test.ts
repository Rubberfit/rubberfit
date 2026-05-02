import { describe, expect, it, vi } from "vitest"

import { cutFavoritesService } from "@/src/infrastructure/services/cutFavoritesService"
import { makeFakeClient } from "@/tests/helpers/fake-supabase-client"

describe("cutFavoritesService.listFavorites", () => {
  it("returns favorited cut_history_ids for the user", async () => {
    const client = makeFakeClient({
      tables: {
        cut_history_favorites: {
          select: {
            data: [{ cut_history_id: "c1" }, { cut_history_id: "c2" }],
            error: null,
          },
        },
      },
    })
    const ids = await cutFavoritesService.listFavorites(client, "u1")
    expect(ids).toEqual(["c1", "c2"])
  })

  it("throws when the query fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const client = makeFakeClient({
      tables: {
        cut_history_favorites: {
          select: { data: null, error: { message: "permission denied" } },
        },
      },
    })
    await expect(cutFavoritesService.listFavorites(client, "u1")).rejects.toThrow(
      "Failed to list favorites"
    )
    consoleSpy.mockRestore()
  })
})

describe("cutFavoritesService.toggleFavorite", () => {
  it("inserts when the favorite is absent", async () => {
    const client = makeFakeClient({
      tables: {
        cut_history_favorites: {
          select: { data: null, error: null },
          insert: { data: null, error: null },
        },
      },
    })
    const result = await cutFavoritesService.toggleFavorite(client, "u1", "c1")
    expect(result).toEqual({ isFavorite: true })
  })

  it("deletes when the favorite is present", async () => {
    const client = makeFakeClient({
      tables: {
        cut_history_favorites: {
          select: { data: [{ id: "f1" }], error: null },
          delete: { data: null, error: null },
        },
      },
    })
    const result = await cutFavoritesService.toggleFavorite(client, "u1", "c1")
    expect(result).toEqual({ isFavorite: false })
  })

  it("returns an error structure on insert failure", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const client = makeFakeClient({
      tables: {
        cut_history_favorites: {
          select: { data: null, error: null },
          insert: { data: null, error: { message: "constraint violation" } },
        },
      },
    })
    const result = await cutFavoritesService.toggleFavorite(client, "u1", "c1")
    expect(result).toEqual({ error: "Failed to add favorite" })
    consoleSpy.mockRestore()
  })

  it("returns an error structure on lookup failure", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const client = makeFakeClient({
      tables: {
        cut_history_favorites: {
          select: { data: null, error: { message: "lookup failed" } },
        },
      },
    })
    const result = await cutFavoritesService.toggleFavorite(client, "u1", "c1")
    expect(result).toEqual({ error: "Failed to update favorite" })
    consoleSpy.mockRestore()
  })

  it("returns an error structure on delete failure", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const client = makeFakeClient({
      tables: {
        cut_history_favorites: {
          select: { data: [{ id: "f1" }], error: null },
          delete: { data: null, error: { message: "delete failed" } },
        },
      },
    })
    const result = await cutFavoritesService.toggleFavorite(client, "u1", "c1")
    expect(result).toEqual({ error: "Failed to remove favorite" })
    consoleSpy.mockRestore()
  })
})
