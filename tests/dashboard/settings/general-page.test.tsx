/**
 * Smoke + interaction tests for the Phase 2 General settings page.
 * Spec: `docs/superpowers/specs/2026-05-06-dashboard-phase2-design.md` §4.
 *
 * What this pins:
 *   - All three sections render (Organization / Regional / Operations)
 *     with the expected mono-uppercase eyebrow language.
 *   - Per-section Save buttons start disabled (no dirty changes).
 *   - Editing a field flips its section's Save button to enabled.
 *   - Cancel reverts the draft back to the saved baseline → Save
 *     re-disables.
 *   - Sonner toast confirmation fires on save.
 *
 * Uses plain Vitest assertions (project doesn't pull in jest-dom).
 * Radix Select is stubbed to a plain `<select>` so happy-dom's
 * pointer-events gating doesn't block the queries.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

const toastSuccess = vi.hoisted(() => vi.fn())
vi.mock("sonner", () => ({ toast: { success: toastSuccess } }))

// Radix Select renders into a portal and gates content on pointer
// events; happy-dom doesn't drive the popover open/close cleanly.
// Stub to a plain native `<select>` so the controlled `value` and
// `onValueChange` paths still flow. The mock walks `<Select>`'s
// children to collect every `<SelectItem>` (regardless of nesting
// inside `<SelectContent>`) and renders them as `<option>` children
// of a single `<select>` carrying the trigger's id.
vi.mock("@/app/components/ui/select", () => {
  const React = require("react") as typeof import("react")
  type ChangeFn = (value: string) => void

  const TRIGGER_TYPE = Symbol("select-trigger")
  const ITEM_TYPE = Symbol("select-item")

  const SelectTrigger = (props: { id?: string; children?: React.ReactNode }) => {
    void props
    return null
  }
  ;(SelectTrigger as unknown as { __mockType: symbol }).__mockType = TRIGGER_TYPE

  const SelectItem = (props: { value: string; children?: React.ReactNode }) => {
    void props
    return null
  }
  ;(SelectItem as unknown as { __mockType: symbol }).__mockType = ITEM_TYPE

  function collectItems(node: React.ReactNode, items: React.ReactElement[]) {
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement(child)) return
      const fn = child.type as unknown as { __mockType?: symbol }
      if (fn?.__mockType === ITEM_TYPE) {
        items.push(child)
        return
      }
      const props = child.props as { children?: React.ReactNode }
      if (props.children !== undefined) collectItems(props.children, items)
    })
  }

  function findTriggerId(node: React.ReactNode): string | undefined {
    let id: string | undefined
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement(child) || id !== undefined) return
      const fn = child.type as unknown as { __mockType?: symbol }
      const props = child.props as { id?: string; children?: React.ReactNode }
      if (fn?.__mockType === TRIGGER_TYPE) {
        id = props.id
        return
      }
      if (props.children !== undefined) {
        const nested = findTriggerId(props.children)
        if (nested !== undefined) id = nested
      }
    })
    return id
  }

  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value: string
      onValueChange: ChangeFn
      children: React.ReactNode
    }) => {
      const triggerId = findTriggerId(children)
      const items: React.ReactElement[] = []
      collectItems(children, items)
      return (
        <select
          id={triggerId}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          data-slot="select-mock"
        >
          {items.map((item) => {
            const itemProps = item.props as { value: string; children?: React.ReactNode }
            return (
              <option key={itemProps.value} value={itemProps.value}>
                {itemProps.children}
              </option>
            )
          })}
        </select>
      )
    },
    SelectTrigger,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectItem,
  }
})

import GeneralSettingsPage from "@/app/dashboard/settings/general/page"

describe("General settings page (Phase 2)", () => {
  beforeEach(() => {
    toastSuccess.mockClear()
  })

  it("renders the three section eyebrows", () => {
    render(<GeneralSettingsPage />)
    expect(screen.getByText("Organization")).not.toBeNull()
    expect(screen.getByText("Regional")).not.toBeNull()
    expect(screen.getByText("Operations")).not.toBeNull()
  })

  it("starts with all Save buttons disabled and three of them visible", () => {
    render(<GeneralSettingsPage />)
    const saves = screen.getAllByRole("button", { name: "Save" }) as HTMLButtonElement[]
    expect(saves.length).toBe(3)
    saves.forEach((btn) => expect(btn.disabled).toBe(true))
  })

  it("enables only the relevant section's Save when its field is edited", () => {
    render(<GeneralSettingsPage />)
    const companyName = screen.getByLabelText(/Company name/i) as HTMLInputElement
    fireEvent.change(companyName, { target: { value: "Acme Cuts" } })

    const saves = screen.getAllByRole("button", { name: "Save" }) as HTMLButtonElement[]
    // Section order is Organization → Regional → Operations; only the
    // Organization Save (index 0) should now be enabled.
    expect(saves[0].disabled).toBe(false)
    expect(saves[1].disabled).toBe(true)
    expect(saves[2].disabled).toBe(true)
  })

  it("Cancel reverts the dirty draft to the saved baseline", () => {
    render(<GeneralSettingsPage />)
    const companyName = screen.getByLabelText(/Company name/i) as HTMLInputElement
    fireEvent.change(companyName, { target: { value: "Acme Cuts" } })
    expect(companyName.value).toBe("Acme Cuts")

    const cancels = screen.getAllByRole("button", { name: "Cancel" }) as HTMLButtonElement[]
    fireEvent.click(cancels[0])
    expect(companyName.value).toBe("Arc & Anchor")

    const saves = screen.getAllByRole("button", { name: "Save" }) as HTMLButtonElement[]
    expect(saves[0].disabled).toBe(true)
  })

  it("fires the Sonner toast on save and renders the saved hint", () => {
    render(<GeneralSettingsPage />)
    const companyName = screen.getByLabelText(/Company name/i) as HTMLInputElement
    fireEvent.change(companyName, { target: { value: "Acme Cuts" } })

    const saves = screen.getAllByRole("button", { name: "Save" }) as HTMLButtonElement[]
    fireEvent.click(saves[0])

    expect(toastSuccess).toHaveBeenCalledWith("Organization settings saved")
    expect(saves[0].disabled).toBe(true)
    expect(screen.getByText(/Saved just now/i)).not.toBeNull()
  })

  it("Save stays disabled when required Company name is whitespace-only", () => {
    render(<GeneralSettingsPage />)
    const companyName = screen.getByLabelText(/Company name/i) as HTMLInputElement
    fireEvent.change(companyName, { target: { value: "   " } })

    const saves = screen.getAllByRole("button", { name: "Save" }) as HTMLButtonElement[]
    expect(saves[0].disabled).toBe(true)
  })

  it("low-stock helper text follows the selected unit system", () => {
    render(<GeneralSettingsPage />)
    expect(screen.getByText(/Default alert level for new materials, in sq ft/i)).not.toBeNull()

    const unitSelect = screen.getByLabelText(/Default unit system/i) as HTMLSelectElement
    fireEvent.change(unitSelect, { target: { value: "metric" } })
    expect(screen.getByText(/Default alert level for new materials, in m²/i)).not.toBeNull()
  })

  it("each section has its own Save handler — saving Organization does not touch Regional", () => {
    render(<GeneralSettingsPage />)
    const companyName = screen.getByLabelText(/Company name/i) as HTMLInputElement
    fireEvent.change(companyName, { target: { value: "Acme Cuts" } })

    const saves = screen.getAllByRole("button", { name: "Save" }) as HTMLButtonElement[]
    fireEvent.click(saves[0])

    expect(toastSuccess).toHaveBeenCalledTimes(1)
    expect(toastSuccess).toHaveBeenCalledWith("Organization settings saved")
  })

  it("required marker appears on Company name", () => {
    render(<GeneralSettingsPage />)
    const orgLabel = screen.getByText("Company name").closest("label")
    expect(orgLabel?.querySelector("span[aria-hidden='true']")?.textContent).toBe("*")
  })
})
