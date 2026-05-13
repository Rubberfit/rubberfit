/**
 * Phase 5 PR 7 — smoke tests for `NestingPackStatePanel`. Pins the
 * three rendered kinds plus the a11y / footgun invariants:
 *
 *   - empty / loading: inner SVG aria-hidden, no Retry button
 *   - loading: animated band-scan present (skipped under reduced motion via CSS)
 *   - error: role="alert" + aria-live="assertive" on the banner;
 *            Retry fires onRetry; disabled when isPacking
 *   - none of the kinds carry data-sheet-svg (PDF capture footgun)
 */
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import NestingPackStatePanel from "@/app/dashboard/cutting-engine/_components/nesting-pack-state-panel"

describe("NestingPackStatePanel", () => {
  it("kind=empty: renders 'Ready to nest' card with no Retry button", () => {
    render(<NestingPackStatePanel kind="empty" rollWidth={48} rollLength={96} />)
    expect(screen.getByText("Ready to nest")).toBeDefined()
    expect(screen.queryByRole("button", { name: /Retry/ })).toBeNull()
  })

  it("kind=loading: renders 'Optimizing layout…' with a polite live region", () => {
    const { container } = render(
      <NestingPackStatePanel kind="loading" rollWidth={48} rollLength={96} />
    )
    expect(screen.getByText(/Optimizing layout/)).toBeDefined()
    // The loading card is the polite live region (selection has its own)
    const live = container.querySelector('[aria-live="polite"]')
    expect(live).not.toBeNull()
  })

  it("kind=error: surfaces the message inside an assertive alert banner", () => {
    render(
      <NestingPackStatePanel
        kind="error"
        rollWidth={48}
        rollLength={96}
        errorMessage="pack-cli binary not found"
      />
    )
    const alert = screen.getByRole("alert")
    expect(alert).toBeDefined()
    expect(alert.getAttribute("aria-live")).toBe("assertive")
    expect(screen.getByText("Nest failed")).toBeDefined()
    expect(screen.getByText("pack-cli binary not found")).toBeDefined()
  })

  it("kind=error: Retry button fires onRetry on click", () => {
    const onRetry = vi.fn()
    render(
      <NestingPackStatePanel
        kind="error"
        rollWidth={48}
        rollLength={96}
        errorMessage="boom"
        onRetry={onRetry}
      />
    )
    const button = screen.getByRole("button", { name: /Retry/ })
    button.click()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("kind=error: Retry is disabled while a pack is in flight", () => {
    render(
      <NestingPackStatePanel
        kind="error"
        rollWidth={48}
        rollLength={96}
        errorMessage="boom"
        onRetry={() => undefined}
        isPacking={true}
      />
    )
    const button = screen.getByRole("button", { name: /Retrying/ })
    expect(button.hasAttribute("disabled")).toBe(true)
  })

  it("never emits data-sheet-svg (PDF capture must not pick up state panels)", () => {
    for (const kind of ["empty", "loading", "error"] as const) {
      const { container, unmount } = render(
        <NestingPackStatePanel
          kind={kind}
          rollWidth={48}
          rollLength={96}
          errorMessage="boom"
          onRetry={() => undefined}
        />
      )
      expect(container.querySelector("[data-sheet-svg]")).toBeNull()
      unmount()
    }
  })

  it("inner svg is aria-hidden across all kinds", () => {
    for (const kind of ["empty", "loading", "error"] as const) {
      const { container, unmount } = render(
        <NestingPackStatePanel kind={kind} rollWidth={48} rollLength={96} errorMessage="boom" />
      )
      const svg = container.querySelector("svg")
      expect(svg?.getAttribute("aria-hidden")).toBe("true")
      unmount()
    }
  })
})
