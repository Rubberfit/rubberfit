"use client"

import React, { useMemo, useState, useCallback } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { FileUp, Layers3, Ruler, Scissors, Shapes, X } from "lucide-react"
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

const DEMO_STOCK: StockConfig = {
  width: 96,
  length: 48,
  material: "Natural Rubber",
  thickness: 0.5,
}

function getPartLabel(partType: PartTemplate["partType"]) {
  switch (partType) {
    case "circle":
      return "Circle"
    case "cylinder":
      return "Cylinder Wrap"
    case "cone":
      return "Cone Spread"
    case "trapezoid":
      return "Hopper / Transition Panel"
    case "rectangle":
    default:
      return "Rectangle / Strip"
  }
}

function getRequestedSqFt(templates: PartTemplate[], quantity: number) {
  if (templates.length === 0) {
    return 0
  }

  return templates.reduce((total, template) => {
    const qty = template.isCustom
      ? template.quantity
      : template.partType === "rectangle"
        ? Math.max(1, quantity)
        : 1
    switch (template.partType) {
      case "circle": {
        const radius = (template.diameter ?? 0) / 2
        return total + (Math.PI * radius * radius * qty) / 144
      }
      case "cylinder": {
        const diameter = template.diameter ?? 0
        const height = template.height ?? 0
        return total + (Math.PI * diameter * height * qty) / 144
      }
      case "cone": {
        const innerRadius = template.innerRadius ?? 0
        const outerRadius = template.outerRadius ?? 0
        const arcDegrees = template.arcDegrees ?? 0
        return (
          total + ((arcDegrees / 360) * Math.PI * (outerRadius ** 2 - innerRadius ** 2) * qty) / 144
        )
      }
      case "trapezoid": {
        const topWidth = template.topWidth ?? 0
        const bottomWidth = template.bottomWidth ?? 0
        const height = template.height ?? 0
        return total + (((topWidth + bottomWidth) / 2) * height * qty) / 144
      }
      case "rectangle":
      default:
        return total + ((template.width ?? 0) * (template.length ?? 0) * qty) / 144
    }
  }, 0)
}

function getDefaultCutDirection(partType: PartTemplate["partType"]): SimpleCutDirection {
  switch (partType) {
    case "cone":
      return "radial_split"
    case "cylinder":
      return "wrap_panels"
    case "trapezoid":
      return "vertical_split"
    default:
      return "vertical_split"
  }
}

function getCutDirectionOptions(partType: PartTemplate["partType"]) {
  switch (partType) {
    case "cone":
      return [
        { value: "radial_split" as const, label: "Radial Panels" },
        { value: "arc_bands" as const, label: "Concentric Bands" },
      ]
    case "cylinder":
      return [
        { value: "wrap_panels" as const, label: "Wrap Panels" },
        { value: "wrap_bands" as const, label: "Horizontal Bands" },
      ]
    case "trapezoid":
      return [
        { value: "vertical_split" as const, label: "Vertical Panels" },
        { value: "horizontal_split" as const, label: "Horizontal Bands" },
      ]
    default:
      return [
        { value: "vertical_split" as const, label: "Vertical Split" },
        { value: "horizontal_split" as const, label: "Horizontal Split" },
      ]
  }
}

function getCutModeTitle(partType: PartTemplate["partType"]) {
  switch (partType) {
    case "cone":
      return "Cone Split Mode"
    case "cylinder":
      return "Wrap Split Mode"
    case "trapezoid":
      return "Panel Split Mode"
    default:
      return "Split Mode"
  }
}

function getCutModeDescription(partType: PartTemplate["partType"]) {
  switch (partType) {
    case "cone":
      return "Choose whether the cone spread is divided into radial panels or concentric arc bands."
    case "cylinder":
      return "Choose whether the wrap is split into vertical wrap panels or horizontal bands."
    case "trapezoid":
      return "Choose whether the tapered panel is split into vertical panels or horizontal bands."
    default:
      return "Choose how the finished profile is broken into smaller cut sections."
  }
}

function parseCutRatios(input: string, count: number) {
  if (count <= 1) {
    return undefined
  }

  const trimmed = input.trim()
  if (!trimmed) {
    return undefined
  }

  const values = trimmed.split(",").map((value) => Number.parseFloat(value.trim()))
  if (values.length !== count || values.some((value) => !Number.isFinite(value) || value <= 0)) {
    return undefined
  }

  return values
}

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
    return new Map(labels.map((label, i) => [label, String.fromCharCode(65 + i)]))
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

