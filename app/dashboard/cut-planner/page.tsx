"use client"

import { useMemo, useState, useCallback } from "react"
import Link from "next/link"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { FileUp, Ruler, Shapes, X } from "lucide-react"
import NestingVisualizer from "./_components/NestingVisualizer"
import PresetDimensionSelector, { type PartTemplate } from "./_components/PresetDimensionSelector"
import CutListUpload from "./_components/cut-list-upload"
import type { ExtractedPart } from "./_components/upload-types"
import type { SimpleCutDirection } from "./_components/NestingVisualizer"
import {
  StockPreviewConfigurator,
  STOCK_PRESETS,
  type StockConfig,
} from "./_components/stock-preview-configurator"
import { CutConfigCard } from "./_components/cut-config-card"
import {
  getRequestedSqFt,
  getDefaultCutDirection,
  parseCutRatios,
} from "./_components/cut-planner-utils"

const DEMO_STOCK: StockConfig = {
  width: 96,
  length: 48,
  material: "Natural Rubber",
  thickness: 0.5,
}

function LayoutLabel() {
  return <Ruler className="h-4 w-4 text-slate-500" />
}

// eslint-disable-next-line max-lines-per-function
export default function CutPlannerPage() {
  const [presetParts, setPresetParts] = useState<PartTemplate[]>([])
  const [uploadedParts, setUploadedParts] = useState<PartTemplate[]>([])
  const [quantity, setQuantity] = useState(1)
  const [cutDirection, setCutDirection] = useState<SimpleCutDirection>("vertical_split")
  const [customCutRatioInput, setCustomCutRatioInput] = useState("")
  const [stock, setStock] = useState(DEMO_STOCK)

  const selectedTemplates = useMemo(
    () => [...uploadedParts, ...presetParts],
    [uploadedParts, presetParts]
  )
  const selectedTemplate = selectedTemplates[0] ?? null

  const requestedSqFt = useMemo(
    () => getRequestedSqFt(selectedTemplates, quantity),
    [quantity, selectedTemplates]
  )

  const tagMap = useMemo(() => {
    const labels = [...new Set(selectedTemplates.map((t) => t.label))]
    return new Map(
      labels.map((label, i) => {
        let tag = ""
        let n = i
        do {
          tag = String.fromCharCode(65 + (n % 26)) + tag
          n = Math.floor(n / 26) - 1
        } while (n >= 0)
        return [label, tag]
      })
    )
  }, [selectedTemplates])

  const handleTemplateApply = useCallback((templates: PartTemplate[]) => {
    setPresetParts(templates)
    setQuantity((previous) => Math.max(1, previous))
    setCutDirection(getDefaultCutDirection(templates[0]?.partType ?? "rectangle"))
    setCustomCutRatioInput("")
  }, [])

  const handleUploadedParts = (parts: ExtractedPart[], stockWidth?: number) => {
    const uploaded: PartTemplate[] = parts.map((p, i) => ({
      id: `uploaded-${Date.now()}-${i}`,
      partType: "rectangle" as const,
      label: `${p.width}" × ${p.length}"`,
      summary: p.partNumber ? `Uploaded: ${p.partNumber}` : "Uploaded dimension",
      quantity: p.quantity,
      category: "custom" as const,
      width: p.width,
      length: p.length,
      isCustom: true,
    }))
    setUploadedParts((prev) => [...prev, ...uploaded])

    if (stockWidth && stockWidth > 0) {
      setStock((prev) => ({ ...prev, width: stockWidth }))
    }
  }

  const removeUploadedPart = (id: string) => {
    setUploadedParts((prev) => prev.filter((p) => p.id !== id))
  }

  const clearUploadedParts = () => {
    setUploadedParts([])
  }

  const safeQuantity = Math.max(1, Number.isFinite(quantity) ? quantity : 1)
  const customCutRatios = useMemo(
    () => parseCutRatios(customCutRatioInput, safeQuantity),
    [customCutRatioInput, safeQuantity]
  )
  const activeStockPreset = STOCK_PRESETS.find(
    (preset) => preset.width === stock.width && preset.length === stock.length
  )?.id

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Badge variant="outline" className="w-fit">
            Cut Planner
          </Badge>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-300">
              Cut Planner
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Select a finished profile, choose the standard size, set the cut count, and preview
              the nested cut sheet for rectangles, strips, wraps, spreads, and panel layouts.
            </p>
          </div>
        </div>

        <Button asChild variant="outline">
          <Link href="/dashboard/cut-planner/batch">Batch Mode</Link>
        </Button>
      </div>

      <CutListUpload onPartsConfirmed={handleUploadedParts} />

      {uploadedParts.length > 0 && (
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <FileUp className="h-4 w-4 text-blue-500" />
                Uploaded Parts
                <Badge variant="secondary" className="ml-1 text-xs">
                  {uploadedParts.reduce((sum, p) => sum + p.quantity, 0)} cuts
                </Badge>
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearUploadedParts}
                className="h-7 text-xs text-muted-foreground hover:text-destructive"
              >
                <X className="mr-1 h-3 w-3" />
                Clear All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {uploadedParts.map((part) => {
                const tag = tagMap.get(part.label)
                return (
                  <div
                    key={part.id}
                    className="group flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 pl-1 pr-2 py-1 text-xs transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
                  >
                    {tag && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-white dark:bg-slate-200 dark:text-slate-800">
                        {tag}
                      </span>
                    )}
                    <span className="font-medium">{part.label}</span>
                    {part.quantity > 1 && (
                      <span className="text-muted-foreground">qty {part.quantity}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeUploadedPart(part.id)}
                      className="ml-0.5 rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Remove part"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <StockPreviewConfigurator
        activeStockPreset={activeStockPreset}
        stock={stock}
        onStockChange={setStock}
      />

      <PresetDimensionSelector
        onApply={handleTemplateApply}
        rollWidth={stock.width}
        rollLength={stock.length}
        tagMap={tagMap}
      />

      {selectedTemplates.length > 0 && selectedTemplate ? (
        <>
          <CutConfigCard
            selectedTemplate={selectedTemplate}
            selectedTemplates={selectedTemplates}
            safeQuantity={safeQuantity}
            quantity={quantity}
            setQuantity={setQuantity}
            cutDirection={cutDirection}
            setCutDirection={setCutDirection}
            customCutRatioInput={customCutRatioInput}
            setCustomCutRatioInput={setCustomCutRatioInput}
            customCutRatios={customCutRatios}
            requestedSqFt={requestedSqFt}
          />

          <Card className="border border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <LayoutLabel />
                4. Graph
              </CardTitle>
              <CardDescription>
                The graph starts from rectangular stock and shows the actual cut pieces placed on
                that stock, with reusable offcut in amber and waste in red.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <NestingVisualizer
                defaultRollWidth={stock.width}
                defaultRollLength={stock.length}
                defaultCutWidth={selectedTemplate.width ?? selectedTemplate.diameter ?? 24}
                defaultCutHeight={selectedTemplate.length ?? selectedTemplate.height ?? 24}
                defaultQty={safeQuantity}
                simpleMode
                simpleParts={selectedTemplates.map((template) => ({
                  partType: template.partType,
                  quantity: template.isCustom ? template.quantity : safeQuantity,
                  cutDirection,
                  cutRatios: customCutRatios,
                  width: template.width,
                  length: template.length,
                  diameter: template.diameter,
                  height: template.height,
                  topWidth: template.topWidth,
                  bottomWidth: template.bottomWidth,
                  innerRadius: template.innerRadius,
                  outerRadius: template.outerRadius,
                  arcDegrees: template.arcDegrees,
                }))}
                simplePart={{
                  partType: selectedTemplate.partType,
                  quantity: safeQuantity,
                  cutDirection,
                  cutRatios: customCutRatios,
                  width: selectedTemplate.width,
                  length: selectedTemplate.length,
                  diameter: selectedTemplate.diameter,
                  height: selectedTemplate.height,
                  topWidth: selectedTemplate.topWidth,
                  bottomWidth: selectedTemplate.bottomWidth,
                  innerRadius: selectedTemplate.innerRadius,
                  outerRadius: selectedTemplate.outerRadius,
                  arcDegrees: selectedTemplate.arcDegrees,
                }}
              />
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="border border-dashed border-slate-300 bg-slate-50/60 shadow-sm dark:bg-slate-700/50">
          <CardContent className="flex min-h-40 flex-col items-center justify-center gap-2 py-10 text-center">
            <Shapes className="h-6 w-6 text-slate-400" />
            <div className="text-base font-semibold text-slate-900 dark:text-slate-300">
              Choose a part type and standard size
            </div>
            <div className="max-w-xl text-sm text-slate-600 dark:text-slate-400">
              Start with the part selection above. Once a standard size is picked, the amount of
              cuts and graph preview will appear underneath.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
