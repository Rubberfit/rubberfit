// Cut Legend — collapsible tag → dimension-label table that sits above
// the per-sheet SVGs in NestingVizSimpleMode. Mirrors Rubberfit's
// `Legend` component verbatim so on-screen, PDF, and reusable-offcut
// surfaces all use the same color-hashed tag pills + dimension labels.
//
// Sourced directly from `LayoutModel[]` (not `PreviewItem[]`) so the
// descriptor reflects the part's *dimensions* — uploaded parts have
// no human partNumber and falling through to shapeId/specIndex would
// leak internal IDs into the legend. Showing dimensions matches the
// Reusable Offcuts card and the upload-review dialog and is the most
// useful identifier for an operator picking parts off the layout.

"use client"

import { useState } from "react"
import type { LayoutModel, PlacedPart } from "./layout-model"
import { useOrganizationPreferences } from "@/app/dashboard/_components/organization-preferences-provider"
import {
  formatDimensionsInches,
  formatLengthInches,
  type UnitDisplayPreferencesInput,
} from "@/src/application/preferences/user-unit-display"

export function CutLegend({ layouts }: { layouts: LayoutModel[] }) {
  const organizationPreferences = useOrganizationPreferences()
  // Distinct (tag, descriptor) pairs across all sheets. Tag is
  // `part.label`, which the Rust pipeline echoes from `Part.tag`.
  const seen = new Map<string, string>()
  for (const layout of layouts) {
    for (const part of layout.parts) {
      const key = part.label
      if (!key) continue
      if (!seen.has(key)) {
        seen.set(key, partDimensionLabel(part, organizationPreferences))
      }
    }
  }
  // Hooks must be unconditional, so the empty-list short-circuit lives
  // below the state hook.
  const [open, setOpen] = useState(true)
  if (seen.size === 0) return null
  // Sort by tag length first, then alphabetical, so A..Z come before
  // AA..ZZ instead of "A, AA, AB, ..., AZ, B" — matches the order
  // the auto-tagger generates them.
  const entries = [...seen.entries()].sort(
    (a, b) => a[0].length - b[0].length || a[0].localeCompare(b[0])
  )
  return (
    <div className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left font-medium hover:bg-muted/60"
        aria-expanded={open}
      >
        <ChevronGlyph open={open} />
        <span>Cut Legend</span>
        <span className="text-muted-foreground/70">
          ({entries.length} {entries.length === 1 ? "tag" : "tags"})
        </span>
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 px-4 pb-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {entries.map(([tag, label]) => (
            <div key={tag} className="flex items-center gap-2 overflow-hidden">
              <span
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] font-bold leading-none shadow-sm"
                style={tagPillStyle(tag)}
              >
                {tag}
              </span>
              <span className="truncate text-foreground" title={label}>
                {label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ChevronGlyph({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden="true"
      className={`shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
    >
      <path d="M3 1 L7 5 L3 9" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

/**
 * Human-readable dimension label for a placed part. Mirrors the
 * label format the upload-review dialog and the preset template grid
 * use (width × length for rects, Ø for circles, top/bottom for
 * trapezoids, etc.). Falls back to the placement bbox when the
 * shape-specific fields aren't populated.
 *
 * Pure builder: takes optional `unitPreferences` and routes through
 * the user-unit-display helpers so `Cut Legend` rows speak the
 * operator's unit system. Arc degrees stay unit-agnostic.
 */
export function partDimensionLabel(
  part: PlacedPart,
  unitPreferences?: UnitDisplayPreferencesInput
): string {
  switch (part.renderShape) {
    case "circle":
      if (part.diameter != null && part.diameter > 0) {
        return `Ø${formatLengthInches(part.diameter, unitPreferences)}`
      }
      break
    case "trapezoid":
      if (part.topWidth != null && part.bottomWidth != null) {
        // Trapezoid label preserves the slashed `top/bottom × height`
        // shape rather than passing through the generic dimensions
        // helper — the slash is intentional and means "two parallel
        // edges", not a paired axis.
        const top = formatLengthInches(part.topWidth, unitPreferences)
        const bottom = formatLengthInches(part.bottomWidth, unitPreferences)
        const h = formatLengthInches(part.height, unitPreferences)
        return `${top}/${bottom} × ${h}`
      }
      break
    case "sector":
      if (part.innerRadius != null && part.outerRadius != null && part.arcDegrees != null) {
        const inner = formatLengthInches(part.innerRadius, unitPreferences)
        const outer = formatLengthInches(part.outerRadius, unitPreferences)
        // Arc degrees are unitless — render with at most 1 decimal,
        // strip trailing zero. No unit conversion.
        const arc = Number.isInteger(part.arcDegrees)
          ? String(part.arcDegrees)
          : part.arcDegrees.toFixed(1).replace(/\.0$/, "")
        return `Cone R${inner}-R${outer} · ${arc}°`
      }
      break
  }
  return formatDimensionsInches([part.width, part.height], unitPreferences)
}

const TAG_PILL_COLORS: Array<{ backgroundColor: string; borderColor: string; color: string }> = [
  { backgroundColor: "#2563eb", borderColor: "#1d4ed8", color: "#ffffff" },
  { backgroundColor: "#059669", borderColor: "#047857", color: "#ffffff" },
  { backgroundColor: "#7c3aed", borderColor: "#6d28d9", color: "#ffffff" },
  { backgroundColor: "#be123c", borderColor: "#9f1239", color: "#ffffff" },
  { backgroundColor: "#0f766e", borderColor: "#115e59", color: "#ffffff" },
  { backgroundColor: "#c2410c", borderColor: "#9a3412", color: "#ffffff" },
  { backgroundColor: "#4f46e5", borderColor: "#4338ca", color: "#ffffff" },
  { backgroundColor: "#a21caf", borderColor: "#86198f", color: "#ffffff" },
  { backgroundColor: "#0369a1", borderColor: "#075985", color: "#ffffff" },
  { backgroundColor: "#4d7c0f", borderColor: "#3f6212", color: "#ffffff" },
]

export function tagPillStyle(tag: string) {
  let hash = 0
  for (let i = 0; i < tag.length; i += 1) {
    hash = (hash * 31 + tag.charCodeAt(i)) >>> 0
  }
  return TAG_PILL_COLORS[hash % TAG_PILL_COLORS.length]
}
