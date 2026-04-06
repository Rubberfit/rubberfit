"use client"

import React from "react"
import { Package } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export interface StockConfig {
  width: number
  length: number
  material: string
  thickness: number
}

export const STOCK_PRESETS = [
  { id: "24x24", label: '24" × 24"', width: 24, length: 24 },
  { id: "36x36", label: '36" × 36"', width: 36, length: 36 },
  { id: "48x48", label: '48" × 48"', width: 48, length: 48 },
  { id: "48x96", label: '48" × 96"', width: 48, length: 96 },
  { id: "60x96", label: '60" × 96"', width: 60, length: 96 },
  { id: "72x120", label: '72" × 120"', width: 72, length: 120 },
  { id: "96x48", label: '96" × 48"', width: 96, length: 48 },
  { id: "96x120", label: '96" × 120"', width: 96, length: 120 },
  { id: "18x14", label: '18" × 14"', width: 18, length: 14 },
  { id: "24x50", label: '24" × 50"', width: 24, length: 50 },
  { id: "11-5x50", label: '11½" × 50"', width: 11.5, length: 50 },
  { id: "24x14", label: '24" × 14"', width: 24, length: 14 },
  { id: "24x40", label: '24" × 40"', width: 24, length: 40 },
  { id: "11-5x40", label: '11½" × 40"', width: 11.5, length: 40 },
  { id: "12x24", label: '12" × 24"', width: 12, length: 24 },
  { id: "11-5x12", label: '11½" × 12"', width: 11.5, length: 12 },
  { id: "56x12", label: '56" × 12"', width: 56, length: 12 },
  { id: "12x11-5", label: '12" × 11½"', width: 12, length: 11.5 },
  { id: "72x12", label: '72" × 12"', width: 72, length: 12 },
  { id: "38x24", label: '38" × 24"', width: 38, length: 24 },
  { id: "11-5x38", label: '11½" × 38"', width: 11.5, length: 38 },
  { id: "48x24", label: '48" × 24"', width: 48, length: 24 },
  { id: "48x11-5", label: '48" × 11½"', width: 48, length: 11.5 },
  { id: "40x12", label: '40" × 12"', width: 40, length: 12 },
  { id: "38x12", label: '38" × 12"', width: 38, length: 12 },
].sort((left, right) => {
  const leftArea = left.width * left.length
  const rightArea = right.width * right.length

  if (leftArea !== rightArea) {
    return leftArea - rightArea
  }

  const leftLongest = Math.max(left.width, left.length)
  const rightLongest = Math.max(right.width, right.length)
  if (leftLongest !== rightLongest) {
    return leftLongest - rightLongest
  }

  const leftShortest = Math.min(left.width, left.length)
  const rightShortest = Math.min(right.width, right.length)
  return leftShortest - rightShortest
})

import { formatInches } from "./nesting-layout-utils"
export { formatInches }

interface StockPreviewConfiguratorProps {
  activeStockPreset?: string
  stock: StockConfig
  onStockChange: React.Dispatch<React.SetStateAction<StockConfig>>
}

export function StockPreviewConfigurator({
  activeStockPreset,
  stock,
  onStockChange,
}: StockPreviewConfiguratorProps) {
  return (
    <Card className="border border-slate-200 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Package className="h-4 w-4 text-slate-500 dark:text-slate-300" />
          Stock Preview
        </CardTitle>
        <CardDescription>
          Pick the stock sheet before choosing cuts so the graph scores yield against the sheet you
          actually want to demo. The quick sets include the shop's common rubber sizes, and the
          manual fields let you override them when a sheet is not listed.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
          {STOCK_PRESETS.map((preset) => {
            const isActive = activeStockPreset === preset.id
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  onStockChange((previous) => ({
                    ...previous,
                    width: preset.width,
                    length: preset.length,
                  }))
                }
                className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-900/10 dark:text-blue-300"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700/70"
                }`}
              >
                {preset.label}
              </button>
            )
          })}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Width
            </div>
            <Input
              min={1}
              step="0.5"
              type="number"
              value={stock.width}
              onChange={(event) => {
                const nextValue = Number.parseFloat(event.target.value)
                onStockChange((previous) => ({
                  ...previous,
                  width: Number.isFinite(nextValue) && nextValue > 0 ? nextValue : previous.width,
                }))
              }}
            />
          </div>
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Length
            </div>
            <Input
              min={1}
              step="0.5"
              type="number"
              value={stock.length}
              onChange={(event) => {
                const nextValue = Number.parseFloat(event.target.value)
                onStockChange((previous) => ({
                  ...previous,
                  length: Number.isFinite(nextValue) && nextValue > 0 ? nextValue : previous.length,
                }))
              }}
            />
          </div>
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Thickness
            </div>
            <Input
              min={0.0625}
              step="0.0625"
              type="number"
              value={stock.thickness}
              onChange={(event) => {
                const nextValue = Number.parseFloat(event.target.value)
                onStockChange((previous) => ({
                  ...previous,
                  thickness:
                    Number.isFinite(nextValue) && nextValue > 0 ? nextValue : previous.thickness,
                }))
              }}
            />
          </div>
        </div>

        <div className="text-xs text-slate-600">
          {stock.material} · {formatInches(stock.width)}" × {formatInches(stock.length)}" preview
          sheet
        </div>
      </CardContent>
    </Card>
  )
}
