/**
 * Smoke test for the AddGasketSheet (PR C Commit 5).
 *
 * Pins:
 *   - Renders four tabs: Ring / Full-face / Obround / Import CAD.
 *   - Ring tab: empty fields → "Add to queue" disabled.
 *   - Ring tab: valid OD + ID → "Add to queue" enabled → onAdd fires
 *     with a `kind: "ring"` GasketSpec carrying outerDiameter +
 *     innerDiameter (the canonical contract from gasket-template.ts).
 *   - Ring tab: ID ≥ OD → "Add to queue" stays disabled.
 *
 * Mocks `GasketPreviewSvg` to keep SVG paths out of happy-dom on
 * a smoke test — its own correctness is exercised separately.
 *
 * Skipping the Import CAD tab-switch interaction here — Radix Tabs +
 * happy-dom is flaky on controlled-value-driven tab switches; that
 * path gets manual smoke-tested in browser per the executing-plans
 * checklist and gets full wiring in Commit 6.
 */
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import { AddGasketSheet } from "@/app/dashboard/cutting-engine/_components/add-gasket-sheet"

vi.mock("@/app/dashboard/cutting-engine/_components/gasket-preview-svg", () => ({
  GasketPreviewSvg: () => <div data-testid="preview-stub" />,
}))

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  onAdd: vi.fn(),
  onImportDxf: vi.fn(),
  onImportSvg: vi.fn(),
}

describe("<AddGasketSheet>", () => {
  it("renders all four tab triggers", () => {
    render(<AddGasketSheet {...baseProps} />)
    expect(screen.getByRole("tab", { name: /^Ring$/i })).toBeTruthy()
    expect(screen.getByRole("tab", { name: /Full-face/i })).toBeTruthy()
    expect(screen.getByRole("tab", { name: /Obround/i })).toBeTruthy()
    expect(screen.getByRole("tab", { name: /Import CAD/i })).toBeTruthy()
  })

  it("'Add to queue' is disabled until ring fields are valid", () => {
    render(<AddGasketSheet {...baseProps} />)
    const submit = screen.getByRole("button", { name: /Add to queue/i })
    if (!(submit instanceof HTMLButtonElement)) throw new Error("Add to queue is not a button")
    expect(submit.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText(/Outer diameter \(OD\)/i), {
      target: { value: "12" },
    })
    fireEvent.change(screen.getByLabelText(/Inner diameter \(ID\)/i), {
      target: { value: "8" },
    })
    expect(submit.disabled).toBe(false)
  })

  it("ID >= OD keeps the submit button disabled", () => {
    render(<AddGasketSheet {...baseProps} />)
    fireEvent.change(screen.getByLabelText(/Outer diameter \(OD\)/i), {
      target: { value: "8" },
    })
    fireEvent.change(screen.getByLabelText(/Inner diameter \(ID\)/i), {
      target: { value: "8" },
    })
    const submit = screen.getByRole("button", { name: /Add to queue/i })
    if (!(submit instanceof HTMLButtonElement)) throw new Error("Add to queue is not a button")
    expect(submit.disabled).toBe(true)
  })

  it("submits a kind:'ring' GasketSpec with operator quantity", () => {
    const onAdd = vi.fn()
    const onOpenChange = vi.fn()
    render(<AddGasketSheet {...baseProps} onAdd={onAdd} onOpenChange={onOpenChange} />)

    fireEvent.change(screen.getByLabelText(/Outer diameter \(OD\)/i), {
      target: { value: "12" },
    })
    fireEvent.change(screen.getByLabelText(/Inner diameter \(ID\)/i), {
      target: { value: "8" },
    })
    fireEvent.change(screen.getByLabelText(/Quantity/i), { target: { value: "3" } })
    fireEvent.click(screen.getByRole("button", { name: /Add to queue/i }))

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "ring", outerDiameter: 12, innerDiameter: 8 }),
      3,
      undefined
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
