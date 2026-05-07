/**
 * Phase 2 PR 3 — smoke test for the rebuilt Materials settings
 * page. Mocks the three infrastructure services (`materialTypeService`,
 * `rollService`, `purchaseOrderService`) and verifies that the
 * page renders the catalog DataTable, opens the Add drawer on
 * the primary action, and routes Edit / Delete clicks to the
 * right state transitions.
 *
 * Spec: `docs/superpowers/specs/2026-05-06-dashboard-phase2-design.md` §4.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import type { MaterialType } from "@/src/infrastructure/models/supabase"

const fixtureMaterials: MaterialType[] = [
  {
    id: "mat-1",
    name: "Neoprene",
    description: "General-purpose synthetic rubber.",
    default_cost: 2.5,
    min_stock_alert: 100,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  } as MaterialType,
  {
    id: "mat-2",
    name: "EPDM",
    description: "Weather-resistant.",
    default_cost: 3.1,
    min_stock_alert: 80,
    created_at: "2025-01-02T00:00:00Z",
    updated_at: "2025-01-02T00:00:00Z",
  } as MaterialType,
]

const materialTypeService = vi.hoisted(() => ({
  getAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}))
const rollService = vi.hoisted(() => ({
  existsByMaterialType: vi.fn(),
}))
const purchaseOrderService = vi.hoisted(() => ({
  existsItemsByMaterialType: vi.fn(),
}))
const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock("@/src/infrastructure/services/materialTypeService", () => ({
  materialTypeService,
}))
vi.mock("@/src/infrastructure/services/rollService", () => ({ rollService }))
vi.mock("@/src/infrastructure/services/purchaseOrderService", () => ({ purchaseOrderService }))
vi.mock("sonner", () => ({ toast }))

import MaterialSettingsPage from "@/app/dashboard/settings/materials/page"

describe("Material settings page (Phase 2 PR 3)", () => {
  beforeEach(() => {
    materialTypeService.getAll.mockReset()
    materialTypeService.getAll.mockResolvedValue(fixtureMaterials)
    materialTypeService.create.mockReset().mockResolvedValue(undefined)
    materialTypeService.update.mockReset().mockResolvedValue(undefined)
    materialTypeService.delete.mockReset().mockResolvedValue(undefined)
    rollService.existsByMaterialType.mockReset().mockResolvedValue(false)
    purchaseOrderService.existsItemsByMaterialType.mockReset().mockResolvedValue(false)
    toast.success.mockClear()
    toast.error.mockClear()
  })

  it("renders the catalog and the Add material primary action", async () => {
    render(<MaterialSettingsPage />)
    await waitFor(() => expect(screen.getByText("Neoprene")).not.toBeNull())
    expect(screen.getByText("EPDM")).not.toBeNull()
    expect(screen.getByRole("button", { name: /Add material/i })).not.toBeNull()
  })

  it("opens the Add drawer when the primary action is clicked", async () => {
    render(<MaterialSettingsPage />)
    await waitFor(() => expect(screen.getByText("Neoprene")).not.toBeNull())
    fireEvent.click(screen.getByRole("button", { name: /Add material/i }))
    expect(screen.getByText("New material")).not.toBeNull()
  })

  it("opens the Edit drawer with prefilled values when the row's edit action fires", async () => {
    render(<MaterialSettingsPage />)
    await waitFor(() => expect(screen.getByText("Neoprene")).not.toBeNull())
    fireEvent.click(screen.getByRole("button", { name: /Edit Neoprene/i }))
    expect(screen.getByText("Edit material")).not.toBeNull()
    // FormField's label adds a trailing `*` for required, so query by id.
    const nameInput = document.getElementById("material-name") as HTMLInputElement | null
    expect(nameInput?.value).toBe("Neoprene")
  })

  it("opens the destructive AlertDialog when the row's delete action fires", async () => {
    render(<MaterialSettingsPage />)
    await waitFor(() => expect(screen.getByText("Neoprene")).not.toBeNull())
    fireEvent.click(screen.getByRole("button", { name: /Delete Neoprene/i }))
    // AlertDialog's confirm button copy distinguishes from the row trigger.
    const dialogConfirm = screen.getAllByRole("button", { name: /Delete material/i })
    // One row has the title "Delete material" + the AlertDialog confirm.
    expect(dialogConfirm.length).toBeGreaterThan(0)
  })

  it("blocks delete when rolls already reference the material", async () => {
    rollService.existsByMaterialType.mockResolvedValueOnce(true)
    render(<MaterialSettingsPage />)
    await waitFor(() => expect(screen.getByText("Neoprene")).not.toBeNull())
    fireEvent.click(screen.getByRole("button", { name: /Delete Neoprene/i }))
    const buttons = screen.getAllByRole("button", { name: /Delete material/i })
    // The last "Delete material" button is the AlertDialogAction confirm.
    fireEvent.click(buttons[buttons.length - 1])

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Cannot delete material",
        expect.objectContaining({ description: expect.stringContaining("rolls") })
      )
    )
    expect(materialTypeService.delete).not.toHaveBeenCalled()
  })
})
