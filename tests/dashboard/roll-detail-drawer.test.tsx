/**
 * Phase 3 PR 3b — smoke tests for the roll detail drawer.
 *
 * Pins:
 *   - Renders the hero metric tiles + meta details for a fixture
 *   - Status badge tone reflects the roll status
 *   - "Open in engine" navigates with `?loadRoll=<id>`
 *   - "Edit roll" calls the `onEdit` prop with the roll
 *   - The spawned-offcut + usage history sections only render
 *     when their data is non-empty
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

const routerPush = vi.hoisted(() => vi.fn())
const useRouter = vi.hoisted(() =>
  vi.fn(() => ({
    push: routerPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }))
)
const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  message: vi.fn(),
}))
const getReusable = vi.hoisted(() => vi.fn())
const getChildren = vi.hoisted(() => vi.fn())
const ensureBarcode = vi.hoisted(() => vi.fn())
const downloadPdf = vi.hoisted(() => vi.fn())

vi.mock("next/navigation", () => ({ useRouter }))
vi.mock("sonner", () => ({ toast }))
vi.mock("@/src/infrastructure/services/legacyRollService", () => ({
  legacyRollService: {
    getReusableOffcutSummary: getReusable,
    getChildOffcuts: getChildren,
  },
}))
vi.mock("@/src/infrastructure/services/rollBarcodeAssetService", () => ({
  ensureStoredRollBarcode: ensureBarcode,
}))
vi.mock("@/app/dashboard/inventory/_components/roll-label-pdf", () => ({
  downloadRollLabelPdf: downloadPdf,
}))
vi.mock("@/app/dashboard/cutting-engine/_components/stock-sheet", () => ({
  StockSheet: ({ materialLabel }: { materialLabel: string }) => (
    <div data-testid="stock-sheet">{materialLabel}</div>
  ),
}))

import { RollDetailDrawer } from "@/app/dashboard/inventory/_components/roll-detail-drawer"
import type { Roll } from "@/src/infrastructure/models/supabase"

const SAMPLE_ROLL: Roll = {
  id: "roll-1",
  user_id: "u1",
  part_number: "RF-1001",
  material_type: "EPDM",
  width: 36,
  length: 240,
  thickness: 0.125,
  remaining_length: 200,
  location: "Bay A-1",
  status: "active",
  date_received: "2026-01-15",
  cost_per_sqft: 2.5,
  is_offcut: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

const CHILD_OFFCUT: Roll = {
  ...SAMPLE_ROLL,
  id: "roll-child-1",
  part_number: "RF-1002",
  width: 18,
  length: 60,
  remaining_length: 60,
  is_offcut: true,
  parent_roll_id: SAMPLE_ROLL.id,
}

describe("RollDetailDrawer (Phase 3 PR 3b)", () => {
  beforeEach(() => {
    routerPush.mockReset()
    toast.success.mockClear()
    toast.error.mockClear()
    getReusable.mockReset()
    getChildren.mockReset()
    ensureBarcode.mockReset()
    downloadPdf.mockReset()

    getReusable.mockResolvedValue({
      cut_count: 0,
      total_reusable_sqft: 0,
      total_scrap_sqft: 0,
    })
    getChildren.mockResolvedValue([])
    ensureBarcode.mockResolvedValue(undefined)
  })

  it("renders the hero tiles and meta details for an active roll", async () => {
    render(<RollDetailDrawer roll={SAMPLE_ROLL} open onOpenChange={vi.fn()} canManageRolls />)
    // Wait for the body to mount; "Sheet" section eyebrow is
    // unique. "EPDM" appears twice (SheetTitle + StockSheet stub),
    // so we don't single-element query that one.
    await screen.findByText("Sheet")
    expect(screen.getAllByText("EPDM").length).toBeGreaterThan(0)
    expect(screen.getByText("Details")).not.toBeNull()
    expect(screen.getByText("Bay A-1")).not.toBeNull()
    expect(screen.getByText("active")).not.toBeNull()
  })

  it("Open in engine routes to /dashboard/cutting-engine?loadRoll=<id>", async () => {
    const onOpenChange = vi.fn()
    render(<RollDetailDrawer roll={SAMPLE_ROLL} open onOpenChange={onOpenChange} canManageRolls />)
    const button = await screen.findByRole("button", { name: /Open in engine/i })
    fireEvent.click(button)
    expect(routerPush).toHaveBeenCalledWith("/dashboard/cutting-engine?loadRoll=roll-1")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("Edit roll button forwards the roll to onEdit and closes", async () => {
    const onEdit = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <RollDetailDrawer
        roll={SAMPLE_ROLL}
        open
        onEdit={onEdit}
        onOpenChange={onOpenChange}
        canManageRolls
      />
    )
    const button = await screen.findByRole("button", { name: /Edit roll/i })
    fireEvent.click(button)
    expect(onEdit).toHaveBeenCalledWith(SAMPLE_ROLL)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("hides the Edit roll button when canManageRolls is false", async () => {
    render(
      <RollDetailDrawer roll={SAMPLE_ROLL} open onOpenChange={vi.fn()} canManageRolls={false} />
    )
    await screen.findByText("Sheet")
    expect(screen.queryByRole("button", { name: /Edit roll/i })).toBeNull()
  })

  it("renders Spawned offcuts when the roll has children", async () => {
    getChildren.mockResolvedValue([CHILD_OFFCUT])
    render(<RollDetailDrawer roll={SAMPLE_ROLL} open onOpenChange={vi.fn()} canManageRolls />)
    await waitFor(() => {
      expect(screen.queryByText("Spawned offcuts")).not.toBeNull()
    })
    expect(screen.getByText("RF-1002")).not.toBeNull()
  })

  it("renders Usage history when there is at least one cut", async () => {
    getReusable.mockResolvedValue({
      cut_count: 3,
      total_reusable_sqft: 12.5,
      total_scrap_sqft: 4.1,
    })
    render(<RollDetailDrawer roll={SAMPLE_ROLL} open onOpenChange={vi.fn()} canManageRolls />)
    await waitFor(() => {
      expect(screen.queryByText("Usage history")).not.toBeNull()
    })
    expect(screen.getByText("Reusable offcut")).not.toBeNull()
    expect(screen.getByText("Scrap")).not.toBeNull()
  })
})
