/**
 * Phase 2 PR 5 — smoke + interaction tests for the new admin
 * Security & Audit surface at /dashboard/admin/security. Mocks
 * `useRole` and `sonner`; relies on the existing Radix Select
 * stub pattern. Pins:
 *   - Permission gate fallback for callers without `manageUsers`.
 *   - Hero metrics + role-matrix render once `manageUsers` is granted,
 *     including the `manageUsers && !isAdmin` divergence path.
 *   - Audit DataTable shows fixture rows.
 *   - Access policy save toast fires after a draft change.
 *
 * Spec: `docs/superpowers/specs/2026-05-06-dashboard-phase2-design.md` §4.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

import type { Permission } from "@/src/application/permissions"

const useRole = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

// Build a useRole return shape that mirrors the real hook closely
// enough for the page (only `can` + `isLoading` are read), while
// letting each test pin which permissions resolve true.
function roleStub({
  granted,
  isAdmin,
  isLoading = false,
}: {
  granted: ReadonlyArray<Permission>
  isAdmin: boolean
  isLoading?: boolean
}) {
  const set = new Set<Permission>(granted)
  return {
    userId: "u1",
    isLoading,
    isAdmin,
    can: (permission: Permission) => set.has(permission),
  }
}

function asButton(element: HTMLElement): HTMLButtonElement {
  if (!(element instanceof HTMLButtonElement)) {
    throw new TypeError("Expected element to be a button")
  }
  return element
}

function asSelect(element: HTMLElement): HTMLSelectElement {
  if (!(element instanceof HTMLSelectElement)) {
    throw new TypeError("Expected element to be a select")
  }
  return element
}

vi.mock("@/src/infrastructure/services/useRole", () => ({ useRole }))
vi.mock("sonner", () => ({ toast }))

vi.mock("@/app/components/ui/select", () => {
  const React = require("react") as typeof import("react")
  type ChangeFn = (value: string) => void
  const TRIGGER = Symbol("trigger")
  const ITEM = Symbol("item")

  const SelectTrigger = (props: { "aria-label"?: string; children?: React.ReactNode }) => {
    void props
    return null
  }
  ;(SelectTrigger as unknown as { __mockType: symbol }).__mockType = TRIGGER

  const SelectItem = (props: { value: string; children?: React.ReactNode }) => {
    void props
    return null
  }
  ;(SelectItem as unknown as { __mockType: symbol }).__mockType = ITEM

  function collect(node: React.ReactNode, items: React.ReactElement[]) {
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement(child)) return
      const fn = child.type as unknown as { __mockType?: symbol }
      if (fn?.__mockType === ITEM) {
        items.push(child)
        return
      }
      const props = child.props as { children?: React.ReactNode }
      if (props.children !== undefined) collect(props.children, items)
    })
  }

  function findLabel(node: React.ReactNode): string | undefined {
    let label: string | undefined
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement(child) || label !== undefined) return
      const fn = child.type as unknown as { __mockType?: symbol }
      const props = child.props as { ["aria-label"]?: string; children?: React.ReactNode }
      if (fn?.__mockType === TRIGGER) {
        label = props["aria-label"]
        return
      }
      if (props.children !== undefined) {
        const nested = findLabel(props.children)
        if (nested !== undefined) label = nested
      }
    })
    return label
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
      const ariaLabel = findLabel(children)
      const items: React.ReactElement[] = []
      collect(children, items)
      return (
        <select
          aria-label={ariaLabel}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
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

import AdminSecurityPage from "@/app/dashboard/admin/security/page"

describe("Admin Security & Audit page (Phase 2 PR 5)", () => {
  beforeEach(() => {
    useRole.mockReset()
    toast.success.mockClear()
    toast.error.mockClear()
  })

  it("renders the access-restricted fallback when manageUsers is denied", () => {
    useRole.mockReturnValue(roleStub({ granted: [], isAdmin: false }))
    render(<AdminSecurityPage />)
    expect(screen.getByText("Access restricted")).not.toBeNull()
    expect(screen.queryByText("Security & Audit")).toBeNull()
  })

  it("renders content for non-admins who hold manageUsers (gate divergence)", () => {
    // Pins the gate to the declared `ROUTE_PERMISSIONS` permission so
    // a future broadening of `manageUsers` keeps the page and sidebar
    // in lockstep instead of silently 403'ing on `isAdmin`.
    useRole.mockReturnValue(roleStub({ granted: ["manageUsers"], isAdmin: false }))
    render(<AdminSecurityPage />)
    expect(screen.getByText("Security & Audit")).not.toBeNull()
    expect(screen.getByText("Active sessions")).not.toBeNull()
  })

  it("renders the four hero metrics when manageUsers is granted", () => {
    useRole.mockReturnValue(roleStub({ granted: ["manageUsers"], isAdmin: true }))
    render(<AdminSecurityPage />)
    expect(screen.getByText("Active sessions")).not.toBeNull()
    expect(screen.getByText("MFA enrolled")).not.toBeNull()
    expect(screen.getByText("Audit events 7d")).not.toBeNull()
    expect(screen.getByText("Failed logins 24h")).not.toBeNull()
  })

  it("renders the three section eyebrows under Security & Audit", () => {
    useRole.mockReturnValue(roleStub({ granted: ["manageUsers"], isAdmin: true }))
    render(<AdminSecurityPage />)
    expect(screen.getByText("Access policy")).not.toBeNull()
    expect(screen.getByText("Roles & permissions")).not.toBeNull()
    expect(screen.getByText("Audit log")).not.toBeNull()
  })

  it("Save is disabled until the MFA switch flips; toast fires on save", () => {
    useRole.mockReturnValue(roleStub({ granted: ["manageUsers"], isAdmin: true }))
    render(<AdminSecurityPage />)

    const save = asButton(screen.getByRole("button", { name: "Save" }))
    expect(save.disabled).toBe(true)

    const mfaSwitch = asButton(
      screen.getByRole("switch", { name: /Require multi-factor authentication/i })
    )
    fireEvent.click(mfaSwitch)
    expect(save.disabled).toBe(false)

    fireEvent.click(save)
    expect(toast.success).toHaveBeenCalledWith("Access policy saved")
    expect(save.disabled).toBe(true)
  })

  it("changing the session-timeout select also enables Save and fires the toast", () => {
    // Mirrors the MFA case, but exercises the second `isDirty` branch
    // (`sessionTimeoutHours` change) so a regression in the
    // onValueChange wiring or the comparison can't slip through.
    useRole.mockReturnValue(roleStub({ granted: ["manageUsers"], isAdmin: true }))
    render(<AdminSecurityPage />)

    const save = asButton(screen.getByRole("button", { name: "Save" }))
    expect(save.disabled).toBe(true)

    const timeout = asSelect(screen.getByRole("combobox", { name: /Session timeout/i }))
    expect(timeout.value).toBe("8")
    fireEvent.change(timeout, { target: { value: "24" } })
    expect(save.disabled).toBe(false)

    fireEvent.click(save)
    expect(toast.success).toHaveBeenCalledWith("Access policy saved")
    expect(save.disabled).toBe(true)
  })

  it("renders audit log fixture rows with severity labels", () => {
    useRole.mockReturnValue(roleStub({ granted: ["manageUsers"], isAdmin: true }))
    render(<AdminSecurityPage />)
    // Action codes from the fixture set.
    expect(screen.getByText("policy.mfa.enabled")).not.toBeNull()
    expect(screen.getByText("auth.failed_login")).not.toBeNull()
    // Severity labels (DataTable cells).
    expect(screen.getAllByText("Policy").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Danger").length).toBeGreaterThan(0)
  })

  it("renders the read-only roles matrix headers", () => {
    useRole.mockReturnValue(roleStub({ granted: ["manageUsers"], isAdmin: true }))
    render(<AdminSecurityPage />)
    // Anchor the assertion to <th> column headers so a broken header
    // row can't slip through on stray body-text matches.
    ;["admin", "manager", "supervisor", "cutter", "member", "viewer"].forEach((role) => {
      expect(
        screen.getByRole("columnheader", {
          name: new RegExp(`^${role}$`, "i"),
        })
      ).not.toBeNull()
    })
  })
})
