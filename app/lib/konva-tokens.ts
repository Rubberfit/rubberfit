/**
 * CSS-var → Konva colour resolver (S5 A0.3).
 *
 * Konva draws into a canvas2D context. CSS variables are not valid
 * canvas colour inputs — the canvas spec requires resolved values
 * (`oklch(…)`, `rgb(…)`, `#hex`). That means Konva components can't
 * just write `fill="var(--color-accent-bg)"` the way CSS can.
 *
 * This module is the one place that bridges the gap:
 *   • `resolveToken(name)` reads `getComputedStyle` on
 *     `document.documentElement` and returns the resolved string.
 *   • A cache keeps us off the style engine on hot re-renders.
 *   • A single `MutationObserver` on `<html>` invalidates the cache
 *     whenever the `class` (dark mode) or `data-accent` attribute
 *     flips, and fires subscribers so Konva consumers redraw.
 *
 * Non-goals:
 *   • Parsing colours or converting between formats — canvas2D
 *     accepts oklch() natively (Chrome 111+, Safari 15.4+,
 *     Firefox 113+).
 *   • Reading tokens from arbitrary elements — tenant scoping
 *     (`<html data-tenant="…">`) is the other use case and will
 *     pass through the same root observer without changes.
 *
 * Server-safe: all DOM access is guarded so this module is
 * import-safe in RSC layouts and during test collection.
 */

type TokenName = `--${string}`

type Unsubscribe = () => void

const FALLBACK = "#000000"
const cache = new Map<TokenName, string>()
const subscribers = new Set<() => void>()

let observer: MutationObserver | null = null
let observerMounted = false

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined"
}

function readFromDom(name: TokenName): string {
  if (!isBrowser()) return FALLBACK
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  // Some browsers return "" for unknown vars. Fall back so Konva
  // renders SOMETHING rather than throwing when a consumer requests
  // a token that hasn't been added yet.
  return value || FALLBACK
}

function invalidate(): void {
  cache.clear()
  subscribers.forEach((cb) => {
    try {
      cb()
    } catch (error) {
      // Subscriber threw — don't let it take down siblings. Log so
      // it's debuggable but keep the rest of the chain firing.
      console.error("[konva-tokens] subscriber threw:", error)
    }
  })
}

function mountObserver(): void {
  if (observerMounted || !isBrowser()) return
  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (
        m.type === "attributes" &&
        (m.attributeName === "class" || m.attributeName === "data-accent")
      ) {
        invalidate()
        return
      }
    }
  })
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-accent"],
  })
  observerMounted = true
}

/**
 * Resolve a design-token variable to a canvas-ready colour string.
 * Safe to call from any Konva component on every render — the
 * cache keeps the getComputedStyle hit to once per token per theme
 * generation.
 */
export function resolveToken(name: TokenName): string {
  const cached = cache.get(name)
  if (cached !== undefined) return cached
  const resolved = readFromDom(name)
  cache.set(name, resolved)
  return resolved
}

/**
 * Register a callback that fires whenever the resolved token set
 * may have changed (theme flip, accent swap, tenant override).
 * Consumers typically call `stage.batchDraw()` from here.
 *
 * Returns an unsubscribe function. Cheap: observer mounts on
 * first subscriber and stays mounted for the session (no teardown
 * on last subscriber — the cost is one MutationObserver).
 */
export function subscribeToTokenChanges(cb: () => void): Unsubscribe {
  // SSR: no DOM → no MutationObserver → no invalidation events
  // would ever reach the callback. Return a no-op unsubscribe
  // instead of silently registering a subscriber that never fires.
  if (!isBrowser()) return () => {}
  mountObserver()
  subscribers.add(cb)
  return () => {
    subscribers.delete(cb)
  }
}

/**
 * Escape hatch — clears the cache manually. Test helper only; not
 * needed in app code because the MutationObserver handles all
 * real-world invalidation.
 */
export function __resetTokenCacheForTests(): void {
  cache.clear()
}
