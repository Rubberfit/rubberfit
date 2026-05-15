import { describe, expect, it, vi } from "vitest"
import "reflect-metadata"

import {
  CutForbiddenError,
  CutNotFoundError,
  deleteCutByIdAuthorized,
  getCutByIdAuthorized,
  getCutAnalytics,
  getCutByIdRaw,
  getExistingCutPdfUrl,
  insertCutHistory,
  listCutHistoryPaginated,
} from "@/src/infrastructure/services/legacyCutHistoryService"

import { makeFakeClient } from "@/tests/helpers/fake-supabase-client"

const OWNER = "owner-1"
const VIEWER = "viewer-2"
const PRIVILEGED_ROLES = ["manager"] as const

describe("getCutByIdAuthorized", () => {
  it("returns the cut when caller is the owner", async () => {
    const client = makeFakeClient({
      tables: {
        cut_history: {
          select: { data: [{ id: "c1", user_id: OWNER }], error: null },
        },
      },
    })
    const cut = await getCutByIdAuthorized(client, "c1", OWNER, [])
    expect(cut.id).toBe("c1")
  })

  it("returns the cut when caller is privileged (admin/manager/supervisor)", async () => {
    const client = makeFakeClient({
      tables: {
        cut_history: {
          select: { data: [{ id: "c1", user_id: OWNER }], error: null },
        },
      },
    })
    const cut = await getCutByIdAuthorized(client, "c1", VIEWER, PRIVILEGED_ROLES)
    expect(cut.id).toBe("c1")
  })

  it("throws CutForbiddenError when caller is neither owner nor privileged", async () => {
    const client = makeFakeClient({
      tables: {
        cut_history: {
          select: { data: [{ id: "c1", user_id: OWNER }], error: null },
        },
      },
    })
    await expect(getCutByIdAuthorized(client, "c1", VIEWER, ["cutter"])).rejects.toBeInstanceOf(
      CutForbiddenError
    )
  })

  it("throws CutNotFoundError on missing row", async () => {
    const client = makeFakeClient({
      tables: { cut_history: { select: { data: null, error: null } } },
    })
    await expect(getCutByIdAuthorized(client, "missing", OWNER, [])).rejects.toBeInstanceOf(
      CutNotFoundError
    )
  })
})

describe("deleteCutByIdAuthorized", () => {
  it("admin can delete any cut", async () => {
    const client = makeFakeClient({
      tables: {
        cut_history: {
          select: { data: [{ id: "c1", user_id: OWNER }], error: null },
          delete: { data: null, error: null },
        },
      },
    })
    await expect(deleteCutByIdAuthorized(client, "c1", VIEWER, ["admin"])).resolves.toBeUndefined()
  })

  it("cutter can delete only own cut", async () => {
    const client = makeFakeClient({
      tables: {
        cut_history: {
          select: { data: [{ id: "c1", user_id: OWNER }], error: null },
          delete: { data: null, error: null },
        },
      },
    })
    await expect(deleteCutByIdAuthorized(client, "c1", VIEWER, ["cutter"])).rejects.toBeInstanceOf(
      CutForbiddenError
    )
    await expect(deleteCutByIdAuthorized(client, "c1", OWNER, ["cutter"])).resolves.toBeUndefined()
  })

  it("viewer cannot delete", async () => {
    const client = makeFakeClient({
      tables: {
        cut_history: {
          select: { data: [{ id: "c1", user_id: OWNER }], error: null },
        },
      },
    })
    await expect(deleteCutByIdAuthorized(client, "c1", OWNER, ["viewer"])).rejects.toBeInstanceOf(
      CutForbiddenError
    )
  })
})

describe("getCutByIdRaw", () => {
  it("returns the cut without a role check", async () => {
    const client = makeFakeClient({
      tables: {
        cut_history: { select: { data: [{ id: "c1", user_id: OWNER }], error: null } },
      },
    })
    const cut = await getCutByIdRaw(client, "c1")
    expect(cut.id).toBe("c1")
  })

  it("throws CutNotFoundError when missing", async () => {
    const client = makeFakeClient({
      tables: { cut_history: { select: { data: null, error: null } } },
    })
    await expect(getCutByIdRaw(client, "missing")).rejects.toBeInstanceOf(CutNotFoundError)
  })
})

