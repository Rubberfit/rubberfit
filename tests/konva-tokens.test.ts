/**
 * @vitest-environment happy-dom
 *
 * Tests for the S5 A0.3 Konva token resolver. Uses happy-dom so
 * `document.documentElement` and `getComputedStyle` exist; Konva
 * itself isn't loaded here — we're testing the CSS-var bridge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  __resetTokenCacheForTests,
  resolveToken,
  subscribeToTokenChanges,
} from "@/app/lib/konva-tokens"

function setTokens(tokens: Record<string, string>): void {
  for (const [name, value] of Object.entries(tokens)) {
    document.documentElement.style.setProperty(name, value)
  }
}

function clearTokens(names: string[]): void {
  for (const n of names) {
    document.documentElement.style.removeProperty(n)
  }
}

describe("konva-tokens", () => {
  beforeEach(() => {
    __resetTokenCacheForTests()
  })

  afterEach(() => {
    clearTokens([
      "--color-accent-bg",
      "--color-accent-border",
      "--color-text-muted",
    ])
    document.documentElement.removeAttribute("data-accent")
    document.documentElement.className = ""
  })

  it("resolves a token against documentElement", () => {
    setTokens({ "--color-accent-bg": "oklch(0.96 0.03 265)" })
    expect(resolveToken("--color-accent-bg")).toBe("oklch(0.96 0.03 265)")
  })

  it("returns a fallback when the token is undefined", () => {
    // happy-dom returns "" for unset custom properties; the resolver
    // must surface a concrete colour so canvas doesn't throw.
    expect(resolveToken("--this-does-not-exist" as `--${string}`)).toBe("#000000")
  })

  it("caches resolved values across repeat calls", () => {
    setTokens({ "--color-accent-border": "oklch(0.72 0.17 265)" })
    const first = resolveToken("--color-accent-border")
    // Mutate the underlying variable without triggering an attribute
    // change; the cache should still return the old value because
    // the observer hasn't fired an invalidation.
    setTokens({ "--color-accent-border": "oklch(0.50 0.10 100)" })
    const second = resolveToken("--color-accent-border")
    expect(second).toBe(first)
  })

  it("invalidates cache + fires subscribers when data-accent changes", async () => {
    setTokens({ "--color-accent-fg": "oklch(0.45 0.31 265)" })
    const cb = vi.fn()
    const unsubscribe = subscribeToTokenChanges(cb)

    // Prime the cache
    expect(resolveToken("--color-accent-fg")).toBe("oklch(0.45 0.31 265)")

    // Flip the attribute; the MutationObserver should fire next tick.
    document.documentElement.setAttribute("data-accent", "teal")
    setTokens({ "--color-accent-fg": "oklch(0.55 0.14 195)" })

    // MutationObserver callbacks run in a microtask; wait for them.
    await new Promise((r) => queueMicrotask(() => r(null)))

    expect(cb).toHaveBeenCalled()
    expect(resolveToken("--color-accent-fg")).toBe("oklch(0.55 0.14 195)")

    unsubscribe()
  })

  it("invalidates cache + fires subscribers when .dark class is toggled", async () => {
    setTokens({ "--color-text-muted": "oklch(0.55 0.01 285)" })
    const cb = vi.fn()
    const unsubscribe = subscribeToTokenChanges(cb)
    resolveToken("--color-text-muted") // prime

    document.documentElement.classList.add("dark")
    setTokens({ "--color-text-muted": "oklch(0.72 0.015 285)" })
    await new Promise((r) => queueMicrotask(() => r(null)))

    expect(cb).toHaveBeenCalled()
    expect(resolveToken("--color-text-muted")).toBe("oklch(0.72 0.015 285)")

    unsubscribe()
  })

  it("stops firing after unsubscribe", async () => {
    const cb = vi.fn()
    const unsub = subscribeToTokenChanges(cb)
    unsub()
    document.documentElement.setAttribute("data-accent", "red")
    await new Promise((r) => queueMicrotask(() => r(null)))
    expect(cb).not.toHaveBeenCalled()
  })

  it("isolates subscriber failures so siblings still fire", async () => {
    const failing = vi.fn(() => {
      throw new Error("boom")
    })
    const healthy = vi.fn()
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const unsub1 = subscribeToTokenChanges(failing)
    const unsub2 = subscribeToTokenChanges(healthy)

    document.documentElement.setAttribute("data-accent", "green")
    await new Promise((r) => queueMicrotask(() => r(null)))

    expect(failing).toHaveBeenCalled()
    expect(healthy).toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalled()

    errorSpy.mockRestore()
    unsub1()
    unsub2()
  })
})
