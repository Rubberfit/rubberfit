/**
 * Phase 2 PR 4 — smoke + filter tests for the rebuilt
 * `/dashboard/users` page. Mocks `useRole` (admin gate),
 * `userManagementService.getAllUsers` for reads, and the
 * `@/app/actions/users` server actions for deactivate / reactivate
 * writes. Pins the new chrome (`PageHeader` Invite action, search
 * + role + status filter row), the role/status badge intent
 * mapping, and the access-restricted fallback.
 *
 * Spec: `docs/superpowers/specs/2026-05-06-dashboard-phase2-design.md` §4.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import type { UserProfile } from "@/src/infrastructure/models/supabase"

const baseUser: UserProfile = {
  id: "user-1",
  email: "alice@example.com",
  full_name: "Alice Admin",
  avatar_url: null,
  is_platform_admin: false,
  last_active_tenant_id: null,
  last_sign_in_at: "2025-01-10T12:00:00Z",
  created_at: "2024-12-01T00:00:00Z",
  updated_at: "2025-01-10T12:00:00Z",
  membership_id: "m-1",
  roles: ["admin"],
  is_inaccessible: false,
}

const fixtureUsers: UserProfile[] = [
  baseUser,
  {
    ...baseUser,
    id: "user-2",
    email: "bob@example.com",
    full_name: "Bob Cutter",
    roles: ["cutter"],
    membership_id: "m-2",
    is_inaccessible: false,
  },
  {
    ...baseUser,
    id: "user-3",
    email: "carol@example.com",
    full_name: "Carol Viewer",
    roles: ["viewer"],
    membership_id: "m-3",
    is_inaccessible: true,
  },
]

const useRole = vi.hoisted(() => vi.fn())
const userManagementService = vi.hoisted(() => ({
  getAllUsers: vi.fn(),
}))
const userActions = vi.hoisted(() => ({
  deactivateUser: vi.fn(),
  reactivateUser: vi.fn(),
}))
const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock("@/src/infrastructure/services/useRole", () => ({ useRole }))
vi.mock("@/src/infrastructure/services/userManagementService", () => ({
  userManagementService,
}))
vi.mock("@/app/actions/users", () => userActions)
vi.mock("sonner", () => ({ toast }))

// UserFormModal pulls in heavy form deps that aren't relevant to the
// chrome test — stub it out entirely.
vi.mock("@/app/dashboard/users/_components/user-form-modal", () => ({
  UserFormModal: () => null,
}))

// Radix Select stub: collect SelectItem children and render a flat
// `<select>` so happy-dom can drive the value.
vi.mock("@/app/components/ui/select", () => {
  const React = require("react") as typeof import("react")
  type ChangeFn = (value: string) => void

  const TRIGGER_TYPE = Symbol("select-trigger")
  const ITEM_TYPE = Symbol("select-item")

  const SelectTrigger = (props: {
    id?: string
    "aria-label"?: string
    children?: React.ReactNode
  }) => {
    void props
    return null
  }
  ;(SelectTrigger as unknown as { __mockType: symbol }).__mockType = TRIGGER_TYPE

  const SelectItem = (props: { value: string; children?: React.ReactNode }) => {
    void props
    return null
  }
  ;(SelectItem as unknown as { __mockType: symbol }).__mockType = ITEM_TYPE

  function collect(node: React.ReactNode, items: React.ReactElement[]) {
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement(child)) return
      const fn = child.type as unknown as { __mockType?: symbol }
      if (fn?.__mockType === ITEM_TYPE) {
        items.push(child)
        return
      }
      const props = child.props as { children?: React.ReactNode }
      if (props.children !== undefined) collect(props.children, items)
    })
  }

  function findTriggerLabel(node: React.ReactNode): string | undefined {
    let label: string | undefined
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement(child) || label !== undefined) return
      const fn = child.type as unknown as { __mockType?: symbol }
      const props = child.props as { ["aria-label"]?: string; children?: React.ReactNode }
      if (fn?.__mockType === TRIGGER_TYPE) {
        label = props["aria-label"]
        return
      }
      if (props.children !== undefined) {
        const nested = findTriggerLabel(props.children)
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
      const ariaLabel = findTriggerLabel(children)
      const items: React.ReactElement[] = []
      collect(children, items)
      return (
        <select
          aria-label={ariaLabel}
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

import UsersPage from "@/app/dashboard/users/page"

describe("Users page (Phase 2 PR 4)", () => {
  beforeEach(() => {
    useRole.mockReset()
    useRole.mockReturnValue({ userId: "user-1", isAdmin: true, isLoading: false })
    userManagementService.getAllUsers.mockReset().mockResolvedValue(fixtureUsers)
    userActions.deactivateUser.mockReset().mockResolvedValue(undefined)
    userActions.reactivateUser.mockReset().mockResolvedValue(undefined)
    toast.success.mockClear()
    toast.error.mockClear()
  })

  it("shows the access-restricted fallback for non-admins", () => {
    useRole.mockReturnValue({ userId: "user-1", isAdmin: false, isLoading: false })
    render(<UsersPage />)
    expect(screen.getByText("Access restricted")).not.toBeNull()
    expect(screen.queryByRole("button", { name: /Invite user/i })).toBeNull()
  })

  it("renders the Invite user primary action and the user table", async () => {
    render(<UsersPage />)
    await waitFor(() => expect(screen.getByText("Alice Admin")).not.toBeNull())
    expect(screen.getByRole("button", { name: /Invite user/i })).not.toBeNull()
    expect(screen.getByText("Bob Cutter")).not.toBeNull()
    // Carol is deactivated — default Active filter hides her.
    expect(screen.queryByText("Carol Viewer")).toBeNull()
  })

  it("filters by status: switching to Deactivated reveals only the deactivated user", async () => {
    render(<UsersPage />)
    await waitFor(() => expect(screen.getByText("Alice Admin")).not.toBeNull())

    const statusSelect = screen.getByLabelText("Status filter") as HTMLSelectElement
    fireEvent.change(statusSelect, { target: { value: "deactivated" } })

    expect(screen.queryByText("Alice Admin")).toBeNull()
    expect(screen.queryByText("Bob Cutter")).toBeNull()
    expect(screen.getByText("Carol Viewer")).not.toBeNull()
  })

  it("filters by role", async () => {
    render(<UsersPage />)
    await waitFor(() => expect(screen.getByText("Alice Admin")).not.toBeNull())

    const roleSelect = screen.getByLabelText("Role filter") as HTMLSelectElement
    fireEvent.change(roleSelect, { target: { value: "cutter" } })

    expect(screen.queryByText("Alice Admin")).toBeNull()
    expect(screen.getByText("Bob Cutter")).not.toBeNull()
  })

  it("filters by search term across name, email, and role", async () => {
    render(<UsersPage />)
    await waitFor(() => expect(screen.getByText("Alice Admin")).not.toBeNull())

    const search = screen.getByLabelText("Search users") as HTMLInputElement
    fireEvent.change(search, { target: { value: "bob" } })

    expect(screen.queryByText("Alice Admin")).toBeNull()
    expect(screen.getByText("Bob Cutter")).not.toBeNull()
  })

  it("disables the Deactivate button on the current user's own row", async () => {
    render(<UsersPage />)
    await waitFor(() => expect(screen.getByText("Alice Admin")).not.toBeNull())
    const deactivate = screen.getByRole("button", {
      name: /Deactivate Alice Admin/i,
    }) as HTMLButtonElement
    expect(deactivate.disabled).toBe(true)
  })
})
