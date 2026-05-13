/**
 * Phase 2 PR 3 — smoke + interaction tests for the rebuilt
 * Notifications page. Pins three sections, per-section dirty
 * state + Sonner toast firing, and the disabled-with-Coming-soon
 * affordance for Push and SMS channels.
 *
 * Spec: `docs/superpowers/specs/2026-05-06-dashboard-phase2-design.md` §4.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

const toastSuccess = vi.hoisted(() => vi.fn())
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: vi.fn() } }))

import NotificationSettingsPage from "@/app/dashboard/settings/notifications/page"

describe("Notifications settings page (Phase 2 PR 3)", () => {
  beforeEach(() => {
    toastSuccess.mockClear()
  })

  it("renders the three section eyebrows", () => {
    render(<NotificationSettingsPage />)
    expect(screen.getByText("Thresholds")).not.toBeNull()
    expect(screen.getByText("Channels")).not.toBeNull()
    expect(screen.getByText("Quiet hours")).not.toBeNull()
  })

  it("starts with all Save buttons disabled", () => {
    render(<NotificationSettingsPage />)
    const saves = screen.getAllByRole("button", { name: "Save" }) as HTMLButtonElement[]
    expect(saves.length).toBe(3)
    saves.forEach((btn) => expect(btn.disabled).toBe(true))
  })

  it("enables Save when the threshold input changes", () => {
    render(<NotificationSettingsPage />)
    const input = screen.getByLabelText(/Low-stock threshold/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: "250" } })

    const saves = screen.getAllByRole("button", { name: "Save" }) as HTMLButtonElement[]
    expect(saves[0].disabled).toBe(false)
    expect(saves[1].disabled).toBe(true)
    expect(saves[2].disabled).toBe(true)
  })

  it("fires the Sonner toast when the Thresholds section saves", () => {
    render(<NotificationSettingsPage />)
    const input = screen.getByLabelText(/Low-stock threshold/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: "250" } })

    const saves = screen.getAllByRole("button", { name: "Save" }) as HTMLButtonElement[]
    fireEvent.click(saves[0])
    expect(toastSuccess).toHaveBeenCalledWith("Thresholds saved")
  })

  it("renders Push and SMS as disabled switches with Coming soon labels", () => {
    render(<NotificationSettingsPage />)
    const switches = screen.getAllByRole("switch")
    // 4 channel switches + 1 quiet-hours-enable switch = 5 switches.
    expect(switches.length).toBe(5)

    // Push (idx 2) and SMS (idx 3) are disabled.
    expect((switches[2] as HTMLButtonElement).disabled).toBe(true)
    expect((switches[3] as HTMLButtonElement).disabled).toBe(true)

    // Mono-uppercase Coming soon labels appear twice — once next to each
    // disabled channel name. The wider description copy also mentions
    // "coming soon" so this query targets the badge spans only.
    const badges = screen.getAllByText("Coming soon")
    expect(badges.length).toBe(2)
    badges.forEach((node) => expect(node.tagName).toBe("SPAN"))
  })

  it("Cancel reverts a dirty Channels section", () => {
    render(<NotificationSettingsPage />)
    const switches = screen.getAllByRole("switch") as HTMLButtonElement[]
    const inAppSwitch = switches[0]
    expect(inAppSwitch.getAttribute("data-state")).toBe("checked")

    fireEvent.click(inAppSwitch)
    expect(inAppSwitch.getAttribute("data-state")).toBe("unchecked")

    const cancels = screen.getAllByRole("button", { name: "Cancel" }) as HTMLButtonElement[]
    fireEvent.click(cancels[1])
    expect(inAppSwitch.getAttribute("data-state")).toBe("checked")

    const saves = screen.getAllByRole("button", { name: "Save" }) as HTMLButtonElement[]
    expect(saves[1].disabled).toBe(true)
  })

  it("disables quiet-hours time inputs until the toggle is enabled", () => {
    render(<NotificationSettingsPage />)
    const start = screen.getByLabelText(/Start time/i) as HTMLInputElement
    const end = screen.getByLabelText(/End time/i) as HTMLInputElement
    expect(start.disabled).toBe(true)
    expect(end.disabled).toBe(true)

    const switches = screen.getAllByRole("switch") as HTMLButtonElement[]
    const quietHoursSwitch = switches[4]
    fireEvent.click(quietHoursSwitch)

    expect(start.disabled).toBe(false)
    expect(end.disabled).toBe(false)
  })
})
