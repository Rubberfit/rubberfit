// Card #5 on the AutoNest page. Renders every reusable offcut from the
// pack as its own scaled tile so operators can see the leftover stock
// inventory at a glance, with a tag legend at the top mirroring the
// Graph card's part legend.

"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import type { LayoutModel } from "./layout-model"
import { buildTaggedReusableOffcuts } from "./reusable-offcut-tags"
import { useOrganizationPreferences } from "@/app/dashboard/_components/organization-preferences-provider"
import {
  formatAreaSqft,
  formatDimensionsInches,
  type UnitDisplayPreferencesInput,
} from "@/src/application/preferences/user-unit-display"

const AMBER_BG = "#fef3c7"
const AMBER_LINE = "rgba(245, 158, 11, 0.55)"
const AMBER_OUTLINE = "rgba(245, 158, 11, 0.85)"
const TILE_MAX_PX = 140

export function ReusableOffcutsCard({ layouts }: { layouts: LayoutModel[] }) {
  const organizationPreferences = useOrganizationPreferences()
  const tagged = useMemo(() => buildTaggedReusableOffcuts(layouts), [layouts])
  const [legendOpen, setLegendOpen] = useState(true)
  if (tagged.length === 0) return null

  return (
    <Card className="border border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-amber-500/40 bg-amber-500/10 text-[10px] font-bold leading-none text-amber-700">
            R
          </span>
          5. Reusable Offcuts
        </CardTitle>
        <CardDescription>
          Leftover stock pieces from the pack, ranked largest first. Tags here are independent of
          part tags above.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-border bg-muted/30 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => setLegendOpen((v) => !v)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium hover:bg-muted/60"
            aria-expanded={legendOpen}
          >
            <ChevronGlyph open={legendOpen} />
            <span>Offcut Legend</span>
            <span className="text-muted-foreground/70">
              ({tagged.length} {tagged.length === 1 ? "offcut" : "offcuts"})
            </span>
          </button>
          {legendOpen && (
            <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 px-3 pb-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {tagged.map((t) => (
                <div key={t.tag} className="flex items-center gap-1.5 overflow-hidden">
                  <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded border border-amber-500/40 bg-amber-500/10 px-1 text-[10px] font-bold leading-none text-amber-700">
                    {t.tag}
                  </span>
                  <span className="truncate text-foreground tabular-nums">
                    {formatDimensionsInches(
                      [t.region.width, t.region.height],
                      organizationPreferences
                    )}
                  </span>
                  <span>·</span>
                  <span className="shrink-0 tabular-nums">
                    {formatAreaSqft(t.areaSqFt, organizationPreferences, { precision: 2 })}
                  </span>
                  <span>·</span>
                  <span className="shrink-0">from Sheet {t.sourceSheetNumber}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-4">
          {tagged.map((t) => (
            <OffcutTile
              key={t.tag}
              tag={t.tag}
              widthIn={t.region.width}
              heightIn={t.region.height}
              areaSqFt={t.areaSqFt}
              sourceSheetNumber={t.sourceSheetNumber}
              unitPreferences={organizationPreferences}
            />
          ))}
        </div>
      </CardContent>
    </Card>
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

function OffcutTile({
  tag,
  widthIn,
  heightIn,
  areaSqFt,
  sourceSheetNumber,
  unitPreferences,
}: {
  tag: string
  widthIn: number
  heightIn: number
  areaSqFt: number
  sourceSheetNumber: number
  unitPreferences?: UnitDisplayPreferencesInput
}) {
  const scale = TILE_MAX_PX / Math.max(widthIn, heightIn, 0.0001)
  const w = Math.max(8, widthIn * scale)
  const h = Math.max(8, heightIn * scale)
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <div
        className="relative flex items-end justify-center"
        style={{
          width: TILE_MAX_PX,
          height: TILE_MAX_PX,
        }}
      >
        <svg width={w} height={h} className="block">
          <defs>
            <pattern
              id={`offcut-tile-${tag}`}
              width="10"
              height="10"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="10" height="10" fill={AMBER_BG} />
              <line x1="0" y1="0" x2="0" y2="10" stroke={AMBER_LINE} strokeWidth="1.5" />
            </pattern>
          </defs>
          <rect
            x="0.75"
            y="0.75"
            width={w - 1.5}
            height={h - 1.5}
            fill={`url(#offcut-tile-${tag})`}
            stroke={AMBER_OUTLINE}
            strokeWidth="1.5"
            strokeDasharray="6 4"
          />
          <text
            x={w / 2}
            y={h / 2 + 4}
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill="#92400e"
          >
            {tag}
          </text>
        </svg>
      </div>
      <span className="text-xs font-medium text-foreground tabular-nums">
        {formatDimensionsInches([widthIn, heightIn], unitPreferences)}
      </span>
      <span className="text-[11px] text-muted-foreground tabular-nums">
        {formatAreaSqft(areaSqFt, unitPreferences, { precision: 2 })} · Sheet {sourceSheetNumber}
      </span>
    </div>
  )
}
