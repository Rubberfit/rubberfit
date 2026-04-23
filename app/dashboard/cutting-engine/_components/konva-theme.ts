"use client"

import { useSyncExternalStore } from "react"

/**
 * Konva shape props take raw color strings, not Tailwind classes —
 * `fill-amber-100 dark:fill-amber-950` silently renders as transparent
 * on a `<Rect>`. This hook resolves the semantic palette used across
 * the cutting-engine canvas to actual hex / rgba values, and re-runs
 * when `<html class="dark">` is toggled by the theme switcher.
 *
 * Adding a new token: add to both LIGHT and DARK maps, keep the same
 * key. Consumers destructure what they need.
 */

export interface KonvaThemeTokens {
  /** Sheet background fill (what the stock sheet looks like). */
  sheetFill: string
  /** Sheet border / outline. */
  sheetStroke: string
  /** Grid line stroke over the sheet (subtle). */
  grid: string
  /** Reusable-offcut fill (amber). */
  offcutFill: string
  offcutStroke: string
  /** Scrap / waste fill (red). */
  scrapFill: string
  scrapStroke: string
  /** Part label text fill. */
  labelFill: string
  /** Part label text stroke — bold outline so labels survive on any part fill. */
  labelStroke: string
  /** Part stroke (between fill and next part). */
  partStroke: string
}

const LIGHT: KonvaThemeTokens = {
  sheetFill: "#f5f5f4", // stone-100
  sheetStroke: "#a8a29e", // stone-400
  grid: "rgba(120,113,108,0.15)",
  offcutFill: "#fef3c7", // amber-100
  offcutStroke: "#f59e0b", // amber-500
  scrapFill: "#fef2f2", // red-50
  scrapStroke: "#ef4444", // red-500
  // Tag labels are dark with a subtle white halo so they stay
  // legible against both vibrant part fills AND the light sheet
  // background when a label happens to overflow its part.
  labelFill: "#111827", // gray-900
  labelStroke: "rgba(255,255,255,0.85)",
  partStroke: "#ffffff",
}

const DARK: KonvaThemeTokens = {
  sheetFill: "#1c1917", // stone-900
  sheetStroke: "#57534e", // stone-600
  grid: "rgba(168,162,158,0.18)",
  offcutFill: "rgba(245,158,11,0.20)",
  offcutStroke: "rgba(245,158,11,0.70)",
  scrapFill: "rgba(239,68,68,0.20)",
  scrapStroke: "rgba(239,68,68,0.70)",
  labelFill: "#ffffff",
  labelStroke: "rgba(0,0,0,0.85)",
  partStroke: "#0c0a09", // stone-950 — crisp against vibrant fills on dark bg
}

/**
 * Part fills — index by specIndex mod length. Kept in sync with the
 * cut-history PDF palette so saved PDFs match the on-screen colors.
 */
export const PART_FILLS_LIGHT = [
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
]

export const PART_FILLS_DARK = [
  "#60a5fa",
  "#f87171",
  "#4ade80",
  "#fbbf24",
  "#a78bfa",
  "#f472b6",
  "#2dd4bf",
  "#fb923c",
]

/**
 * Read `<html class="dark">` and return the matching palette. Subscribes
 * to `class` attribute mutations on `<html>` so theme toggles re-render.
 * Uses `useSyncExternalStore` rather than `useEffect + setState` so the
 * initial render always reflects the current theme (no first-frame flash
 * of the wrong palette) and the React 19 `set-state-in-effect` rule
 * doesn't trip on the subscription pattern.
 */
function subscribeToHtmlClass(callback: () => void): () => void {
  if (typeof document === "undefined") return () => {}
  const obs = new MutationObserver(callback)
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  })
  return () => obs.disconnect()
}

function readIsDark(): boolean {
  if (typeof document === "undefined") return false
  return document.documentElement.classList.contains("dark")
}

export function useKonvaTheme(): KonvaThemeTokens & {
  partFills: ReadonlyArray<string>
  isDark: boolean
} {
  const isDark = useSyncExternalStore(
    subscribeToHtmlClass,
    readIsDark,
    () => false // SSR fallback — Konva is client-only anyway
  )
  const tokens = isDark ? DARK : LIGHT
  const partFills = isDark ? PART_FILLS_DARK : PART_FILLS_LIGHT
  return { ...tokens, partFills, isDark }
}
