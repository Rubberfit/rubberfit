import { useState } from "react"
import { Scissors, Shapes } from "lucide-react"
import { PartTemplate } from "./preset-template-data"
import { SimpleCutDirection } from "./nesting-visualizer-types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import {
  getCutDirectionOptions,
  getCutModeDescription,
  getCutModeTitle,
  getPartLabel,
} from "./cut-planner-utils"

export function CutConfigCard({
  selectedTemplate,
  selectedTemplates,
  cutDirection,
  setCutDirection,
  requestedSqFt,
}: {
  selectedTemplate: PartTemplate
  selectedTemplates: PartTemplate[]
  cutDirection: SimpleCutDirection
  setCutDirection: (v: SimpleCutDirection) => void
  requestedSqFt: number
}) {
  const isRect = selectedTemplate.partType === "rectangle"

  return (
    <Card className="border border-slate-200 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Scissors className="h-4 w-4" />
          3. Cut Configuration
        </CardTitle>
        <CardDescription>
          The selected part template drives the profile. Review the cut details and requested
          material below.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <SelectedPartsCard selectedTemplates={selectedTemplates} />

        <div className="grid gap-4 md:grid-cols-2">
          {!isRect && (
            <CutModeCard
              partType={selectedTemplate.partType}
              cutDirection={cutDirection}
              setCutDirection={setCutDirection}
            />
          )}
          <RequestedMaterialCard
            isRect={isRect}
            requestedSqFt={requestedSqFt}
          />
        </div>
      </CardContent>
    </Card>
  )
}

// Group `selectedTemplates` by shape type so the operator gets a
// shape → sizes tree instead of two parallel tiles. Each shape row
// shows summed qty + size count; clicking expands to the per-
// template labels (and per-template qty when > 1). Replaces the
// old Part + Size Selection tile pair.
function SelectedPartsCard({ selectedTemplates }: { selectedTemplates: PartTemplate[] }) {
  const [expanded, setExpanded] = useState<Set<PartTemplate["partType"]>>(new Set())

  const groups = new Map<
    PartTemplate["partType"],
    { totalQty: number; templates: PartTemplate[] }
  >()
  for (const template of selectedTemplates) {
    const qty = Math.max(1, template.quantity ?? 1)
    const existing = groups.get(template.partType)
    if (existing) {
      existing.totalQty += qty
      existing.templates.push(template)
    } else {
      groups.set(template.partType, { totalQty: qty, templates: [template] })
    }
  }
  const groupEntries = Array.from(groups.entries())
  const totalParts = groupEntries.reduce((sum, [, g]) => sum + g.totalQty, 0)
  const totalSizes = selectedTemplates.length

  const toggle = (partType: PartTemplate["partType"]) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(partType)) next.delete(partType)
      else next.add(partType)
      return next
    })
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 dark:bg-card">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide dark:border-slate-700 dark:text-slate-400">
        <Shapes className="h-3.5 w-3.5" />
        Selected Parts
      </div>
      <ul className="divide-y divide-slate-200 dark:divide-slate-700">
        {groupEntries.map(([partType, group]) => {
          const isOpen = expanded.has(partType)
          const sizeCount = group.templates.length
          return (
            <li key={partType}>
              <button
                type="button"
                onClick={() => toggle(partType)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ChevronGlyph open={isOpen} />
                <span className="flex-1 font-semibold">{`${group.totalQty} × ${getPartLabel(partType)}`}</span>
                <span className="text-xs text-muted-foreground">
                  {sizeCount} {sizeCount === 1 ? "size" : "sizes"}
                </span>
              </button>
              {isOpen && (
                <ul className="bg-white px-4 pb-2 pt-0.5 dark:bg-slate-900/40">
                  {group.templates.map((template) => {
                    const qty = Math.max(1, template.quantity ?? 1)
                    return (
                      <li
                        key={template.id}
                        className="flex items-center gap-2 py-0.5 pl-5 text-xs"
                      >
                        <span className="flex-1 truncate font-mono">{template.label}</span>
                        {qty > 1 && (
                          <span className="text-muted-foreground tabular-nums">{`× ${qty}`}</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
      <div className="border-t border-slate-200 px-4 py-2 text-xs text-muted-foreground dark:border-slate-700">
        {`${totalParts} ${totalParts === 1 ? "part" : "parts"} · ${totalSizes} ${totalSizes === 1 ? "size" : "sizes"}`}
      </div>
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
      className={`shrink-0 text-muted-foreground transition-transform duration-150 ${open ? "rotate-90" : ""}`}
    >
      <path d="M3 1 L7 5 L3 9" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function CutModeCard({
  partType,
  cutDirection,
  setCutDirection,
}: {
  partType: PartTemplate["partType"]
  cutDirection: SimpleCutDirection
  setCutDirection: (v: SimpleCutDirection) => void
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:bg-card">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide dark:text-slate-400">
        <Scissors className="h-3.5 w-3.5" />
        {getCutModeTitle(partType)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {getCutDirectionOptions(partType).map(({ value, label }) => {
          const active = cutDirection === value
          return (
            <button
              key={value}
              type="button"
              onClick={() => setCutDirection(value)}
              className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-900/10 dark:text-blue-300"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700/70"
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
      <div className="mt-2 text-xs">{getCutModeDescription(partType)}</div>
    </div>
  )
}

function RequestedMaterialCard({
  isRect,
  requestedSqFt,
}: {
  isRect: boolean
  requestedSqFt: number
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:bg-card">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide dark:text-slate-400">
        <Scissors className="h-3.5 w-3.5" />
        Requested Material
      </div>
      <div className="mt-2 text-base font-semibold">{requestedSqFt.toFixed(2)} sq ft</div>
      <div className="mt-1 text-xs">
        {isRect
          ? "Based on the selected part shape and quantity."
          : "Based on the finished part shape. Non-rectangle cut sections do not multiply the finished area."}
      </div>
    </div>
  )
}
