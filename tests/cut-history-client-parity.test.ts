/**
 * Parity tests for the cut-history api-client.
 *
 * The api-client is a seam between the UI and two possible backends:
 * v1 (legacy Supabase direct) and v2 (Rust via Next route handler).
 * Task 10's requirement is that a flag flip can't break the UI —
 * the normalized `CutHistory[]` must be identical in both modes
 * for any row the Rust side can produce.
 *
 * These tests stub `fetch` and assert the client flattens the
 * shapes correctly:
 *
 * 1. `listCutHistory` with flag OFF → hits /api/cuts/history,
 *    returns the legacy `{ data: [...] }` payload unchanged.
 * 2. `listCutHistory` with flag ON → hits /api/v2/cuts/history,
 *    normalizes the Rust DTO into the same TS `CutHistory` shape.
 * 3. Field-level comparison: a v1 row and a v2 row carrying the
 *    same underlying data must produce byte-identical `CutHistory`
 *    objects for the fields the Rust DTO carries. Fields the
 *    DTO doesn't carry (`stock_label`, `cost_per_sqft`, `pdf_url`,
 *    `part_custom_dimensions`) are null on the v2 path, which
 *    every caller already handles.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

import {
  listCutHistory,
  listFavoriteIds,
} from "@/src/infrastructure/api-client/cut-history"
import type { CutHistory } from "@/src/infrastructure/models/supabase"

type FetchMock = Mock<(input: string, init?: RequestInit) => Promise<Response>>

function makeV1Row(): CutHistory {
  return {
    id: 42,
    user_id: "user-abc",
    roll_id: null,
    job_id: null,
    job_part_id: null,
    material_id: 7,
    part_id: 1,
    cut_length: 96.0,
    cut_width: 24.0,
    cut_thickness: 0.5,
    part_custom_width: null,
    part_custom_height: null,
    part_selected_size: [24],
    part_selected_size_text: ["24in"],
    part_selected_label: ["Rectangle"],
    part_custom_dimensions: null,
    cut_amount: 2,
    parts_completed: 2,
    material_used_sqft: 32.0,
    reusable_offset_sqft: 4.0,
    scrap_sqft: 1.25,
    fab_score: 0.93,
    cut_pieces: 2,
    stock_label: null,
    cost_per_sqft: null,
    pdf_url: null,
    cut_date: "2026-04-15T14:30:00Z",
    created_at: "2026-04-15T14:30:05Z",
    updated_at: "2026-04-15T14:30:05Z",
  }
}

function makeV2Dto() {
  return {
    id: 42,
    user_id: "user-abc",
    material_id: 7,
    part_id: 1,
    cut_length: 96.0,
    cut_width: 24.0,
    cut_thickness: 0.5,
    part_selected_size: [24],
    part_selected_size_text: ["24in"],
    part_selected_label: ["Rectangle"],
    cut_amount: 2,
    parts_completed: 2,
    material_used_sqft: 32.0,
    reusable_offset_sqft: 4.0,
    scrap_sqft: 1.25,
    fab_score: 0.93,
    cut_pieces: 2,
    cut_date: "2026-04-15T14:30:00Z",
    created_at: "2026-04-15T14:30:05Z",
    updated_at: "2026-04-15T14:30:05Z",
  }
}

describe("cut-history client — v1/v2 parity", () => {
  const originalFetch = global.fetch
  const originalFlag = process.env.NEXT_PUBLIC_USE_RUST_CUT_HISTORY

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_USE_RUST_CUT_HISTORY
  })

  afterEach(() => {
    global.fetch = originalFetch
    if (originalFlag === undefined) {
      delete process.env.NEXT_PUBLIC_USE_RUST_CUT_HISTORY
    } else {
      process.env.NEXT_PUBLIC_USE_RUST_CUT_HISTORY = originalFlag
    }
  })

  it("listCutHistory hits /api/cuts/history with the flag OFF", async () => {
    const v1Row = makeV1Row()
    const fetchSpy: FetchMock = vi.fn(
      async () => new Response(JSON.stringify({ data: [v1Row] }), { status: 200 })
    )
    global.fetch = fetchSpy as unknown as typeof fetch

    const rows = await listCutHistory({
      from: "2026-04-01T00:00:00Z",
      to: "2026-04-30T23:59:59Z",
      limit: 50,
      userId: "user-abc",
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const calledWith = fetchSpy.mock.calls[0][0]
    expect(calledWith.startsWith("/api/cuts/history?")).toBe(true)
    expect(calledWith).toContain("limit=50")
    expect(calledWith).toContain("from=2026-04-01")
    expect(calledWith).toContain("to=2026-04-30")
    expect(calledWith).toContain("userId=user-abc")
    expect(rows).toEqual([v1Row])
  })

  it("listCutHistory hits /api/v2/cuts/history with the flag ON", async () => {
    process.env.NEXT_PUBLIC_USE_RUST_CUT_HISTORY = "true"
    const dto = makeV2Dto()
    const fetchSpy: FetchMock = vi.fn(
      async () => new Response(JSON.stringify([dto]), { status: 200 })
    )
    global.fetch = fetchSpy as unknown as typeof fetch

    const rows = await listCutHistory({
      from: "2026-04-01T00:00:00Z",
      to: "2026-04-30T23:59:59Z",
      limit: 50,
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const url = fetchSpy.mock.calls[0][0]
    expect(url.startsWith("/api/v2/cuts/history?")).toBe(true)
    expect(url).toContain("since=2026-04-01")
    expect(url).toContain("until=2026-04-30")
    expect(url).toContain("limit=50")
    expect(url).not.toContain("userId")

    // Parity assertion: every field the Rust DTO carries should
    // land on the TS CutHistory shape with matching values.
    expect(rows).toHaveLength(1)
    const normalized = rows[0]
    const v1 = makeV1Row()
    const sharedFields: Array<keyof CutHistory> = [
      "id",
      "user_id",
      "material_id",
      "part_id",
      "cut_length",
      "cut_width",
      "cut_thickness",
      "part_selected_size",
      "part_selected_size_text",
      "part_selected_label",
      "cut_amount",
      "parts_completed",
      "material_used_sqft",
      "reusable_offset_sqft",
      "scrap_sqft",
      "fab_score",
      "cut_pieces",
      "cut_date",
      "created_at",
      "updated_at",
    ]
    for (const field of sharedFields) {
      expect(normalized[field], `field ${String(field)} should match v1`).toEqual(
        v1[field]
      )
    }
    // DTO doesn't carry these — nulls, not undefined, so the UI's
    // nullish-coalesce paths work.
    expect(normalized.stock_label).toBeNull()
    expect(normalized.cost_per_sqft).toBeNull()
    expect(normalized.pdf_url).toBeNull()
    expect(normalized.part_custom_dimensions).toBeNull()
  })

  it("v2 normalization falls back to created_at when cut_date is missing", async () => {
    process.env.NEXT_PUBLIC_USE_RUST_CUT_HISTORY = "true"
    const dto = { ...makeV2Dto(), cut_date: null }
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify([dto]), { status: 200 })
    ) as unknown as typeof fetch

    const rows = await listCutHistory()
    expect(rows[0].cut_date).toBe(dto.created_at)
  })

  it("listFavoriteIds returns v1 id list unchanged with flag OFF", async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ data: [1, 2, 3] }), { status: 200 })
    ) as unknown as typeof fetch

    const result = await listFavoriteIds()
    expect([...result.ids].sort((a, b) => a - b)).toEqual([1, 2, 3])
  })

  it("listFavoriteIds extracts ids from v2 full entries with flag ON", async () => {
    process.env.NEXT_PUBLIC_USE_RUST_CUT_HISTORY = "true"
    const dtos = [makeV2Dto(), { ...makeV2Dto(), id: 100 }]
    const fetchSpy: FetchMock = vi.fn(
      async () => new Response(JSON.stringify(dtos), { status: 200 })
    )
    global.fetch = fetchSpy as unknown as typeof fetch

    const result = await listFavoriteIds()
    expect([...result.ids].sort((a, b) => a - b)).toEqual([42, 100])
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/v2/cuts/favorites")
  })

  it("propagates non-2xx errors with status + statusText", async () => {
    global.fetch = vi.fn(
      async () => new Response("nope", { status: 500, statusText: "Internal Server Error" })
    ) as unknown as typeof fetch

    await expect(listCutHistory()).rejects.toThrow("500 Internal Server Error")
  })
})
