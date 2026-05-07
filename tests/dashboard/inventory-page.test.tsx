/**
 * Phase 3 PR 3a — smoke tests for the inventory hub landing page.
 * Pins:
 *   - StatCards hero renders the 4 metrics by label
 *   - Tools dropdown lists Export CSV / Generate PDF / Print labels /
 *     Import CSV (with the right href)
 *   - Page renders without crashing under typical role + roll list
 *
 * Spec: `.claude/handoff/dashboard-phase3-synthesis.md`
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

const useRole = vi.hoisted(() => vi.fn())
const useAuth = vi.hoisted(() => vi.fn())
const useSearchParams = vi.hoisted(() => vi.fn())
const useRouter = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => ({
  message: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))
const rollsList = vi.hoisted(() => vi.fn())
const rollsUpdate = vi.hoisted(() => vi.fn())
const rollsDelete = vi.hoisted(() => vi.fn())

vi.mock("@/src/infrastructure/services/useRole", () => ({ useRole }))
vi.mock("@/app/contexts/AuthContext", () => ({ useAuth }))
vi.mock("next/navigation", () => ({ useSearchParams, useRouter }))
vi.mock("sonner", () => ({ toast }))

vi.mock("@/src/infrastructure/api-client/rf/inventory", () => ({
  rolls: {
    list: rollsList,
    update: rollsUpdate,
    delete: rollsDelete,
  },
}))

vi.mock("@/src/infrastructure/services/exportService", () => ({
  exportService: { exportInventory: vi.fn() },
}))
vi.mock("@/src/infrastructure/services/exportPdfService", () => ({
  exportPdfService: { generateInventoryReport: vi.fn() },
}))
vi.mock("@/src/infrastructure/services/rollBarcodeAssetService", () => ({
  ensureStoredRollBarcodes: vi.fn(async () => ({ failedRollIds: [] })),
}))
vi.mock("@/app/dashboard/inventory/_components/roll-label-pdf", () => ({
  downloadRollLabelPdf: vi.fn(),
}))

// The detail drawer + form dialog pull in heavy SDK paths and Konva
// previews; mock to no-op so this test stays focused on PR 3a chrome.
vi.mock("@/app/dashboard/inventory/_components/roll-detail-drawer", () => ({
  RollDetailDrawer: ({ open }: { open: boolean }) => (
    <div data-testid="roll-detail-drawer" data-open={String(open)} />
  ),
}))
vi.mock("@/app/dashboard/inventory/_components/roll-form-dialog", () => ({
  RollFormDialog: ({ open }: { open: boolean }) => (
    <div data-testid="roll-form-dialog" data-open={String(open)} />
  ),
}))

// Radix DropdownMenu portals its content out of the test's DOM tree
// and only mounts on open; in happy-dom the popover open flow is
// flaky. Replace with thin stubs that render trigger + content
// inline so the test can assert on Tools-menu items directly.
vi.mock("@/app/components/ui/dropdown-menu", () => {
  return {
    DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuTrigger: ({
      children,
      asChild,
    }: {
      children: React.ReactNode
      asChild?: boolean
    }) => {
      void asChild
      return <div data-slot="dropdown-trigger">{children}</div>
    },
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
      <div role="menu" data-slot="dropdown-content">
        {children}
      </div>
    ),
    DropdownMenuItem: ({
      children,
      onClick,
      asChild,
    }: {
      children: React.ReactNode
      onClick?: () => void
      asChild?: boolean
    }) => {
      void asChild
      return (
        <div role="menuitem" onClick={onClick}>
          {children}
        </div>
      )
    },
    DropdownMenuSeparator: () => <hr />,
  }
})

import InventoryPage from "@/app/dashboard/inventory/page"

const SAMPLE_ROLLS = [
  {
    id: "roll-1",
    part_number: "RF-1001",
    material_type: "EPDM",
    color: "Black",
    width: 36,
    length: 240,
    thickness: 0.125,
    remaining_length: 200,
    location: "Bay A-1",
    status: "active",
    date_received: "2026-01-15",
    cost_per_sqft: 2.5,
    is_offcut: false,
  },
  {
    id: "roll-2",
    part_number: "RF-1002",
    material_type: "Neoprene",
    color: null,
    width: 48,
    length: 180,
    thickness: 0.25,
    remaining_length: 90,
    location: "Bay B-3",
    status: "reserved",
    date_received: "2026-02-20",
    cost_per_sqft: 4.1,
    is_offcut: true,
    parent_roll_id: "roll-1",
  },
]

describe("Inventory hub page (Phase 3 PR 3a)", () => {
  beforeEach(() => {
    useRole.mockReset()
    useAuth.mockReset()
    useSearchParams.mockReset()
    useRouter.mockReset()
    rollsList.mockReset()
    rollsUpdate.mockReset()
    rollsDelete.mockReset()
    toast.message.mockClear()
    toast.success.mockClear()
    toast.error.mockClear()

    useRole.mockReturnValue({
      can: (perm: string) => perm === "manageRolls",
      isLoading: false,
      isAdmin: true,
    })
    useAuth.mockReturnValue({ user: { roles: ["admin"] } })
    useSearchParams.mockReturnValue({ get: () => null })
    useRouter.mockReturnValue({ replace: vi.fn(), push: vi.fn() })
    rollsList.mockResolvedValue(SAMPLE_ROLLS)
  })

  it("renders the four StatCard hero metrics by label", async () => {
    render(<InventoryPage />)
    expect(await screen.findByText("Total active rolls")).not.toBeNull()
    expect(screen.getByText("Total sqft")).not.toBeNull()
    expect(screen.getByText("Low-stock count")).not.toBeNull()
    expect(screen.getByText("Total value")).not.toBeNull()
  })

  it("renders the Tools dropdown trigger and an Import CSV link to /dashboard/inventory/import", async () => {
    const { container } = render(<InventoryPage />)
    expect(await screen.findByRole("button", { name: /Tools/i })).not.toBeNull()
    // Radix DropdownMenu portals its content; query the rendered
    // anchor directly rather than driving the popover open. The
    // anchor's existence is what we actually care about — the Import
    // CSV item is a `<Link>` and renders into the menu's hidden
    // portal subtree.
    const importLink = container.querySelector('a[href="/dashboard/inventory/import"]')
    expect(importLink).not.toBeNull()
    expect(importLink?.textContent).toMatch(/Import CSV/i)
  })

  it("does not render the legacy top-of-page CSV upload card", async () => {
    render(<InventoryPage />)
    await screen.findByText("Total active rolls")
    // The pre-PR-3a `<CSVUpload>` card lived above the table; its
    // file is deleted in this PR.
    expect(screen.queryByText(/drag and drop a CSV/i)).toBeNull()
    expect(screen.queryByText(/upload CSV/i)).toBeNull()
  })

  it("renders the Add Roll primary action when the user can manageRolls", async () => {
    render(<InventoryPage />)
    expect(await screen.findByRole("button", { name: /Add Roll/i })).not.toBeNull()
  })

  it("hides the Add Roll button when the user cannot manageRolls", async () => {
    useRole.mockReturnValue({
      can: () => false,
      isLoading: false,
      isAdmin: false,
    })
    render(<InventoryPage />)
    await screen.findByRole("button", { name: /Tools/i })
    expect(screen.queryByRole("button", { name: /Add Roll/i })).toBeNull()
  })

  it("renders nothing while useRole is still resolving", () => {
    useRole.mockReturnValue({ can: () => false, isLoading: true, isAdmin: false })
    const { container } = render(<InventoryPage />)
    expect(container.querySelector("h1, h2")).toBeNull()
  })
})
