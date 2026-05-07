/**
 * Unit test for the inventory paginator hook. Locks Sigilix's
 * cross-page sort regression: with a 30-row dataset and a 10-row
 * page, sorting by a column whose smallest value lives on the
 * last page must surface that row on page 1 after the sort flips
 * to ascending.
 */
import { describe, expect, it } from "vitest"
import { renderHook, act } from "@testing-library/react"

import type { Roll } from "@/src/infrastructure/models/supabase"
import type { ColumnDef } from "@/app/components/patterns/data-table"

import { usePagedRolls } from "@/app/dashboard/inventory/_components/use-paged-rolls"

const COLUMNS: ColumnDef<Roll>[] = [
  {
    id: "remaining",
    header: "Remaining",
    cell: () => null,
    sortFn: (roll) => roll.remaining_length,
  },
]

function makeRoll(id: number, remaining: number): Roll {
  // Typed factory — every required `Roll` field is set explicitly
  // so a future schema change fails this test at typecheck rather
  // than slipping through behind a cast.
  return {
    id: `roll-${id}`,
    user_id: "user-test",
    part_number: `RF-${id.toString().padStart(4, "0")}`,
    material_type: "EPDM",
    width: 36,
    length: 240,
    thickness: 0.125,
    remaining_length: remaining,
    location: "A-1",
    status: "active",
    date_received: "2026-01-01",
    cost_per_sqft: 1,
    is_offcut: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }
}

describe("usePagedRolls", () => {
  it("sorts the full list across pages, not just the current page", () => {
    // 30 rolls. The roll with the smallest remaining_length (1) is
    // at index 29 — it would land on page 3 of an unsorted list.
    const rolls: Roll[] = Array.from({ length: 30 }, (_, i) => makeRoll(i, i === 29 ? 1 : 1000 + i))

    const { result } = renderHook(() =>
      usePagedRolls({
        rolls,
        columns: COLUMNS,
        sort: { columnId: "remaining", direction: "asc" },
        defaultPageSize: 10,
      })
    )

    // Page 1, ascending by remaining → smallest-first → roll-29
    // surfaces at the top of page 1, not buried on page 3.
    expect(result.current.totalRolls).toBe(30)
    expect(result.current.totalPages).toBe(3)
    expect(result.current.pageRolls[0]?.id).toBe("roll-29")
    expect(result.current.pageRolls).toHaveLength(10)
  })

  it("flips ordering when sort.direction toggles to desc", () => {
    const rolls: Roll[] = Array.from({ length: 5 }, (_, i) => makeRoll(i, (i + 1) * 100))

    const { result, rerender } = renderHook(
      ({ direction }: { direction: "asc" | "desc" }) =>
        usePagedRolls({
          rolls,
          columns: COLUMNS,
          sort: { columnId: "remaining", direction },
          defaultPageSize: 10,
        }),
      { initialProps: { direction: "asc" } as { direction: "asc" | "desc" } }
    )

    expect(result.current.pageRolls[0]?.id).toBe("roll-0")
    expect(result.current.pageRolls[4]?.id).toBe("roll-4")

    rerender({ direction: "desc" })

    expect(result.current.pageRolls[0]?.id).toBe("roll-4")
    expect(result.current.pageRolls[4]?.id).toBe("roll-0")
  })

  it("clamps page when the dataset shrinks below the active page", () => {
    const rolls: Roll[] = Array.from({ length: 25 }, (_, i) => makeRoll(i, i))

    const { result, rerender } = renderHook(
      ({ data }: { data: Roll[] }) =>
        usePagedRolls({
          rolls: data,
          columns: COLUMNS,
          sort: { columnId: null, direction: "asc" },
          defaultPageSize: 10,
        }),
      { initialProps: { data: rolls } }
    )

    act(() => {
      result.current.setPage(3)
    })
    expect(result.current.safePage).toBe(3)

    // Drop to 5 rolls — page 3 no longer exists; safePage clamps
    // to the last available page (1).
    rerender({ data: rolls.slice(0, 5) })
    expect(result.current.totalPages).toBe(1)
    expect(result.current.safePage).toBe(1)
    expect(result.current.pageRolls).toHaveLength(5)
  })

  it("resets to page 1 semantics when pageSize increases past the row count", () => {
    const rolls: Roll[] = Array.from({ length: 12 }, (_, i) => makeRoll(i, i))

    const { result } = renderHook(() =>
      usePagedRolls({
        rolls,
        columns: COLUMNS,
        sort: { columnId: null, direction: "asc" },
        defaultPageSize: 5,
      })
    )

    act(() => {
      result.current.setPage(3)
    })
    expect(result.current.safePage).toBe(3)

    act(() => {
      result.current.setPageSize(50)
    })
    expect(result.current.totalPages).toBe(1)
    expect(result.current.safePage).toBe(1)
    expect(result.current.pageRolls).toHaveLength(12)
  })
})