function LayoutLabel() {
  return <Ruler className="h-4 w-4 text-slate-500" />
}

function CutConfigCard({
  selectedTemplate,
  selectedTemplates,
  safeQuantity,
  quantity: _quantity,
  setQuantity,
  cutDirection,
  setCutDirection,
  customCutRatioInput,
  setCustomCutRatioInput,
  customCutRatios,
  requestedSqFt,
}: {
  selectedTemplate: PartTemplate
  selectedTemplates: PartTemplate[]
  safeQuantity: number
  quantity: number
  setQuantity: (v: number) => void
  cutDirection: SimpleCutDirection
  setCutDirection: (v: SimpleCutDirection) => void
  customCutRatioInput: string
  setCustomCutRatioInput: (v: string) => void
  customCutRatios: number[] | undefined
  requestedSqFt: number
}) {
  return (
    <Card className="border border-slate-200 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Scissors className="h-4 w-4" />
          3. Amount of Cuts
        </CardTitle>
        <CardDescription>
          {selectedTemplate.partType === "rectangle"
            ? "The selected part template drives the profile. Adjust how many finished parts you want to cut from stock."
            : "The selected part template drives the profile. Adjust how many cut sections should be used to build the finished shape."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:bg-card">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide dark:text-slate-400">
              <Shapes className="h-3.5 w-3.5" />
              Part
            </div>
            <div className="mt-2 text-base font-semibold">
              {getPartLabel(selectedTemplate.partType)}
              {selectedTemplates.length > 1 ? ` \u00B7 ${selectedTemplates.length} sizes` : ""}
            </div>
            <div className="mt-1 text-xs">{selectedTemplate.summary}</div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4  dark:bg-card">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide dark:text-slate-400">
              <Ruler className="h-3.5 w-3.5" />
              Size Selection
            </div>
            <div className="mt-2 text-base font-semibold">
              {selectedTemplates.length === 1
                ? selectedTemplate.label
                : `${selectedTemplate.label} + ${selectedTemplates.length - 1} more`}
            </div>
            <div className="mt-1 text-xs">
              {selectedTemplates.length === 1
                ? "Standard size from the template list."
                : "The graph stacks every selected standard size in the preview."}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4  dark:bg-card ">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide dark:text-slate-400">
              <Layers3 className="h-3.5 w-3.5" />
              Amount of Cuts
            </div>
            <div className="mt-3">
              <Input
                min={1}
                type="number"
                value={safeQuantity}
                onChange={(event) => {
                  const nextValue = Number.parseInt(event.target.value, 10)
                  setQuantity(Number.isFinite(nextValue) && nextValue > 0 ? nextValue : 1)
                }}
              />
            </div>
            <div className="mt-2 text-xs dark:bg-card ">
              {selectedTemplate.partType === "rectangle"
                ? selectedTemplates.length > 1
                  ? "Repeat count applied to each selected size."
                  : "Total finished parts to nest on the sheet."
                : "Total cut sections to generate from rectangular stock for the finished profile."}
            </div>
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

          {selectedTemplate.partType !== "rectangle" && safeQuantity > 1 && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 xl:col-span-2 dark:bg-card">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide  ">
                <Scissors className="h-3.5 w-3.5" />
                Custom Cut Sizes
              </div>
              <div className="mt-3">
                <Input
                  type="text"
                  value={customCutRatioInput}
                  onChange={(event) => setCustomCutRatioInput(event.target.value)}
                  placeholder={Array.from({ length: safeQuantity }, () => "1").join(", ")}
                />
              </div>
              <div className="mt-2 text-xs text-slate-600 dark:text-slate-100">
                Optional. Enter {safeQuantity} comma-separated weights like{" "}
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {Array.from({ length: safeQuantity }, (_, index) =>
                    index === safeQuantity - 1 ? "2" : "1"
                  ).join(", ")}
                </span>{" "}
                to make some cut sections larger than others.
              </div>
              {customCutRatioInput.trim() && !customCutRatios && (
                <div className="mt-2 text-xs font-medium text-amber-700">
                  Enter exactly {safeQuantity} positive numbers to customize the cut sizes. Leaving
                  it blank keeps the cuts even.
                </div>
              )}
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
