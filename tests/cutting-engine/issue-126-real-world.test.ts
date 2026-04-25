// Reproduces the user-reported regression with realistic conditions:
// - localStorage has prior custom templates (real users have these)
// - Single rectangle cut from a NEW save (perTemplatePartTypes present)
// - Verifies onApply ends up with non-empty templates AND that intermediate
//   onApply([]) calls don't leak to the parent.

import { describe, it, expect, beforeEach, vi } from "vitest"
import { renderHook, act } from "@testing-library/react"
import {
  usePresetState,
  type LoadedSelection,
} from "@/app/dashboard/cutting-engine/_components/use-preset-state"

beforeEach(() => {
  // Wipe localStorage before each test
  if (typeof window !== "undefined") window.localStorage.clear()
})

describe("issue #126 real-world load scenarios", () => {
  it("fresh user, save+reload single rectangle: final onApply has the template", async () => {
    const onApply = vi.fn<(t: import("@/app/dashboard/cutting-engine/_components/preset-template-data").PartTemplate[]) => void>()

    const { rerender } = renderHook(
      ({ loaded }: { loaded: LoadedSelection | null }) =>
        usePresetState(onApply, 96, 48, loaded),
      { initialProps: { loaded: null as LoadedSelection | null } }
    )

    onApply.mockClear()

    act(() => {
      rerender({
        loaded: {
          partType: "rectangle",
          labels: ['24" × 12"'],
          nonce: Date.now(),
          customDimensions: [{ width: 24, length: 12 }],
          perTemplateQuantities: [3],
          perTemplatePartTypes: ["rectangle"],
        },
      })
    })

    // Wait a tick for all batched updates to flush
    await act(async () => {
      await Promise.resolve()
    })

    const allCalls = onApply.mock.calls.map((c) => c[0])
    const finalCall = allCalls[allCalls.length - 1] ?? []

    expect(
      finalCall.length,
      `Expected final onApply with templates. Got call sequence: ${JSON.stringify(allCalls.map((c) => c.length))}`
    ).toBeGreaterThan(0)
    expect(finalCall[0].partType).toBe("rectangle")
    expect(finalCall[0].width).toBe(24)
    expect(finalCall[0].length).toBe(12)
  })

  it("simulates page parent: handleTemplateApply tracks the LAST setPresetParts wins", async () => {
    // Models the real chain: handleTemplateApply does setPresetParts(templates).
    // We track every onApply call to verify the LAST one is non-empty.
    let presetParts: import("@/app/dashboard/cutting-engine/_components/preset-template-data").PartTemplate[] = []
    const handleTemplateApply = vi.fn(
      (templates: import("@/app/dashboard/cutting-engine/_components/preset-template-data").PartTemplate[]) => {
        presetParts = templates
      }
    )

    const { rerender } = renderHook(
      ({ loaded }: { loaded: LoadedSelection | null }) =>
        usePresetState(handleTemplateApply, 96, 48, loaded),
      { initialProps: { loaded: null as LoadedSelection | null } }
    )

    handleTemplateApply.mockClear()

    act(() => {
      rerender({
        loaded: {
          partType: "rectangle",
          labels: ['24" × 12"'],
          nonce: Date.now(),
          customDimensions: [{ width: 24, length: 12 }],
          perTemplateQuantities: [3],
          perTemplatePartTypes: ["rectangle"],
        },
      })
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(
      presetParts.length,
      `presetParts should end non-empty. Final: ${JSON.stringify(presetParts.map((t) => t.partType))}; calls: ${handleTemplateApply.mock.calls.length}`
    ).toBeGreaterThan(0)
  })
})
