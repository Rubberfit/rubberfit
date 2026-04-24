"use client"

import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"
import type { StockConfig } from "./stock-preview-configurator"

interface FreeRoamStockEditorProps {
  stock: StockConfig
  onChange: (stock: StockConfig) => void
}

/**
 * W × L × T inputs for the Free-roam stock. Inches only (matches the
 * rest of the surface). Values clamped client-side to positive numbers;
 * the parent refreshes its canvas + placements via its own state.
 *
 * Kept deliberately minimal — material / preset pickers live on the
 * Auto-nest stock configurator; Free-roam's operator already knows the
 * sheet they're holding, they just need to tell the canvas.
 */
export function FreeRoamStockEditor({ stock, onChange }: FreeRoamStockEditorProps) {
  const handleField = (field: "width" | "length" | "thickness", raw: string) => {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    onChange({ ...stock, [field]: parsed })
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="space-y-1">
        <Label htmlFor="free-roam-stock-width" className="text-[11px] text-muted-foreground">
          Width (in)
        </Label>
        <Input
          id="free-roam-stock-width"
          type="number"
          inputMode="decimal"
          min={1}
          step={0.25}
          value={stock.width}
          onChange={(e) => handleField("width", e.target.value)}
          className="h-8 text-xs"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="free-roam-stock-length" className="text-[11px] text-muted-foreground">
          Length (in)
        </Label>
        <Input
          id="free-roam-stock-length"
          type="number"
          inputMode="decimal"
          min={1}
          step={0.25}
          value={stock.length}
          onChange={(e) => handleField("length", e.target.value)}
          className="h-8 text-xs"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="free-roam-stock-thickness" className="text-[11px] text-muted-foreground">
          Thk (in)
        </Label>
        <Input
          id="free-roam-stock-thickness"
          type="number"
          inputMode="decimal"
          min={0.0625}
          step={0.0625}
          value={stock.thickness}
          onChange={(e) => handleField("thickness", e.target.value)}
          className="h-8 text-xs"
        />
      </div>
    </div>
  )
}
