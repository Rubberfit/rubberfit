/**
 * Phase 2 PR 5 — smoke + interaction tests for the new admin
 * Security & Audit surface at /dashboard/admin/security. Mocks
 * `useRole` and `sonner`; relies on the existing Radix Select
 * stub pattern. Pins:
 *   - Admin gate fallback for non-admins.
 *   - Hero metrics + role-matrix render under admin role.
 *   - Audit DataTable shows fixture rows.
 *   - Access policy save toast fires after a draft change.
 *
 * Spec: `docs/superpowers/specs/2026-05-06-dashboard-phase2-design.md` §4.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

const useRole = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

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

  it("renders the access-restricted fallback for non-admins", () => {
    useRole.mockReturnValue({ userId: "u1", isAdmin: false, isLoading: false })
    render(<AdminSecurityPage />)
    expect(screen.getByText("Access restricted")).not.toBeNull()
    expect(screen.queryByText("Security & Audit")).toBeNull()
  })

  it("renders the four hero metrics for admins", () => {
    useRole.mockReturnValue({ userId: "u1", isAdmin: true, isLoading: false })
    render(<AdminSecurityPage />)
    expect(screen.getByText("Active sessions")).not.toBeNull()
    expect(screen.getByText("MFA enrolled")).not.toBeNull()
    expect(screen.getByText("Audit events 7d")).not.toBeNull()
    expect(screen.getByText("Failed logins 24h")).not.toBeNull()
  })

  it("renders the three section eyebrows under Security & Audit", () => {
    useRole.mockReturnValue({ userId: "u1", isAdmin: true, isLoading: false })
    render(<AdminSecurityPage />)
    expect(screen.getByText("Access policy")).not.toBeNull()
    expect(screen.getByText("Roles & permissions")).not.toBeNull()
    expect(screen.getByText("Audit log")).not.toBeNull()
  })

  it("Save is disabled until the access-policy draft changes; toast fires on save", () => {
    useRole.mockReturnValue({ userId: "u1", isAdmin: true, isLoading: false })
    render(<AdminSecurityPage />)

    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement
    expect(save.disabled).toBe(true)

    const mfaSwitch = screen.getByRole("switch", {
      name: /Require multi-factor authentication/i,
    }) as HTMLButtonElement
    fireEvent.click(mfaSwitch)
    expect(save.disabled).toBe(false)

    fireEvent.click(save)
    expect(toast.success).toHaveBeenCalledWith("Access policy saved")
    expect(save.disabled).toBe(true)
  })

  it("renders audit log fixture rows with severity labels", () => {
    useRole.mockReturnValue({ userId: "u1", isAdmin: true, isLoading: false })
    render(<AdminSecurityPage />)
    // Action codes from the fixture set.
    expect(screen.getByText("policy.mfa.enabled")).not.toBeNull()
    expect(screen.getByText("auth.failed_login")).not.toBeNull()
    // Severity labels (DataTable cells).
    expect(screen.getAllByText("Policy").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Danger").length).toBeGreaterThan(0)
  })

  it("renders the read-only roles matrix headers", () => {
    useRole.mockReturnValue({ userId: "u1", isAdmin: true, isLoading: false })
    render(<AdminSecurityPage />)
    // The matrix prints uppercase role names as table headers; the
    // table renders them lowercase but with mono uppercase styling.
    // Check the (case-insensitive) presence of every role.
    ;["admin", "manager", "supervisor", "cutter", "member", "viewer"].forEach((role) => {
      expect(screen.getAllByText(role).length).toBeGreaterThan(0)
    })
  })
})
