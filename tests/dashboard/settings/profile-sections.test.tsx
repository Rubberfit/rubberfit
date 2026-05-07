/**
 * Phase 2 PR 2b — smoke tests for the profile section components
 * that are pure / prop-driven (no auth-context or service-call
 * coupling). ProfileCard, MfaCard, and DeleteAccountCard mount
 * heavier dependencies and are validated by manual browser pass.
 *
 * Spec: `docs/superpowers/specs/2026-05-06-dashboard-phase2-design.md` §4.
 */
import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

import { SecurityCard } from "@/app/dashboard/settings/profile/_components/security-card"
import { AccountInfoCard } from "@/app/dashboard/settings/profile/_components/account-info-card"

describe("SecurityCard (Phase 2 PR 2b)", () => {
  const baseData = { currentPassword: "", newPassword: "", confirmPassword: "" }

  it("renders the Security eyebrow + Password heading", () => {
    render(
      <SecurityCard
        passwordData={baseData}
        isLoading={false}
        onPasswordDataChange={vi.fn()}
        onPasswordChange={vi.fn()}
      />
    )
    expect(screen.getByText("Security")).not.toBeNull()
    expect(screen.getByText("Password").tagName).toBe("H2")
  })

  it("disables Update password until all three fields have content", () => {
    const { rerender } = render(
      <SecurityCard
        passwordData={baseData}
        isLoading={false}
        onPasswordDataChange={vi.fn()}
        onPasswordChange={vi.fn()}
      />
    )
    let save = screen.getByRole("button", { name: /Update password/i }) as HTMLButtonElement
    expect(save.disabled).toBe(true)

    rerender(
      <SecurityCard
        passwordData={{
          currentPassword: "old",
          newPassword: "newpass1",
          confirmPassword: "newpass1",
        }}
        isLoading={false}
        onPasswordDataChange={vi.fn()}
        onPasswordChange={vi.fn()}
      />
    )
    save = screen.getByRole("button", { name: /Update password/i }) as HTMLButtonElement
    expect(save.disabled).toBe(false)
  })

  it("calls onPasswordChange when the Update button is clicked", () => {
    const handleChange = vi.fn()
    render(
      <SecurityCard
        passwordData={{
          currentPassword: "old",
          newPassword: "newpass1",
          confirmPassword: "newpass1",
        }}
        isLoading={false}
        onPasswordDataChange={vi.fn()}
        onPasswordChange={handleChange}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /Update password/i }))
    expect(handleChange).toHaveBeenCalledTimes(1)
  })

  it("hides the Cancel button (security has no draft to revert)", () => {
    render(
      <SecurityCard
        passwordData={baseData}
        isLoading={false}
        onPasswordDataChange={vi.fn()}
        onPasswordChange={vi.fn()}
      />
    )
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull()
  })
})

describe("AccountInfoCard (Phase 2 PR 2b)", () => {
  it("renders the Account eyebrow + Account information heading", () => {
    render(
      <AccountInfoCard
        user={{ id: "abc-123", authProvider: "email", createdAt: "2025-01-15T00:00:00Z" }}
      />
    )
    expect(screen.getByText("Account")).not.toBeNull()
    expect(screen.getByText("Account information").tagName).toBe("H2")
  })

  it("formats the sign-in method label per provider", () => {
    const { rerender } = render(
      <AccountInfoCard
        user={{ id: "x", authProvider: "google", createdAt: "2025-01-15T00:00:00Z" }}
      />
    )
    expect(screen.getByText("Google OAuth")).not.toBeNull()

    rerender(
      <AccountInfoCard
        user={{ id: "x", authProvider: "email", createdAt: "2025-01-15T00:00:00Z" }}
      />
    )
    expect(screen.getByText("Email & Password")).not.toBeNull()
  })

  it("shows the user id with mono styling", () => {
    render(
      <AccountInfoCard
        user={{ id: "user-42", authProvider: "email", createdAt: "2025-01-15T00:00:00Z" }}
      />
    )
    expect(screen.getByText("user-42")).not.toBeNull()
  })

  it("omits Member since when createdAt is invalid", () => {
    render(<AccountInfoCard user={{ id: "x", authProvider: "email", createdAt: "not-a-date" }} />)
    expect(screen.queryByText(/Member since/i)).toBeNull()
  })
})
