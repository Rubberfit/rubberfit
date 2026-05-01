import { describe, expect, it } from "vitest"

import {
  RollInventoryService,
  resolveOffcutPieces,
} from "@/src/infrastructure/services/rollInventoryService"
import { makeFakeClient } from "@/tests/helpers/fake-supabase-client"

describe("resolveOffcutPieces (pure)", () => {
  it("prefers explicit offcut_pieces, dropping tiny scraps under 0.05 sqft", () => {
    const result = resolveOffcutPieces({
      offcutPieces: [
        { width_in: 24, length_in: 12 }, // 2 sqft — keep
        { width_in: 0.5, length_in: 0.5 }, // tiny — drop
        { width_in: 12, length_in: 12 }, // 1 sqft — keep
      ],
      reusableSqFt: 999,
      parentRollWidth: 60,
    })
    expect(result.map((p) => p.width_in)).toEqual([24, 12])
  })

  it("falls back to a single full-width strip when no explicit pieces are given", () => {
    const result = resolveOffcutPieces({
      offcutPieces: undefined,
      reusableSqFt: 5, // 5 sqft / 60 wide → 12 in long
      parentRollWidth: 60,
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ width_in: 60, length_in: 12 })
  })

  it("returns [] when reusable area is below 0.1 sqft", () => {
    expect(
      resolveOffcutPieces({
        offcutPieces: [],
        reusableSqFt: 0.05,
        parentRollWidth: 60,
      })
    ).toEqual([])
  })
})

describe("RollInventoryService.getParentRoll", () => {
  it("returns the parent metadata when the row exists", async () => {
    const client = makeFakeClient({
      tables: {
        rolls: {
          select: {
            data: [
              {
                remaining_length: 240,
                width: 60,
                thickness: 0.5,
                material_type: "Butyl",
                material_type_id: "mat-1",
                color: "black",
                supplier: "Acme",
                cost_per_sqft: 1.25,
                location: "Bay A",
              },
            ],
            error: null,
          },
        },
      },
    })
    const svc = new RollInventoryService()
    const parent = await svc.getParentRoll(client, "r1")
    expect(parent?.remaining_length).toBe(240)
    expect(parent?.width).toBe(60)
  })

  it("returns null when the row is missing", async () => {
    const client = makeFakeClient({
      tables: { rolls: { select: { data: null, error: null } } },
    })
    const svc = new RollInventoryService()
    expect(await svc.getParentRoll(client, "r-missing")).toBeNull()
  })
})
