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
  const React: typeof import("react") = require("react")
  type ChangeFn = (value: string) => void
  const TRIGGER = Symbol("trigger")
  const ITEM = Symbol("item")

  // Each stub function carries a `__mockType` brand symbol so the
  // tree walker can identify it without matching on identity (which
  // breaks across React.cloneElement boundaries) or component name
  // (which breaks under minification). Both the brand and the props
  // shapes live in dedicated interfaces so we don't need `as` casts
  // at any of the lookup sites.
  interface MockTagged {
    __mockType?: symbol
  }
  interface MockTriggerProps {
    "aria-label"?: string
    children?: React.ReactNode
  }
  interface MockItemProps {
    value: string
    children?: React.ReactNode
  }
  interface MockChildProps {
    children?: React.ReactNode
  }

  const SelectTrigger: React.FC<MockTriggerProps> & MockTagged = () => null
  SelectTrigger.__mockType = TRIGGER

  const SelectItem: React.FC<MockItemProps> & MockTagged = () => null
  SelectItem.__mockType = ITEM

  function brandOf(element: React.ReactElement): symbol | undefined {
    const type = element.type
    if (typeof type !== "function") return undefined
    if ("__mockType" in type && typeof type.__mockType === "symbol") {
      return type.__mockType
    }
    return undefined
  }

  function isMockItem(element: React.ReactElement): element is React.ReactElement<MockItemProps> {
    return brandOf(element) === ITEM
  }

  function isMockTrigger(
    element: React.ReactElement
  ): element is React.ReactElement<MockTriggerProps> {
    return brandOf(element) === TRIGGER
  }

  function hasChildren(element: React.ReactElement): element is React.ReactElement<MockChildProps> {
    const { props } = element
    return typeof props === "object" && props !== null && "children" in props
  }

  function collect(node: React.ReactNode, items: React.ReactElement<MockItemProps>[]): void {
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement(child)) return
      if (isMockItem(child)) {
        items.push(child)
        return
      }
      if (hasChildren(child) && child.props.children !== undefined) {
        collect(child.props.children, items)
      }
    })
  }

  function findLabel(node: React.ReactNode): string | undefined {
    let label: string | undefined
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement(child) || label !== undefined) return
      if (isMockTrigger(child)) {
        label = child.props["aria-label"]
        return
      }
      if (hasChildren(child) && child.props.children !== undefined) {
        const nested = findLabel(child.props.children)
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
      const items: React.ReactElement<MockItemProps>[] = []
      collect(children, items)
      return (
        <select
          aria-label={ariaLabel}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
        >
          {items.map((item) => (
            <option key={item.props.value} value={item.props.value}>
              {item.props.children}
            </option>
          ))}
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

  it("renders the loading status while useRole is still resolving", () => {
    // Pins the cold-load behavior: the shell stays mounted with a
    // role="status" placeholder and no protected content leaks
    // through, so a regression that flashes either the access
    // restricted fallback or the audit log mid-load fails loudly.
    useRole.mockReturnValue(roleStub({ granted: [], isAdmin: false, isLoading: true }))
    render(<AdminSecurityPage />)
    const status = screen.getByRole("status")
    expect(status.textContent ?? "").toMatch(/Loading security/i)
    expect(screen.queryByText("Access restricted")).toBeNull()
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
