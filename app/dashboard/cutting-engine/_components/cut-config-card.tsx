import { Scissors, Shapes, Ruler } from "lucide-react"
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
  // Group templates by shape type so the Part card can summarise
  // mixed-shape selections (e.g. rectangles + cones) instead of
  // surfacing only the first template's shape.
  const partCounts = new Map<PartTemplate["partType"], number>()
  for (const template of selectedTemplates) {
    const qty = Math.max(1, template.quantity ?? 1)
    partCounts.set(template.partType, (partCounts.get(template.partType) ?? 0) + qty)
  }
  const partGroups = Array.from(partCounts.entries())
  const totalParts = partGroups.reduce((sum, [, qty]) => sum + qty, 0)
  const isMultiShape = partGroups.length > 1

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

      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:bg-card">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide dark:text-slate-400">
              <Shapes className="h-3.5 w-3.5" />
              Part
            </div>
            {isMultiShape ? (
              <>
                <ul className="mt-2 space-y-0.5 text-sm font-semibold">
                  {partGroups.map(([shape, qty]) => (
                    <li key={shape}>{`${qty} \u00D7 ${getPartLabel(shape)}`}</li>
                  ))}
                </ul>
                <div className="mt-1.5 text-xs text-muted-foreground">
                  {totalParts} parts total
                </div>
              </>
            ) : (
              <>
                <div className="mt-2 text-base font-semibold">
                  {getPartLabel(selectedTemplate.partType)}
                  {selectedTemplates.length > 1 ? ` \u00B7 ${selectedTemplates.length} sizes` : ""}
                </div>
                <div className="mt-1 text-xs">{selectedTemplate.summary}</div>
              </>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4  dark:bg-card">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide dark:text-slate-400">
              <Ruler className="h-3.5 w-3.5" />
              Size Selection
            </div>
            {selectedTemplates.length === 1 ? (
              <>
                <div className="mt-2 text-base font-semibold">{selectedTemplate.label}</div>
                <div className="mt-1 text-xs">Standard size from the template list.</div>
              </>
            ) : (
              <>
                <ul className="mt-2 space-y-0.5 text-sm font-semibold">
                  {selectedTemplates.map((template) => (
                    <li key={template.id} className="truncate">
                      {template.label}
                    </li>
                  ))}
                </ul>
                <div className="mt-1.5 text-xs text-muted-foreground">
                  {selectedTemplates.length} sizes
                </div>
              </>
            )}
          </div>

          {selectedTemplate.partType !== "rectangle" && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:bg-card ">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide dark:text-slate-400  ">
                <Scissors className="h-3.5 w-3.5" />
                {getCutModeTitle(selectedTemplate.partType)}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 ">
                {getCutDirectionOptions(selectedTemplate.partType).map(({ value, label }) => {
                  const direction = value
                  const active = cutDirection === direction
                  return (
                    <button
                      key={direction}
                      type="button"
                      onClick={() => setCutDirection(direction)}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-900/10 dark:text-blue-300 "
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700/70"
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              <div className="mt-2 text-xs ">
                {getCutModeDescription(selectedTemplate.partType)}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:bg-card ">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide dark:text-slate-400">
              <Scissors className="h-3.5 w-3.5" />
              Requested Material
            </div>
            <div className="mt-2 text-base font-semibold">{requestedSqFt.toFixed(2)} sq ft</div>
            <div className="mt-1 text-xs">
              {selectedTemplate.partType === "rectangle"
                ? "Based on the selected part shape and quantity."
                : "Based on the finished part shape. Non-rectangle cut sections do not multiply the finished area."}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