describe("getExistingCutPdfUrl", () => {
  it("returns the persisted URL when present", async () => {
    const client = makeFakeClient({
      tables: {
        cut_history: { select: { data: [{ pdf_url: "https://x/y.pdf" }], error: null } },
      },
    })
    expect(await getExistingCutPdfUrl(client, "c1")).toBe("https://x/y.pdf")
  })

  it("returns null when the row exists but pdf_url is null", async () => {
    const client = makeFakeClient({
      tables: { cut_history: { select: { data: [{ pdf_url: null }], error: null } } },
    })
    expect(await getExistingCutPdfUrl(client, "c1")).toBeNull()
  })

  it("returns null on missing row", async () => {
    const client = makeFakeClient({
      tables: { cut_history: { select: { data: null, error: null } } },
    })
    expect(await getExistingCutPdfUrl(client, "c1")).toBeNull()
  })
})

describe("insertCutHistory", () => {
  it("returns the inserted row on success", async () => {
    const client = makeFakeClient({
      tables: {
        cut_history: { insert: { data: [{ id: "c1" }], error: null } },
      },
    })
    const row = await insertCutHistory(client, {
      user_id: OWNER,
      roll_id: null,
      job_id: null,
      job_part_id: null,
      material_id: 1,
      part_id: 1,
      cut_length: 10,
      cut_width: 10,
      cut_thickness: 1,
      kerf: 0.125,
      cut_amount: 1,
      parts_completed: 1,
      cut_pieces: 1,
      material_used_sqft: 1,
      reusable_offset_sqft: 0,
      scrap_sqft: 0,
      fab_score: 80,
      part_custom_width: null,
      part_custom_height: null,
      part_custom_dimensions: null,
      part_selected_size: null,
      part_selected_size_text: null,
      part_selected_label: null,
      stock_label: null,
      cost_per_sqft: null,
      pdf_url: null,
      source: "auto",
      layout_json: null,
    })
    expect(row.id).toBe("c1")
  })

  it("propagates Supabase errors verbatim", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const client = makeFakeClient({
      tables: {
        cut_history: {
          insert: {
            data: null,
            error: { message: "FK violation", code: "23503", details: null, hint: null },
          },
        },
      },
    })
    await expect(
      insertCutHistory(client, {
        user_id: OWNER,
        roll_id: null,
        job_id: null,
        job_part_id: null,
        material_id: 1,
        part_id: 1,
        cut_length: 10,
        cut_width: 10,
        cut_thickness: 1,
        kerf: 0.125,
        cut_amount: 1,
        parts_completed: 1,
        cut_pieces: 1,
        material_used_sqft: 1,
        reusable_offset_sqft: 0,
        scrap_sqft: 0,
        fab_score: 80,
        part_custom_width: null,
        part_custom_height: null,
        part_custom_dimensions: null,
        part_selected_size: null,
        part_selected_size_text: null,
        part_selected_label: null,
        stock_label: null,
        cost_per_sqft: null,
        pdf_url: null,
        source: "auto",
        layout_json: null,
      })
    ).rejects.toMatchObject({ code: "23503" })
    consoleSpy.mockRestore()
  })
})

describe("listCutHistoryPaginated", () => {
  it("returns rows + count for a privileged caller without filterUserId", async () => {
    const client = makeFakeClient({
      tables: {
        cut_history: {
          select: { data: [{ id: "c1" }, { id: "c2" }], error: null },
        },
      },
    })
    const result = await listCutHistoryPaginated(client, {
      page: 1,
      limit: 20,
      from: null,
      to: null,
      filterUserId: null,
      requesterUserId: VIEWER,
      requesterRoles: PRIVILEGED_ROLES,
    })
    expect(result.data).toHaveLength(2)
    expect(result.total).toBe(2)
  })

  it("non-privileged caller scopes to their own rows", async () => {
    const client = makeFakeClient({
      tables: { cut_history: { select: { data: [], error: null } } },
    })
    const result = await listCutHistoryPaginated(client, {
      page: 1,
      limit: 20,
      from: null,
      to: null,
      filterUserId: "someone-else",
      requesterUserId: VIEWER,
      requesterRoles: ["viewer"],
    })
    expect(result.total).toBe(0)
  })
})

describe("getCutAnalytics", () => {
  it("privileged + filterUserId narrows to that user", async () => {
    const client = makeFakeClient({
      tables: { cut_history: { select: { data: [{ id: "c1" }], error: null } } },
    })
    const data = await getCutAnalytics(client, {
      from: "2026-01-01",
      to: null,
      requesterUserId: VIEWER,
      requesterRoles: ["admin"],
      filterUserId: OWNER,
    })
    expect(data).toHaveLength(1)
  })

  it("non-privileged user always sees only their own", async () => {
    const client = makeFakeClient({
      tables: { cut_history: { select: { data: [], error: null } } },
    })
    const data = await getCutAnalytics(client, {
      from: "2026-01-01",
      to: "2026-12-31",
      requesterUserId: VIEWER,
      requesterRoles: ["cutter"],
      filterUserId: OWNER, // ignored
    })
    expect(data).toEqual([])
  })
})
